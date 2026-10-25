package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"

	"mitama/pkg/script"
)

// translationFile is produced by cmd/translate. Keys are scene names and then
// command indexes, so translations stay attached to the exact script command
// rather than to a line number.
type translationFile struct {
	Version int                                    `json:"version"`
	Source  string                                 `json:"source,omitempty"`
	Target  string                                 `json:"target,omitempty"`
	Scenes  map[string]map[string]translationEntry `json:"scenes"`
}

type translationEntry struct {
	Source  string            `json:"source,omitempty"`
	Text    string            `json:"text,omitempty"`
	Options map[string]string `json:"options,omitempty"`
}

type translationStore struct {
	mu     sync.Mutex
	data   string
	files  map[string]*translationFile
	loaded map[string]bool
}

func newTranslationStore(dataDir string) *translationStore {
	return &translationStore{
		data:   dataDir,
		files:  map[string]*translationFile{},
		loaded: map[string]bool{},
	}
}

func (t *translationStore) get(packRoot string) *translationFile {
	t.mu.Lock()
	defer t.mu.Unlock()
	if t.loaded[packRoot] {
		return t.files[packRoot]
	}
	t.loaded[packRoot] = true
	path := filepath.Join(t.data, packRoot, "translations.json")
	raw, err := os.ReadFile(path)
	if err != nil {
		t.files[packRoot] = &translationFile{Scenes: map[string]map[string]translationEntry{}}
		return t.files[packRoot]
	}
	var file translationFile
	if err := json.Unmarshal(raw, &file); err != nil {
		t.files[packRoot] = &translationFile{Scenes: map[string]map[string]translationEntry{}}
		return t.files[packRoot]
	}
	if file.Scenes == nil {
		file.Scenes = map[string]map[string]translationEntry{}
	}
	t.files[packRoot] = &file
	return &file
}

func (t *translationStore) apply(packRoot, scene string, sc *script.Script) {
	if t == nil || sc == nil {
		return
	}
	entries := t.get(packRoot).Scenes[strings.ToLower(scene)]
	if len(entries) == 0 {
		return
	}
	for i := range sc.Commands {
		entry, ok := entries[strconv.Itoa(i)]
		if !ok {
			continue
		}
		cmd := &sc.Commands[i]
		if cmd.Message != "" && entry.Text != "" && (entry.Source == "" || entry.Source == cmd.Message) {
			cmd.MessageEN = entry.Text
		}
		for j := range cmd.Options {
			if translated, ok := entry.Options[cmd.Options[j].Text]; ok {
				cmd.Options[j].TextEN = translated
			}
		}
	}
}
