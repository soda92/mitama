// Package arc reads the archive format used by Ciel's ARCANA engine
// (kunoichi.arc, game.arc, bgm.arc, se.arc, text.arc, ...).
//
// Layout:
//
//	uint32 count
//	count * 36-byte records, additively encoded with the key "arcana"
//
// Each decoded record is:
//
//	name[24]  zero-padded, CP932
//	size      uint32, uncompressed size (or stored size when no compression)
//	stored    uint32, bytes occupied in the archive
//	offset    uint32, absolute offset from the start of the archive
//
// File payloads are either stored raw or compressed with the ARCANA LZSS
// codec. A payload may additionally be wrapped in a KWD1 block:
//
//	"KWD1"
//	uint32 compressed_size
//	uint32 uncompressed_size
//	uint32 flags
//	20 bytes zero
//	compressed payload
package arc

import (
	"encoding/binary"
	"fmt"
	"io"
	"os"
	"strings"

	"golang.org/x/text/encoding/japanese"
	"golang.org/x/text/transform"

	"mitama/pkg/lzss"
)

const (
	recordSize = 36
	nameSize   = 24
	key        = "arcana"
	kwdHeader  = 32
)

// Entry is one decoded directory record.
type Entry struct {
	Name         string // decoded from CP932
	RawName      []byte // original CP932 bytes, without the NUL terminator
	Size         uint32 // uncompressed size
	Stored       uint32 // stored size in bytes
	Offset       uint32 // absolute archive offset
	Index        int
	Compressed   bool // payload is LZSS-compressed
	KWD1         bool // payload is wrapped in a KWD1 block
	StoredOffset uint32
}

// Archive is an open ARC archive.
type Archive struct {
	Path    string
	Size    int64
	Entries []Entry
	r       io.ReaderAt
	closer  io.Closer
}

// Open opens an archive on disk.
func Open(path string) (*Archive, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	st, err := f.Stat()
	if err != nil {
		f.Close()
		return nil, err
	}
	a, err := New(f, st.Size())
	if err != nil {
		f.Close()
		return nil, err
	}
	a.Path = path
	a.closer = f
	return a, nil
}

// New reads the directory from r.
func New(r io.ReaderAt, size int64) (*Archive, error) {
	if size < 4 {
		return nil, fmt.Errorf("arc: file too small")
	}
	var hdr [4]byte
	if _, err := r.ReadAt(hdr[:], 0); err != nil {
		return nil, err
	}
	count := binary.LittleEndian.Uint32(hdr[:])
	if count == 0 || count > 1_000_000 {
		return nil, fmt.Errorf("arc: implausible entry count %d", count)
	}
	tableLen := int64(count) * recordSize
	if 4+tableLen > size {
		return nil, fmt.Errorf("arc: directory (%d entries) exceeds file size", count)
	}
	table := make([]byte, tableLen)
	if _, err := r.ReadAt(table, 4); err != nil {
		return nil, err
	}
	// Decode the directory in place: plain[i] = cipher[i] + "arcana"[i%6].
	for i := range table {
		table[i] += key[i%len(key)]
	}

	a := &Archive{Size: size, r: r, Entries: make([]Entry, 0, count)}
	for i := 0; i < int(count); i++ {
		rec := table[i*recordSize : (i+1)*recordSize]
		raw := append([]byte(nil), rec[:nameSize]...)
		if n := strings.IndexByte(string(raw), 0); n >= 0 {
			raw = raw[:n]
		}
		name := decodeCP932(raw)
		e := Entry{
			Name:    name,
			RawName: raw,
			Size:    binary.LittleEndian.Uint32(rec[24:28]),
			Stored:  binary.LittleEndian.Uint32(rec[28:32]),
			Offset:  binary.LittleEndian.Uint32(rec[32:36]),
			Index:   i,
		}
		a.Entries = append(a.Entries, e)
	}
	return a, nil
}

// Close closes the underlying file, if any.
func (a *Archive) Close() error {
	if a.closer != nil {
		return a.closer.Close()
	}
	return nil
}

// Find returns the entry with the given case-insensitive name.
func (a *Archive) Find(name string) (Entry, bool) {
	for _, e := range a.Entries {
		if strings.EqualFold(e.Name, name) {
			return e, true
		}
	}
	return Entry{}, false
}

// StoredBytes returns the payload exactly as stored in the archive.
func (a *Archive) StoredBytes(e Entry) ([]byte, error) {
	if int64(e.Offset)+int64(e.Stored) > a.Size {
		return nil, fmt.Errorf("arc: %s extends past end of archive", e.Name)
	}
	buf := make([]byte, e.Stored)
	if _, err := a.r.ReadAt(buf, int64(e.Offset)); err != nil {
		return nil, err
	}
	return buf, nil
}

// Read returns the decompressed contents of an entry.
func (a *Archive) Read(e Entry) ([]byte, error) {
	stored, err := a.StoredBytes(e)
	if err != nil {
		return nil, err
	}
	return DecodePayload(stored, e.Size)
}

// DecodePayload unwraps a KWD1 block and/or runs the LZSS codec. The
// uncompressed size is taken from the KWD1 header when present, otherwise
// from wantSize.
func DecodePayload(stored []byte, wantSize uint32) ([]byte, error) {
	if len(stored) >= kwdHeader && string(stored[:4]) == "KWD1" {
		cs := binary.LittleEndian.Uint32(stored[4:8])
		us := binary.LittleEndian.Uint32(stored[8:12])
		if int64(kwdHeader)+int64(cs) > int64(len(stored)) {
			return nil, fmt.Errorf("arc: KWD1 payload size %d exceeds block %d", cs, len(stored))
		}
		out, err := lzss.Decode(stored[kwdHeader:kwdHeader+cs], int(us))
		if err != nil {
			return nil, fmt.Errorf("arc: KWD1: %w", err)
		}
		return out, nil
	}
	if len(stored) < int(wantSize) {
		out, err := lzss.Decode(stored, int(wantSize))
		if err != nil {
			return nil, fmt.Errorf("arc: lzss: %w", err)
		}
		return out, nil
	}
	// Raw payload. If the caller's size is larger than the stored bytes it is
	// still safe to return the stored bytes (some archives pad the field).
	return stored, nil
}

func decodeCP932(b []byte) string {
	if len(b) == 0 {
		return ""
	}
	out, _, err := transform.Bytes(japanese.ShiftJIS.NewDecoder(), b)
	if err != nil {
		return string(b)
	}
	return string(out)
}
