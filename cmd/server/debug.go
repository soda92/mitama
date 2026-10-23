package main

import (
	"encoding/json"
	"io"
	"net/http"
	"sync"
	"time"
)

// debugStore keeps the latest state mirrored from the browser so the game can
// be inspected with curl or Chrome DevTools MCP without attaching to the page.
type debugStore struct {
	mu      sync.Mutex
	state   json.RawMessage
	updated time.Time
}

func newDebugStore() *debugStore { return &debugStore{} }

func (d *debugStore) get() (json.RawMessage, time.Time) {
	d.mu.Lock()
	defer d.mu.Unlock()
	return d.state, d.updated
}

func (d *debugStore) set(state json.RawMessage) {
	d.mu.Lock()
	defer d.mu.Unlock()
	d.state = state
	d.updated = time.Now()
}

// handleDebugState accepts a browser snapshot (POST) or returns the last one
// (GET).
func (s *server) handleDebugState(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodPost:
		body, err := io.ReadAll(io.LimitReader(r.Body, 1<<20))
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if !json.Valid(body) {
			http.Error(w, "invalid JSON", http.StatusBadRequest)
			return
		}
		s.debug.set(json.RawMessage(body))
		w.WriteHeader(http.StatusNoContent)
	case http.MethodGet:
		state, updated := s.debug.get()
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		w.Header().Set("Cache-Control", "no-store")
		if state == nil {
			_, _ = w.Write([]byte("{}\n"))
			return
		}
		_, _ = w.Write(state)
		_, _ = w.Write([]byte("\n"))
		_ = updated
	default:
		w.Header().Set("Allow", "GET, POST")
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

// handleDebug returns server-side diagnostics: packs, audio cache and the last
// browser state.
func (s *server) handleDebug(w http.ResponseWriter, r *http.Request) {
	state, updated := s.debug.get()
	entries, bytes, max := s.audio.stats()
	writeJSON(w, map[string]any{
		"packs": s.packs(),
		"audioCache": map[string]any{
			"entries": entries,
			"bytes":   bytes,
			"max":     max,
		},
		"browser": state,
		"updated": updated,
	})
}
