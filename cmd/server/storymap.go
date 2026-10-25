package main

import (
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"

	"mitama/pkg/script"
)

// The story map is intentionally chapter-level. Rendering all 420 scene files
// and 600+ choices as a scene graph is unreadable, so the server collapses
// scenes into their STS chapter (旅立, 壊心, …) and emits one edge per choice
// option. The Navigator can then show route transitions without the noise of
// every local menu option.

type storyScene struct {
	Name    string `json:"name"`
	Title   string `json:"title"`
	Route   string `json:"route"`
	Chapter string `json:"chapter"`
	Order   int    `json:"order"`
	First   string `json:"first,omitempty"`
}

type storyChapter struct {
	ID     string   `json:"id"`
	Route  string   `json:"route"`
	Title  string   `json:"title"`
	Order  int      `json:"order"`
	Scenes []string `json:"scenes"`
}

type storyEdge struct {
	From      string   `json:"from"`
	To        string   `json:"to,omitempty"`
	FromScene string   `json:"fromScene"`
	ToScene   string   `json:"toScene,omitempty"`
	Kind      string   `json:"kind"`
	Label     string   `json:"label"`
	Text      string   `json:"text"`
	TextEN    string   `json:"textEn,omitempty"`
	PC        int      `json:"pc"`
	TargetPC  int      `json:"targetPc,omitempty"`
	Notes     []string `json:"notes,omitempty"`
}

type storyMapData struct {
	Scenes   []storyScene   `json:"scenes"`
	Chapters []storyChapter `json:"chapters"`
	Edges    []storyEdge    `json:"edges"`
}

type storyDestination struct {
	Kind  string
	Scene string
	PC    int
	Label string
	Notes []string
}

type storySceneData struct {
	name     string
	title    string
	route    string
	order    int
	first    string
	commands []script.Command
	labels   map[string]int
}

var storyRouteOrder = []string{"八尋編", "紅羽編", "瑞希編", "朧編", "紫芳編", "阿佐弥編", "その他"}

func storyBaseName(name string) string {
	return strings.TrimSuffix(strings.ToLower(name), ".txt")
}

func storyRoute(name string) string {
	base := storyBaseName(name)
	if len(base) > 1 && base[0] == 'e' && base[1] >= 'a' && base[1] <= 'z' {
		base = base[1:]
	}
	i := 0
	for i < len(base) && base[i] >= 'a' && base[i] <= 'z' {
		i++
	}
	switch base[:i] {
	case "yr", "ye":
		return "八尋編"
	case "yk":
		return "紅羽編"
	case "ym":
		return "瑞希編"
	case "os", "oe":
		return "朧編"
	case "oh":
		return "紫芳編"
	case "oa":
		return "阿佐弥編"
	default:
		if i == 0 {
			return "その他"
		}
		return strings.ToUpper(base[:i])
	}
}

func storyNumber(name string) int {
	base := storyBaseName(name)
	if len(base) > 1 && base[0] == 'e' && base[1] >= 'a' && base[1] <= 'z' {
		base = base[1:]
	}
	i := 0
	for i < len(base) && base[i] >= 'a' && base[i] <= 'z' {
		i++
	}
	j := i
	for j < len(base) && base[j] >= '0' && base[j] <= '9' {
		j++
	}
	if j == i {
		return 999
	}
	n, _ := strconv.Atoi(base[i:j])
	if n == 0 {
		return 999
	}
	return n
}

func storyChapterFallback(name string) string {
	base := storyBaseName(name)
	if len(base) > 1 && base[0] == 'e' && base[1] >= 'a' && base[1] <= 'z' {
		base = base[1:]
	}
	i := 0
	for i < len(base) && base[i] >= 'a' && base[i] <= 'z' {
		i++
	}
	j := i
	for j < len(base) && base[j] >= '0' && base[j] <= '9' {
		j++
	}
	if j == i {
		return strings.ToUpper(base)
	}
	return strings.ToUpper(base[:i]) + " " + base[i:j]
}

func shortText(message string) string {
	text := strings.ReplaceAll(message, "\n", " ")
	text = strings.ReplaceAll(text, "￥", " ")
	text = strings.TrimSpace(text)
	runes := []rune(text)
	if len(runes) > 90 {
		text = string(runes[:90]) + "…"
	}
	return text
}

func addStoryNote(notes []string, note string) []string {
	for _, existing := range notes {
		if existing == note {
			return notes
		}
	}
	return append(notes, note)
}

func resolveStoryDestination(
	scene string,
	commands []script.Command,
	labels map[string]int,
	start int,
	depth int,
	notes []string,
) storyDestination {
	if depth > 8 {
		return storyDestination{Kind: "unknown", Notes: notes}
	}
	limit := len(commands)
	if start+1200 < limit {
		limit = start + 1200
	}
	for i := start; i < limit; i++ {
		c := commands[i]
		switch c.Cmd {
		case "LOD":
			if len(c.Args) > 0 {
				return storyDestination{
					Kind:  "scene",
					Scene: storyBaseName(c.Args[0]),
					Notes: notes,
				}
			}
		case "SLT", "MSLT":
			return storyDestination{Kind: "choice", Scene: scene, PC: i, Notes: notes}
		case "JMP":
			if len(c.Args) > 0 {
				if target, ok := labels[c.Args[0]]; ok && target != i {
					return resolveStoryDestination(scene, commands, labels, target, depth+1, notes)
				}
			}
			return storyDestination{Kind: "unknown", Notes: notes}
		case "BATTLE":
			label := ""
			if len(c.Args) > 0 {
				label = c.Args[0]
			}
			return storyDestination{Kind: "battle", Label: label, Notes: notes}
		case "SEND", "SHAEND", "END":
			return storyDestination{Kind: "end", Notes: notes}
		case "PARTY":
			if len(c.Args) > 0 {
				notes = addStoryNote(notes, "PARTY "+strings.Join(c.Args, " "))
			}
		case "FLG":
			if len(c.Args) > 0 {
				notes = addStoryNote(notes, "FLG "+strings.Join(c.Args, " "))
			}
		}
	}
	return storyDestination{Kind: "unknown", Notes: notes}
}

func storyChapterID(route, title string) string {
	return route + "\x00" + title
}

func (s *server) buildStoryMap(packID, root string) storyMapData {
	scenes := map[string]*storySceneData{}
	_ = filepath.Walk(filepath.Join(root, "text"), func(path string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() || !strings.HasSuffix(strings.ToLower(info.Name()), ".txt") {
			return nil
		}
		name := storyBaseName(info.Name())
		if !isStorySceneName(name) {
			return nil
		}
		f, err := os.Open(path)
		if err != nil {
			return nil
		}
		sc, err := script.Parse(f)
		_ = f.Close()
		if err != nil {
			return nil
		}
		s.translations.apply(packID, name, sc)
		title := ""
		first := ""
		for _, c := range sc.Commands {
			if title == "" && c.Cmd == "STS" && len(c.Args) > 0 {
				title = c.Args[0]
			}
			if first == "" && c.Cmd == "TEXT" && c.Message != "" {
				first = shortText(c.Message)
			}
			if title != "" && first != "" {
				break
			}
		}
		scenes[name] = &storySceneData{
			name:     name,
			title:    title,
			route:    storyRoute(name),
			order:    storyNumber(name),
			first:    first,
			commands: sc.Commands,
			labels:   sc.Labels,
		}
		return nil
	})

	// Scenes without their own STS title inherit the chapter title of a scene
	// with the same route and chapter number. This keeps ero variants and
	// branch variants grouped with their story chapter.
	titleByRouteNumber := map[string]string{}
	for _, scene := range scenes {
		if scene.title != "" {
			titleByRouteNumber[scene.route+"|"+strconv.Itoa(scene.order)] = scene.title
		}
	}

	out := storyMapData{
		Scenes:   []storyScene{},
		Chapters: []storyChapter{},
		Edges:    []storyEdge{},
	}
	chapters := map[string]*storyChapter{}
	chapterByScene := map[string]string{}
	for _, scene := range scenes {
		title := scene.title
		if title == "" {
			title = titleByRouteNumber[scene.route+"|"+strconv.Itoa(scene.order)]
		}
		if title == "" {
			title = storyChapterFallback(scene.name)
		}
		id := storyChapterID(scene.route, title)
		chapterByScene[scene.name] = id
		chapter := chapters[id]
		if chapter == nil {
			chapter = &storyChapter{ID: id, Route: scene.route, Title: title, Order: scene.order}
			chapters[id] = chapter
		}
		if scene.order < chapter.Order {
			chapter.Order = scene.order
		}
		chapter.Scenes = append(chapter.Scenes, scene.name)
		out.Scenes = append(out.Scenes, storyScene{
			Name:    scene.name,
			Title:   title,
			Route:   scene.route,
			Chapter: id,
			Order:   scene.order,
			First:   scene.first,
		})
	}

	for _, scene := range scenes {
		from := chapterByScene[scene.name]
		for i, c := range scene.commands {
			if c.Cmd != "SLT" && c.Cmd != "MSLT" {
				continue
			}
			for _, option := range c.Options {
				dest := storyDestination{Kind: "unknown"}
				if target, ok := scene.labels[option.Label]; ok {
					dest = resolveStoryDestination(scene.name, scene.commands, scene.labels, target, 0, nil)
				}
				to := from
				if dest.Scene != "" {
					if mapped, ok := chapterByScene[dest.Scene]; ok {
						to = mapped
					} else {
						to = ""
					}
				}
				out.Edges = append(out.Edges, storyEdge{
					From:      from,
					To:        to,
					FromScene: scene.name,
					ToScene:   dest.Scene,
					Kind:      dest.Kind,
					Label:     option.Label,
					Text:      option.Text,
					TextEN:    option.TextEN,
					PC:        i,
					TargetPC:  dest.PC,
					Notes:     dest.Notes,
				})
			}
		}
	}

	for _, chapter := range chapters {
		sort.Strings(chapter.Scenes)
		out.Chapters = append(out.Chapters, *chapter)
	}
	sort.Slice(out.Scenes, func(i, j int) bool { return out.Scenes[i].Name < out.Scenes[j].Name })
	sort.Slice(out.Chapters, func(i, j int) bool {
		a, b := out.Chapters[i], out.Chapters[j]
		ai := storyRouteIndex(a.Route)
		bi := storyRouteIndex(b.Route)
		if ai != bi {
			return ai < bi
		}
		if a.Order != b.Order {
			return a.Order < b.Order
		}
		return a.Title < b.Title
	})
	return out
}

func storyRouteIndex(route string) int {
	for i, value := range storyRouteOrder {
		if value == route {
			return i
		}
	}
	return len(storyRouteOrder)
}

func isStorySceneName(name string) bool {
	if len(name) < 3 {
		return false
	}
	i := 0
	if name[0] == 'e' {
		i = 1
	}
	letters := 0
	for i < len(name) && name[i] >= 'a' && name[i] <= 'z' {
		i++
		letters++
	}
	if letters < 2 {
		return false
	}
	for i < len(name) && name[i] >= '0' && name[i] <= '9' {
		return true
	}
	return false
}

func (s *server) handleStoryMap(w http.ResponseWriter, r *http.Request) {
	packID := r.URL.Query().Get("pack")
	if packID == "" {
		packID = "dvd"
	}
	packID = filepath.Base(packID)
	root := filepath.Join(s.dataDir, packID)
	if _, err := os.Stat(root); err != nil {
		http.Error(w, "pack not found", http.StatusNotFound)
		return
	}

	s.storyMu.Lock()
	if cached, ok := s.storyMaps[packID]; ok {
		data := *cached
		s.storyMu.Unlock()
		writeJSON(w, data)
		return
	}
	s.storyMu.Unlock()

	data := s.buildStoryMap(packID, root)
	s.storyMu.Lock()
	if s.storyMaps == nil {
		s.storyMaps = map[string]*storyMapData{}
	}
	s.storyMaps[packID] = &data
	s.storyMu.Unlock()
	writeJSON(w, data)
}
