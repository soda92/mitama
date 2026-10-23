package main

import (
	"bytes"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"

	"mitama/pkg/xa"
)

// audioCache keeps decoded WAVs in memory (they are served repeatedly for BGM).
type audioCache struct {
	mu      sync.Mutex
	max     int64
	size    int64
	entries map[string][]byte
	order   []string
}

func newAudioCache(max int64) *audioCache {
	return &audioCache{max: max, entries: map[string][]byte{}}
}

func (c *audioCache) get(key string) ([]byte, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	v, ok := c.entries[key]
	return v, ok
}

func (c *audioCache) put(key string, data []byte) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if int64(len(data)) > c.max {
		return
	}
	if _, exists := c.entries[key]; exists {
		return
	}
	for c.size+int64(len(data)) > c.max && len(c.order) > 0 {
		old := c.order[0]
		c.order = c.order[1:]
		c.size -= int64(len(c.entries[old]))
		delete(c.entries, old)
	}
	c.entries[key] = data
	c.order = append(c.order, key)
	c.size += int64(len(data))
}

// handleAudio decodes KWD1 .xa to WAV. Raw .wav files are passed through.
func (s *server) handleAudio(w http.ResponseWriter, r *http.Request) {
	pack := r.URL.Query().Get("pack")
	rel := strings.TrimSpace(r.URL.Query().Get("file"))
	if pack == "" || rel == "" {
		http.Error(w, "pack and file are required", http.StatusBadRequest)
		return
	}
	pack = filepath.Base(pack)
	rel = strings.ReplaceAll(rel, "\\", "/")
	if strings.Contains(rel, "..") || filepath.IsAbs(rel) {
		http.Error(w, "invalid file", http.StatusBadRequest)
		return
	}
	root := filepath.Join(s.dataDir, pack)
	full := filepath.Join(root, filepath.FromSlash(rel))
	if !strings.HasPrefix(filepath.Clean(full), filepath.Clean(root)+string(os.PathSeparator)) {
		http.Error(w, "invalid file", http.StatusBadRequest)
		return
	}
	full, err := findFileInsensitive(filepath.Dir(full), filepath.Base(full))
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}
	key := pack + "/" + rel
	if data, ok := s.audio.get(key); ok {
		serveWAV(w, data)
		return
	}

	data, err := os.ReadFile(full)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}
	if bytes.HasPrefix(data, []byte("KWD1")) {
		audio, err := xa.Decode(data)
		if err != nil {
			log.Printf("audio: %s: %v", rel, err)
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		data = xa.EncodeWAV(audio)
		s.audio.put(key, data)
	}
	serveWAV(w, data)
}

func serveWAV(w http.ResponseWriter, data []byte) {
	w.Header().Set("Content-Type", "audio/wav")
	w.Header().Set("Cache-Control", "public, max-age=86400")
	w.Header().Set("Content-Length", strconv.Itoa(len(data)))
	_, _ = w.Write(data)
}
