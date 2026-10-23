package arc

import (
	"bytes"
	"encoding/binary"
	"testing"
)

const keyString = "arcana"

func encodeTable(records [][]byte) []byte {
	table := bytes.Join(records, nil)
	for i := range table {
		table[i] -= keyString[i%len(keyString)]
	}
	return table
}

func record(name string, size, stored, offset uint32) []byte {
	b := make([]byte, recordSize)
	copy(b, name)
	binary.LittleEndian.PutUint32(b[24:28], size)
	binary.LittleEndian.PutUint32(b[28:32], stored)
	binary.LittleEndian.PutUint32(b[32:36], offset)
	return b
}

func makeArchive(payloads ...[]byte) (*Archive, []byte) {
	records := make([][]byte, 0, len(payloads))
	offset := uint32(4 + len(payloads)*recordSize)
	var body bytes.Buffer
	for i, p := range payloads {
		name := []string{"a.bin", "b.bin", "c.bin"}[i]
		size := uint32(len(p))
		stored := uint32(len(p))
		if len(p) >= 32 && string(p[:4]) == "KWD1" {
			stored = uint32(len(p))
			size = binary.LittleEndian.Uint32(p[8:12])
		}
		records = append(records, record(name, size, stored, offset))
		body.Write(p)
		offset += stored
	}
	var out bytes.Buffer
	_ = binary.Write(&out, binary.LittleEndian, uint32(len(payloads)))
	out.Write(encodeTable(records))
	out.Write(body.Bytes())
	data := out.Bytes()
	a, err := New(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		panic(err)
	}
	return a, data
}

func TestOpenAndRead(t *testing.T) {
	a, _ := makeArchive([]byte("hello"))
	if len(a.Entries) != 1 {
		t.Fatalf("entries = %d", len(a.Entries))
	}
	if a.Entries[0].Name != "a.bin" {
		t.Fatalf("name = %q", a.Entries[0].Name)
	}
	out, err := a.Read(a.Entries[0])
	if err != nil {
		t.Fatal(err)
	}
	if string(out) != "hello" {
		t.Fatalf("payload = %q", out)
	}
}

func TestKWD1(t *testing.T) {
	// "abcabcabc" compressed with the LZSS stream from the lzss tests.
	compressed := []byte{0x07, 'a', 'b', 'c', 0xEE, 0xF3}
	block := make([]byte, 32+len(compressed))
	copy(block, "KWD1")
	binary.LittleEndian.PutUint32(block[4:8], uint32(len(compressed)))
	binary.LittleEndian.PutUint32(block[8:12], 9)
	copy(block[32:], compressed)

	a, _ := makeArchive(block)
	out, err := a.Read(a.Entries[0])
	if err != nil {
		t.Fatal(err)
	}
	if string(out) != "abcabcabc" {
		t.Fatalf("payload = %q", out)
	}
}

func TestRawPayload(t *testing.T) {
	compressed := []byte{0x07, 'a', 'b', 'c', 0xEE, 0xF3}
	a, _ := makeArchive(compressed)
	// The synthetic table describes the compressed size as the file size;
	// reading it as raw data is still valid, but it must not panic.
	out, err := a.Read(a.Entries[0])
	if err != nil {
		t.Fatal(err)
	}
	if len(out) != len(compressed) {
		t.Fatalf("len = %d", len(out))
	}
}
