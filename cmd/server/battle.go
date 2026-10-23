package main

import (
	"errors"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"mitama/pkg/battle"
)

// handleBattle returns an enemy .pty and the .chr files it references.
func (s *server) handleBattle(w http.ResponseWriter, r *http.Request) {
	packID := r.URL.Query().Get("pack")
	if packID == "" {
		packID = "dvd"
	}
	name := strings.TrimSpace(r.URL.Query().Get("name"))
	if name == "" {
		http.Error(w, "missing battle name", http.StatusBadRequest)
		return
	}
	name = filepath.Base(strings.ReplaceAll(name, "\\", "/"))
	if !strings.HasSuffix(strings.ToLower(name), ".pty") {
		name += ".pty"
	}
	dir := filepath.Join(s.dataDir, packID, "battle")
	path, err := findFileInsensitive(dir, name)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}
	f, err := os.Open(path)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}
	party, err := battle.ParseParty(f)
	_ = f.Close()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	enc := battle.Encounter{Party: party}
	for _, member := range party.Members {
		character, err := s.loadCharacter(dir, member.File)
		if err != nil {
			character = battle.Character{File: member.File, Name: strings.TrimSuffix(member.File, filepath.Ext(member.File))}
		}
		enc.Characters = append(enc.Characters, character)
	}
	writeJSON(w, enc)
}

// handleBattleCharacter returns one .chr file by stem (yahiro) or filename.
func (s *server) handleBattleCharacter(w http.ResponseWriter, r *http.Request) {
	packID := r.URL.Query().Get("pack")
	if packID == "" {
		packID = "dvd"
	}
	name := strings.TrimSpace(r.URL.Query().Get("name"))
	if name == "" {
		http.Error(w, "missing character name", http.StatusBadRequest)
		return
	}
	name = filepath.Base(strings.ReplaceAll(name, "\\", "/"))
	if !strings.HasSuffix(strings.ToLower(name), ".chr") {
		name += ".chr"
	}
	dir := filepath.Join(s.dataDir, packID, "battle")
	character, err := s.loadCharacter(dir, name)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}
	writeJSON(w, character)
}

func (s *server) loadCharacter(dir, name string) (battle.Character, error) {
	if strings.TrimSpace(name) == "" || strings.EqualFold(name, "empty") {
		return battle.Character{}, errors.New("empty character")
	}
	path, err := findFileInsensitive(dir, name)
	if err != nil {
		return battle.Character{}, err
	}
	f, err := os.Open(path)
	if err != nil {
		return battle.Character{}, err
	}
	defer f.Close()
	character, err := battle.ParseCharacter(f)
	if err != nil {
		return battle.Character{}, err
	}
	character.File = filepath.Base(path)
	if character.Name == "" {
		character.Name = strings.TrimSuffix(character.File, filepath.Ext(character.File))
	}
	return character, nil
}
