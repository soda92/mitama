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

type galleryUse struct {
	Scene    string `json:"scene"`
	PC       int    `json:"pc"`
	Line     int    `json:"line,omitempty"`
	Speaker  string `json:"speaker,omitempty"`
	Dialogue string `json:"dialogue,omitempty"`
}

type galleryPicture struct {
	Key      string       `json:"key"`
	Name     string       `json:"name"`
	Full     string       `json:"full"`
	Thumb    string       `json:"thumb,omitempty"`
	Variants []string     `json:"variants"`
	Uses     []galleryUse `json:"uses"`
}

type galleryScene struct {
	Name    string `json:"name"`
	Title   string `json:"title"`
	Chapter string `json:"chapter"`
}

type galleryTrack struct {
	Name     string   `json:"name"`
	Title    string   `json:"title,omitempty"`
	Duration string   `json:"duration,omitempty"`
	File     string   `json:"file"`
	Uses     []string `json:"uses"`
	Count    int      `json:"count"`
}

// Official titles and durations recovered from the BGM table at 0x4a06dc
// (pointer pairs) and 0x4a07cc (S-filenames) in mitama_dvd.exe.
var bgmMeta = map[string]struct{ title, duration string }{
	"S001":   {"予兆", "1:22"},
	"S002":   {"御魂～忍～主題", "1:47"},
	"S003":   {"導かれし魂", "1:18"},
	"S004":   {"黒き刃の輝き", "1:44"},
	"S005":   {"倒すべき敵", "1:42"},
	"S006":   {"忍ならざる時", "1:41"},
	"S007":   {"束の間の休息", "1:20"},
	"S008":   {"呼び合う心", "1:23"},
	"S009":   {"信義", "0:38"},
	"S009_2": {"別れ", "1:02"},
	"S010":   {"忍", "1:14"},
	"S010_1": {"夜", "1:03"},
	"S011":   {"隠密", "1:02"},
	"S011_1": {"任務", "1:02"},
	"S012":   {"静から動へ", "1:24"},
	"S013":   {"迫り来る不安", "1:09"},
	"S014":   {"死に至る", "1:11"},
	"S015":   {"募る想い", "1:05"},
	"S016":   {"睦みごと", "1:10"},
	"S017":   {"嗜虐", "1:18"},
	"S018":   {"生と死と", "0:48"},
	"S018_1": {"血の滾り", "1:00"},
	"S018_2": {"高ぶる心", "0:24"},
	"S019":   {"荒ぶる魂", "1:42"},
	"S021":   {"幼き記憶", "1:11"},
	"S022":   {"忘却の過去", "1:40"},
	"S024":   {"人ならざるもの", "1:00"},
	"S025":   {"旅路", "1:19"},
	"S026":   {"一人生きる", "1:16"},
	"S027":   {"これから", "1:47"},
}

func applyBgmMeta(track *galleryTrack) {
	key := strings.ToUpper(track.Name)
	if meta, ok := bgmMeta[key]; ok {
		track.Title = meta.title
		track.Duration = meta.duration
		return
	}
	if i := strings.LastIndex(key, "_"); i > 0 {
		if meta, ok := bgmMeta[key[:i]]; ok {
			track.Title = meta.title + " (別Ver.)"
			track.Duration = ""
		}
	}
}

type galleryData struct {
	Pictures []galleryPicture `json:"pictures"`
	Scenes   []galleryScene   `json:"scenes"`
	Music    []galleryTrack   `json:"music"`
}

var variantSuffix = regexp.MustCompile(`_[0-9]+$`)

func galleryPictureKey(name string) string {
	name = strings.ToLower(strings.TrimSpace(name))
	name = strings.TrimSuffix(name, ".bmp")
	name = strings.TrimSuffix(name, "s")
	return variantSuffix.ReplaceAllString(name, "")
}

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
	}

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
		for i, c := range sc.Commands {
			if c.Cmd == "BMP" && len(c.Args) > 0 {
				key := galleryPictureKey(c.Args[0])
				if picture := pictures[key]; picture != nil {
					use := galleryUse{Scene: name, PC: i, Line: c.Line}
					for j := i + 1; j < len(sc.Commands) && j <= i+12; j++ {
						if sc.Commands[j].Cmd == "TEXT" {
							use.Speaker = sc.Commands[j].Speaker
							use.Dialogue = strings.ReplaceAll(sc.Commands[j].Message, "\n", " ")
							runes := []rune(use.Dialogue)
							if len(runes) > 80 {
								use.Dialogue = string(runes[:80])
							}
							break
						}
					}
					if len(picture.Uses) < 20 {
						picture.Uses = append(picture.Uses, use)
					}
				}
			}
			if c.Cmd != "MUS" || len(c.Args) == 0 || strings.EqualFold(c.Args[0], "STOP") {
				continue
			}
			key := strings.ToUpper(c.Args[0])
			t := music[key]
			if t == nil {
				rel := "bgm/" + c.Args[0] + ".xa"
				t = &galleryTrack{Name: key, File: rel}
				applyBgmMeta(t)
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
				applyBgmMeta(music[key])
			}
		}
	}
	for _, p := range pictures {
		out.Pictures = append(out.Pictures, *p)
	}
	sort.Slice(out.Pictures, func(i, j int) bool { return out.Pictures[i].Key < out.Pictures[j].Key })
	sort.Slice(out.Scenes, func(i, j int) bool { return out.Scenes[i].Name < out.Scenes[j].Name })
	for _, t := range music {
		out.Music = append(out.Music, *t)
	}
	sort.Slice(out.Music, func(i, j int) bool { return out.Music[i].Name < out.Music[j].Name })
	writeJSON(w, out)
}
