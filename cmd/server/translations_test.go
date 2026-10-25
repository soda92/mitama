package main

import (
	"os"
	"path/filepath"
	"testing"

	"mitama/pkg/script"
)

func TestTranslationStoreAppliesTextAndOptions(t *testing.T) {
	dir := t.TempDir()
	if err := os.MkdirAll(filepath.Join(dir, "dvd"), 0o755); err != nil {
		t.Fatal(err)
	}
	raw := `{
		"version": 1,
		"scenes": {
			"yr1_00": {
				"0": {"source": "こんにちは", "text": "Hello"},
				"2": {"options": {"はい": "Yes", "いいえ": "No"}}
			}
		}
	}`
	if err := os.WriteFile(filepath.Join(dir, "dvd", "translations.json"), []byte(raw), 0o644); err != nil {
		t.Fatal(err)
	}
	sc := &script.Script{Commands: []script.Command{
		{Cmd: "TEXT", Message: "こんにちは"},
		{Cmd: "WAIT"},
		{Cmd: "SLT", Options: []script.Option{{Text: "はい", Label: "a"}, {Text: "いいえ", Label: "b"}}},
	}}
	newTranslationStore(dir).apply("dvd", "YR1_00", sc)
	if sc.Commands[0].MessageEN != "Hello" {
		t.Fatalf("messageEn = %q", sc.Commands[0].MessageEN)
	}
	if sc.Commands[2].Options[0].TextEN != "Yes" || sc.Commands[2].Options[1].TextEN != "No" {
		t.Fatalf("options = %#v", sc.Commands[2].Options)
	}
}
