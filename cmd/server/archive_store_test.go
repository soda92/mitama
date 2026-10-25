package main

import (
	"encoding/json"
	"path/filepath"
	"testing"
)

func TestArchiveStorePersistsSnapshots(t *testing.T) {
	path := filepath.Join(t.TempDir(), "archives.db")
	store, err := openArchiveStore(path)
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	snap := json.RawMessage(`{"scene":"yr1_00","pc":4,"savedAt":123}`)
	if err := store.put("a-test", snap); err != nil {
		t.Fatalf("put: %v", err)
	}
	got, err := store.list()
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(got) != 1 || string(got["a-test"]) != string(snap) {
		t.Fatalf("list = %#v", got)
	}
	if err := store.close(); err != nil {
		t.Fatalf("close: %v", err)
	}
	store, err = openArchiveStore(path)
	if err != nil {
		t.Fatalf("reopen: %v", err)
	}
	got, err = store.list()
	if err != nil || len(got) != 1 {
		t.Fatalf("list after reopen = %#v, %v", got, err)
	}
	if err := store.delete("a-test"); err != nil {
		t.Fatalf("delete: %v", err)
	}
	got, err = store.list()
	if err != nil {
		t.Fatalf("list after delete: %v", err)
	}
	if len(got) != 0 {
		t.Fatalf("list after delete = %#v", got)
	}
	if err := store.close(); err != nil {
		t.Fatalf("close: %v", err)
	}
}
