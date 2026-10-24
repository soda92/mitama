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

// attachSprite resolves the character's .o -> .mtn -> .spt -> .bmp chain.
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

	cache := make(map[int]battle.Sprite)
	loadSprite := func(index int) (battle.Sprite, bool) {
		if sprite, ok := cache[index]; ok {
			return sprite, true
		}
		if index < 0 || index >= len(object.SpriteFiles) {
			return battle.Sprite{}, false
		}
		spriteFile := object.SpriteFiles[index]
		if strings.EqualFold(spriteFile, "empty.spt") {
			return battle.Sprite{}, false
		}
		sptFile, err := findFileInsensitive(objectDir, spriteFile)
		if err != nil {
			return battle.Sprite{}, false
		}
		sf, err := os.Open(sptFile)
		if err != nil {
			return battle.Sprite{}, false
		}
		frames, err := battle.ParseSprite(sf)
		_ = sf.Close()
		if err != nil || len(frames) == 0 {
			return battle.Sprite{}, false
		}
		bmpFile := strings.TrimSuffix(spriteFile, filepath.Ext(spriteFile)) + ".bmp"
		bmpPath, err := findFileInsensitive(spriteDir, bmpFile)
		if err != nil {
			return battle.Sprite{}, false
		}
		rel, err := filepath.Rel(root, bmpPath)
		if err != nil {
			return battle.Sprite{}, false
		}
		sprite := battle.Sprite{
			Frames: frames,
			BMP:    "/media/" + filepath.Base(packID) + "/" + filepath.ToSlash(rel),
		}
		cache[index] = sprite
		return sprite, true
	}

	idleIndex := 0
	if len(object.MotionFiles) > 1 {
		idleIndex = 1
	}
	if idleFile, err := findFileInsensitive(objectDir, object.MotionFiles[idleIndex]); err == nil {
		if mf, err := os.Open(idleFile); err == nil {
			if motion, err := battle.ParseMotion(mf); err == nil {
				if sprite, ok := loadSprite(motion.Sprite); ok {
					idle := motion.Frames
					if len(idle) == 0 {
						idle = []int{0}
					}
					sprite.Idle = idle
					character.Sprite = &sprite
				}
			}
			_ = mf.Close()
		}
	}

	for index, motionFile := range object.MotionFiles {
		path, err := findFileInsensitive(objectDir, motionFile)
		if err != nil {
			continue
		}
		mf, err := os.Open(path)
		if err != nil {
			continue
		}
		motion, err := battle.ParseMotion(mf)
		_ = mf.Close()
		if err != nil {
			continue
		}
		clip := battle.MotionClip{Index: index, File: motionFile, Events: motion.Events}
		for _, step := range motion.Steps {
			sprite, ok := loadSprite(step.Sprite)
			if !ok || step.Frame < 0 || step.Frame >= len(sprite.Frames) {
				continue
			}
			clip.Steps = append(clip.Steps, battle.MotionStepFrame{
				BMP:   sprite.BMP,
				Frame: sprite.Frames[step.Frame],
				Wait:  step.Wait,
			})
		}
		if len(clip.Steps) > 0 {
			character.Motions = append(character.Motions, clip)
		}
	}
}
