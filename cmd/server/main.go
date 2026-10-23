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
	"os"
	"path/filepath"
	"sort"
	"strings"

	"mitama/pkg/script"
)

type server struct {
	dataDir string
	webDir  string
}

func main() {
	data := flag.String("data", "./data", "extracted data directory")
	web := flag.String("web", "./web-app/dist", "built frontend directory")
	addr := flag.String("addr", ":8080", "listen address")
	flag.Parse()

	s := &server{dataDir: *data, webDir: *web}
	mux := http.NewServeMux()
	mux.HandleFunc("/api/packs", s.handlePacks)
	mux.HandleFunc("/api/script", s.handleScript)
	mux.HandleFunc("/api/assets", s.handleAssets)
	mux.Handle("/media/", http.StripPrefix("/media/", http.FileServer(http.Dir(*data))))
	mux.Handle("/", http.FileServer(http.Dir(*web)))

	log.Printf("mitama: serving %s on %s", *data, *addr)
	if err := http.ListenAndServe(*addr, logRequests(mux)); err != nil {
		log.Fatal(err)
	}
}

type pack struct {
	ID       string `json:"id"`
	Title    string `json:"title"`
	Script   string `json:"script,omitempty"`
	Root     string `json:"root"`
	HasVoice bool   `json:"hasVoice"`
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
	if p == nil || p.Script == "" {
		http.Error(w, "pack not found", http.StatusNotFound)
		return
	}
	f, err := os.Open(filepath.Join(s.dataDir, p.Root, p.Script))
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
	writeJSON(w, sc)
}

func (s *server) handleAssets(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Query().Get("pack")
	if id == "" {
		id = "demo"
	}
	root := filepath.Join(s.dataDir, id)
	res := map[string]map[string]string{}
	for _, sub := range []string{"game", "bgm", "se", "text"} {
		files, err := os.ReadDir(filepath.Join(root, sub))
		if err != nil {
			continue
		}
		m := map[string]string{}
		var names []string
		for _, f := range files {
			if f.IsDir() {
				continue
			}
			names = append(names, f.Name())
			base := strings.TrimSuffix(f.Name(), filepath.Ext(f.Name()))
			m[strings.ToLower(base)] = sub + "/" + f.Name()
		}
		sort.Strings(names)
		res[sub] = m
	}
	writeJSON(w, res)
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
