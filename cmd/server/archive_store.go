package main

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"time"

	_ "modernc.org/sqlite"
)

const maxArchiveBytes = 8 << 20

var archiveIDPattern = regexp.MustCompile(`^[A-Za-z0-9._-]{1,96}$`)

// archiveStore persists browser snapshots in SQLite. The raw snapshot JSON is
// stored verbatim so the server does not need to know the full Snapshot schema.
type archiveStore struct {
	db *sql.DB
}

func openArchiveStore(path string) (*archiveStore, error) {
	if path == "" {
		return nil, errors.New("empty archive database path")
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return nil, fmt.Errorf("archive db directory: %w", err)
	}
	db, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, fmt.Errorf("open archive db: %w", err)
	}
	// SQLite is happiest with a single writer for this small local server.
	db.SetMaxOpenConns(1)
	if _, err := db.Exec(`
		PRAGMA journal_mode = WAL;
		PRAGMA busy_timeout = 5000;
		CREATE TABLE IF NOT EXISTS archives (
			id TEXT PRIMARY KEY,
			data TEXT NOT NULL,
			saved_at INTEGER NOT NULL,
			updated_at INTEGER NOT NULL
		);
		CREATE INDEX IF NOT EXISTS archives_saved_at ON archives(saved_at DESC);
	`); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("init archive db: %w", err)
	}
	return &archiveStore{db: db}, nil
}

func (a *archiveStore) close() error {
	if a == nil || a.db == nil {
		return nil
	}
	return a.db.Close()
}

func (a *archiveStore) list() (map[string]json.RawMessage, error) {
	rows, err := a.db.Query(`SELECT id, data FROM archives ORDER BY saved_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make(map[string]json.RawMessage)
	for rows.Next() {
		var id, data string
		if err := rows.Scan(&id, &data); err != nil {
			return nil, err
		}
		out[id] = json.RawMessage(data)
	}
	return out, rows.Err()
}

func (a *archiveStore) put(id string, data []byte) error {
	var meta struct {
		SavedAt int64 `json:"savedAt"`
	}
	_ = json.Unmarshal(data, &meta)
	savedAt := meta.SavedAt
	if savedAt <= 0 {
		savedAt = time.Now().UnixMilli()
	}
	_, err := a.db.Exec(`
		INSERT INTO archives (id, data, saved_at, updated_at)
		VALUES (?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET
			data = excluded.data,
			saved_at = excluded.saved_at,
			updated_at = excluded.updated_at
	`, id, string(data), savedAt, time.Now().UnixMilli())
	return err
}

func (a *archiveStore) delete(id string) error {
	_, err := a.db.Exec(`DELETE FROM archives WHERE id = ?`, id)
	return err
}

func (s *server) handleArchiveList(w http.ResponseWriter, r *http.Request) {
	if s.archives == nil {
		http.Error(w, "archive database unavailable", http.StatusServiceUnavailable)
		return
	}
	archives, err := s.archives.list()
	if err != nil {
		log.Printf("archives list: %v", err)
		http.Error(w, "archive database error", http.StatusInternalServerError)
		return
	}
	writeJSON(w, map[string]any{"archives": archives})
}

func (s *server) handleArchivePut(w http.ResponseWriter, r *http.Request) {
	if s.archives == nil {
		http.Error(w, "archive database unavailable", http.StatusServiceUnavailable)
		return
	}
	id := r.PathValue("id")
	if !archiveIDPattern.MatchString(id) {
		http.Error(w, "invalid archive id", http.StatusBadRequest)
		return
	}
	body, err := io.ReadAll(io.LimitReader(r.Body, maxArchiveBytes+1))
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if len(body) > maxArchiveBytes {
		http.Error(w, "archive too large", http.StatusRequestEntityTooLarge)
		return
	}
	trimmed := bytes.TrimSpace(body)
	if len(trimmed) == 0 || trimmed[0] != '{' || !json.Valid(trimmed) {
		http.Error(w, "archive must be a JSON object", http.StatusBadRequest)
		return
	}
	if err := s.archives.put(id, body); err != nil {
		log.Printf("archive put %s: %v", id, err)
		http.Error(w, "archive database error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("X-Archive-ID", id)
	w.WriteHeader(http.StatusNoContent)
}

func (s *server) handleArchiveDelete(w http.ResponseWriter, r *http.Request) {
	if s.archives == nil {
		http.Error(w, "archive database unavailable", http.StatusServiceUnavailable)
		return
	}
	id := r.PathValue("id")
	if !archiveIDPattern.MatchString(id) {
		http.Error(w, "invalid archive id", http.StatusBadRequest)
		return
	}
	if err := s.archives.delete(id); err != nil {
		log.Printf("archive delete %s: %v", id, err)
		http.Error(w, "archive database error", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
