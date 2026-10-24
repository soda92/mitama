package main

import (
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"

	"mitama/pkg/script"
)

type galleryPicture struct {
	Key      string   `json:"key"`
	Name     string   `json:"name"`
	Full     string   `json:"full"`
	Thumb    string   `json:"thumb,omitempty"`
	Variants []string `json:"variants"`
}

type galleryScene struct {
	Name    string `json:"name"`
	Title   string `json:"title"`
	Chapter string `json:"chapter"`
}

type galleryTrack struct {
	Name  string   `json:"name"`
	File  string   `json:"file"`
	Uses  []string `json:"uses"`
	Count int      `json:"count"`
}

type galleryData struct {
	Pictures []galleryPicture `json:"pictures"`
	Scenes   []galleryScene   `json:"scenes"`
	Music    []galleryTrack   `json:"music"`
}

var variantSuffix = regexp.MustCompile(`_[0-9]+$`)

func (s *server) handleGallery(w http.ResponseWriter, r *http.Request) {
	packID := r.URL.Query().Get("pack")
	if packID == "" {
		packID = "dvd"
	}
	packID = filepath.Base(packID)
	root := filepath.Join(s.dataDir, packID)
	out := galleryData{Pictures: []galleryPicture{}, Scenes: []galleryScene{}, Music: []galleryTrack{}}

	// CG files live in the mitama directory. The trailing "s" files are the
	// small gallery thumbnails; _1/_2 suffixes are variants of one CG.
	pictures := map[string]*galleryPicture{}
	_ = filepath.Walk(filepath.Join(root, "mitama"), func(path string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() {
			return nil
		}
		name := info.Name()
		lower := strings.ToLower(name)
		if !strings.HasPrefix(lower, "cg") || !strings.HasSuffix(lower, ".bmp") {
			return nil
		}
		data, err := os.ReadFile(path)
		if err != nil || len(data) < 2 || string(data[:2]) != "BM" {
			return nil
		}
		stem := strings.TrimSuffix(lower, ".bmp")
		isThumb := strings.HasSuffix(stem, "s")
		if isThumb {
			stem = strings.TrimSuffix(stem, "s")
		}
		key := variantSuffix.ReplaceAllString(stem, "")
		p := pictures[key]
		if p == nil {
			p = &galleryPicture{Key: key, Name: strings.ToUpper(key), Variants: []string{}}
			pictures[key] = p
		}
		rel, err := filepath.Rel(root, path)
		if err != nil {
			return nil
		}
		url := "/media/" + packID + "/" + filepath.ToSlash(rel)
		if isThumb {
			p.Thumb = url
		} else {
			p.Full = url
			p.Variants = append(p.Variants, url)
		}
		return nil
	})
	for _, p := range pictures {
		if p.Full == "" {
			if p.Thumb == "" {
				continue
			}
			p.Full = p.Thumb
			p.Thumb = ""
			p.Variants = []string{p.Full}
		}
		if p.Thumb == "" {
			p.Thumb = p.Full
		}
		sort.Strings(p.Variants)
		out.Pictures = append(out.Pictures, *p)
	}
	sort.Slice(out.Pictures, func(i, j int) bool { return out.Pictures[i].Key < out.Pictures[j].Key })

	// Scenes and BGM usage.
	music := map[string]*galleryTrack{}
	textDir := filepath.Join(root, "text")
	_ = filepath.Walk(textDir, func(path string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() || !strings.HasSuffix(strings.ToLower(info.Name()), ".txt") {
			return nil
		}
		name := strings.TrimSuffix(info.Name(), filepath.Ext(info.Name()))
		f, err := os.Open(path)
		if err != nil {
			return nil
		}
		sc, err := script.Parse(f)
		_ = f.Close()
		if err != nil {
			return nil
		}
		title := name
		for _, c := range sc.Commands {
			if c.Cmd == "STS" && len(c.Args) > 0 {
				title = c.Args[0]
				break
			}
		}
		chapter := name
		if i := strings.IndexAny(name, "_"); i > 0 {
			chapter = name[:i]
		}
		out.Scenes = append(out.Scenes, galleryScene{Name: name, Title: title, Chapter: chapter})
		for _, c := range sc.Commands {
			if c.Cmd != "MUS" || len(c.Args) == 0 || strings.EqualFold(c.Args[0], "STOP") {
				continue
			}
			key := strings.ToUpper(c.Args[0])
			t := music[key]
			if t == nil {
				rel := "bgm/" + c.Args[0] + ".xa"
				t = &galleryTrack{Name: key, File: rel}
				music[key] = t
			}
			t.Count++
			if len(t.Uses) < 8 && (len(t.Uses) == 0 || t.Uses[len(t.Uses)-1] != name) {
				t.Uses = append(t.Uses, name)
			}
		}
		return nil
	})
	bgmDir := filepath.Join(root, "bgm")
	if entries, err := os.ReadDir(bgmDir); err == nil {
		for _, entry := range entries {
			if entry.IsDir() || !strings.HasSuffix(strings.ToLower(entry.Name()), ".xa") {
				continue
			}
			stem := strings.TrimSuffix(entry.Name(), filepath.Ext(entry.Name()))
			key := strings.ToUpper(stem)
			if music[key] == nil {
				music[key] = &galleryTrack{Name: key, File: "bgm/" + entry.Name()}
			}
		}
	}
	sort.Slice(out.Scenes, func(i, j int) bool { return out.Scenes[i].Name < out.Scenes[j].Name })
	for _, t := range music {
		out.Music = append(out.Music, *t)
	}
	sort.Slice(out.Music, func(i, j int) bool { return out.Music[i].Name < out.Music[j].Name })
	writeJSON(w, out)
}
