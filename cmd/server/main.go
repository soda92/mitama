// Command server serves the Mitama web player.
//
// It exposes extracted Ciel ARCANA data under /media and a small JSON API
// under /api. Run cmd/extract first to populate ./data.
package main

import (
	"encoding/json"
	"flag"
	"log"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"mitama/pkg/script"
)

type server struct {
	dataDir      string
	webDir       string
	audio        *audioCache
	debug        *debugStore
	archives     *archiveStore
	translations *translationStore
	storyMu      sync.Mutex
	storyMaps    map[string]*storyMapData
}

func main() {
	data := flag.String("data", "./data", "extracted data directory")
	web := flag.String("web", "./web-app/dist", "built frontend directory")
	addr := flag.String("addr", ":8080", "listen address")
	dbPath := flag.String("db", "", "SQLite archive database (default <data>/mitama-saves.db)")
	dev := flag.Bool("dev", false, "proxy frontend requests to the Vite dev server")
	viteAddr := flag.String("vite", "http://localhost:5173", "Vite dev server URL for -dev")
	flag.Parse()

	archivePath := *dbPath
	if archivePath == "" {
		archivePath = filepath.Join(*data, "mitama-saves.db")
	}
	archives, err := openArchiveStore(archivePath)
	if err != nil {
		log.Fatalf("archive database: %v", err)
	}
	s := &server{
		dataDir:      *data,
		webDir:       *web,
		audio:        newAudioCache(128 << 20),
		debug:        newDebugStore(),
		archives:     archives,
		translations: newTranslationStore(*data),
		storyMaps:    map[string]*storyMapData{},
	}
	mux := http.NewServeMux()
	mux.HandleFunc("/api/packs", s.handlePacks)
	mux.HandleFunc("/api/script", s.handleScript)
	mux.HandleFunc("/api/assets", s.handleAssets)
	mux.HandleFunc("/api/battle", s.handleBattle)
	mux.HandleFunc("/api/battle/character", s.handleBattleCharacter)
	mux.HandleFunc("/api/battle/effect", s.handleBattleEffect)
	mux.HandleFunc("/api/gallery", s.handleGallery)
	mux.HandleFunc("/api/storymap", s.handleStoryMap)
	mux.HandleFunc("/api/audio", s.handleAudio)
	mux.HandleFunc("/api/debug", s.handleDebug)
	mux.HandleFunc("/api/debug/state", s.handleDebugState)
	mux.HandleFunc("GET /api/archives", s.handleArchiveList)
	mux.HandleFunc("PUT /api/archives/{id}", s.handleArchivePut)
	mux.HandleFunc("DELETE /api/archives/{id}", s.handleArchiveDelete)
	mux.Handle("/media/", http.StripPrefix("/media/", http.FileServer(http.Dir(*data))))

	if *dev {
		target, err := url.Parse(*viteAddr)
		if err != nil || target.Scheme == "" || target.Host == "" {
			log.Fatalf("invalid -vite URL %q", *viteAddr)
		}
		proxy := httputil.NewSingleHostReverseProxy(target)
		proxy.FlushInterval = -1
		proxy.ErrorHandler = func(w http.ResponseWriter, r *http.Request, err error) {
			log.Printf("vite proxy: %v", err)
			http.Error(w, "Vite dev server is not reachable at "+target.String(), http.StatusBadGateway)
		}
		mux.Handle("/", proxy)
		log.Printf("mitama: serving %s with Vite dev proxy %s on %s", *data, target.String(), *addr)
	} else {
		mux.Handle("/", http.FileServer(http.Dir(*web)))
		log.Printf("mitama: serving %s on %s", *data, *addr)
	}
	if err := http.ListenAndServe(*addr, logRequests(mux)); err != nil {
		log.Fatal(err)
	}
}

type pack struct {
	ID          string `json:"id"`
	Title       string `json:"title"`
	Script      string `json:"script,omitempty"`
	StartScript string `json:"startScript,omitempty"`
	Root        string `json:"root"`
	HasVoice    bool   `json:"hasVoice"`
}

func (s *server) packs() []pack {
	var out []pack
	if st, err := os.Stat(filepath.Join(s.dataDir, "demo")); err == nil && st.IsDir() {
		p := pack{ID: "demo", Title: "御魂 ～忍～ 店頭デモ", Root: "demo"}
		if ini, err := os.ReadFile(filepath.Join(s.dataDir, "demo", "mitama.ini")); err == nil {
			p.Script = strings.TrimSpace(string(ini))
		}
		if p.Script == "" {
			p.Script = "mitamademo.txt"
		}
		out = append(out, p)
	}
	if st, err := os.Stat(filepath.Join(s.dataDir, "dvd")); err == nil && st.IsDir() {
		out = append(out, pack{
			ID:          "dvd",
			Title:       "御魂 ～忍～ DVD-ROM版",
			StartScript: "yr1_00.txt",
			Root:        "dvd",
		})
	}
	if st, err := os.Stat(filepath.Join(s.dataDir, "disc")); err == nil && st.IsDir() {
		out = append(out, pack{ID: "disc", Title: "御魂 ～忍～ 音声ディスク", Root: "disc", HasVoice: true})
	}
	return out
}

func (s *server) handlePacks(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, map[string]any{"packs": s.packs()})
}

func (s *server) handleScript(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Query().Get("pack")
	if id == "" {
		id = "demo"
	}
	var p *pack
	for _, candidate := range s.packs() {
		if candidate.ID == id {
			c := candidate
			p = &c
			break
		}
	}
	if p == nil {
		http.Error(w, "pack not found", http.StatusNotFound)
		return
	}
	name := r.URL.Query().Get("name")
	path := ""
	if name != "" {
		name = strings.TrimSpace(name)
		name = strings.ReplaceAll(name, "\\", "/")
		name = filepath.Base(name)
		if !strings.HasSuffix(strings.ToLower(name), ".txt") {
			name += ".txt"
		}
		path = filepath.Join(s.dataDir, p.Root, "text", name)
	} else if p.StartScript != "" {
		path = filepath.Join(s.dataDir, p.Root, "text", p.StartScript)
	} else if p.Script != "" {
		path = filepath.Join(s.dataDir, p.Root, p.Script)
	}
	if path == "" {
		http.Error(w, "no script for pack", http.StatusNotFound)
		return
	}
	path, err := findFileInsensitive(filepath.Dir(path), filepath.Base(path))
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}
	f, err := os.Open(path)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}
	defer f.Close()
	sc, err := script.Parse(f)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	scene := strings.TrimSuffix(filepath.Base(path), filepath.Ext(path))
	s.translations.apply(p.Root, scene, sc)
	writeJSON(w, sc)
}

func (s *server) handleAssets(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Query().Get("pack")
	if id == "" {
		id = "demo"
	}
	root := filepath.Join(s.dataDir, id)
	res := map[string]any{
		"game": map[string]string{},
		"hd":   map[string]string{},
		"bgm":  map[string]string{},
		"se":   map[string]string{},
		"text": map[string]string{},
	}
	add := func(kind, rel string) {
		name := filepath.Base(rel)
		base := strings.TrimSuffix(name, filepath.Ext(name))
		key := strings.ToLower(base)
		index, ok := res[kind].(map[string]string)
		if !ok {
			index = map[string]string{}
			res[kind] = index
		}
		if _, exists := index[key]; !exists {
			index[key] = filepath.ToSlash(rel)
		}
	}

	if id == "demo" {
		for _, sub := range []string{"game", "bgm", "se", "text"} {
			files, err := os.ReadDir(filepath.Join(root, sub))
			if err != nil {
				continue
			}
			for _, f := range files {
				if !f.IsDir() {
					add(sub, filepath.Join(sub, f.Name()))
				}
			}
		}
	} else {
		_ = filepath.Walk(root, func(path string, info os.FileInfo, err error) error {
			if err != nil || info.IsDir() {
				return nil
			}
			rel, err := filepath.Rel(root, path)
			if err != nil {
				return nil
			}
			top := strings.Split(filepath.ToSlash(rel), "/")[0]
			switch strings.ToLower(filepath.Ext(path)) {
			case ".bmp":
				add("game", rel)
			case ".txt":
				add("text", rel)
			case ".xa", ".wav":
				if top == "bgm" {
					add("bgm", rel)
				} else {
					add("se", rel)
				}
			}
			return nil
		})
		for _, layer := range []struct {
			dir   string
			key   string
			scale int
		}{
			{"hd", "hdScale", 2},
			{"hd4", "hd4Scale", 4},
		} {
			layerRoot := filepath.Join(root, layer.dir)
			scale := layer.scale
			if raw, err := os.ReadFile(filepath.Join(layerRoot, "scale.json")); err == nil {
				var meta struct {
					Scale int `json:"scale"`
				}
				if json.Unmarshal(raw, &meta) == nil && meta.Scale > 1 {
					scale = meta.Scale
				}
			}
			res[layer.key] = scale
			_ = filepath.Walk(layerRoot, func(path string, info os.FileInfo, err error) error {
				if err != nil || info.IsDir() {
					return nil
				}
				rel, err := filepath.Rel(layerRoot, path)
				if err != nil {
					return nil
				}
				switch strings.ToLower(filepath.Ext(path)) {
				case ".png", ".bmp":
					add(layer.dir, filepath.Join(layer.dir, rel))
				}
				return nil
			})
		}
	}
	writeJSON(w, res)
}

// findFileInsensitive resolves a file inside dir ignoring case. The scripts
// use uppercase LOD targets (YR1_02) while the extracted files are lowercase.
func findFileInsensitive(dir, name string) (string, error) {
	p := filepath.Join(dir, name)
	if _, err := os.Stat(p); err == nil {
		return p, nil
	}
	entries, err := os.ReadDir(dir)
	if err != nil {
		return "", err
	}
	for _, e := range entries {
		if !e.IsDir() && strings.EqualFold(e.Name(), name) {
			return filepath.Join(dir, e.Name()), nil
		}
	}
	return "", os.ErrNotExist
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	if err := json.NewEncoder(w).Encode(v); err != nil {
		log.Printf("json: %v", err)
	}
}

func logRequests(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/media/") {
			w.Header().Set("Cache-Control", "public, max-age=86400")
		}
		lw := &loggingWriter{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(lw, r)
		if lw.status >= http.StatusBadRequest {
			log.Printf("%d %s", lw.status, r.URL.Path)
		}
	})
}

type loggingWriter struct {
	http.ResponseWriter
	status int
}

func (w *loggingWriter) WriteHeader(code int) {
	w.status = code
	w.ResponseWriter.WriteHeader(code)
}

func (w *loggingWriter) Write(b []byte) (int, error) {
	return w.ResponseWriter.Write(b)
}

func init() {
	log.SetFlags(log.Ltime)
}
