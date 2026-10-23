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
		character, err := s.loadCharacter(packID, dir, member.File)
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
	character, err := s.loadCharacter(packID, dir, name)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}
	writeJSON(w, character)
}

func (s *server) loadCharacter(packID, dir, name string) (battle.Character, error) {
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
	s.attachSprite(packID, dir, &character)
	return character, nil
}

// attachSprite resolves the character's idle .mtn -> .spt -> .bmp chain.
func (s *server) attachSprite(packID, battleDir string, character *battle.Character) {
	root := filepath.Dir(battleDir)
	objectDir := filepath.Join(root, "object")
	spriteDir := filepath.Join(root, "sprite")

	objectFile, err := findFileInsensitive(objectDir, character.Object)
	if err != nil {
		return
	}
	f, err := os.Open(objectFile)
	if err != nil {
		return
	}
	object, err := battle.ParseObject(f)
	_ = f.Close()
	if err != nil || len(object.MotionFiles) == 0 || len(object.SpriteFiles) == 0 {
		return
	}

	idleIndex := 0
	if len(object.MotionFiles) > 1 {
		idleIndex = 1
	}
	motionFile, err := findFileInsensitive(objectDir, object.MotionFiles[idleIndex])
	if err != nil {
		return
	}
	mf, err := os.Open(motionFile)
	if err != nil {
		return
	}
	motion, err := battle.ParseMotion(mf)
	_ = mf.Close()
	if err != nil || motion.Sprite < 0 || motion.Sprite >= len(object.SpriteFiles) {
		return
	}

	spriteFile := object.SpriteFiles[motion.Sprite]
	if strings.EqualFold(spriteFile, "empty.spt") {
		return
	}
	sptFile, err := findFileInsensitive(objectDir, spriteFile)
	if err != nil {
		return
	}
	sf, err := os.Open(sptFile)
	if err != nil {
		return
	}
	frames, err := battle.ParseSprite(sf)
	_ = sf.Close()
	if err != nil || len(frames) == 0 {
		return
	}

	bmpFile := strings.TrimSuffix(spriteFile, filepath.Ext(spriteFile)) + ".bmp"
	bmpPath, err := findFileInsensitive(spriteDir, bmpFile)
	if err != nil {
		return
	}
	rel, err := filepath.Rel(root, bmpPath)
	if err != nil {
		return
	}
	idle := motion.Frames
	if len(idle) == 0 {
		idle = []int{0}
	}
	character.Sprite = &battle.Sprite{
		Frames: frames,
		Idle:   idle,
		BMP:    "/media/" + filepath.Base(packID) + "/" + filepath.ToSlash(rel),
	}
}
