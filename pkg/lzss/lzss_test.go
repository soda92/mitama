package lzss

import "testing"

func TestDecodeLiterals(t *testing.T) {
	// Flag byte: low 8 bits set => eight literal bytes.
	src := []byte{0xFF, 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'}
	out, err := Decode(src, 8)
	if err != nil {
		t.Fatal(err)
	}
	if string(out) != "abcdefgh" {
		t.Fatalf("got %q", out)
	}
}

func TestDecodeBackReference(t *testing.T) {
	// 0x07 = three literals (a, b, c) followed by one match.
	// The match points at ring offset 0xFEE (the first literal) and copies
	// six bytes, producing "abcabcabc".
	src := []byte{0x07, 'a', 'b', 'c', 0xEE, 0xF3}
	out, err := Decode(src, 9)
	if err != nil {
		t.Fatal(err)
	}
	if string(out) != "abcabcabc" {
		t.Fatalf("got %q", out)
	}
}

func TestDecodeTruncated(t *testing.T) {
	if _, err := Decode([]byte{0x07, 'a'}, 8); err == nil {
		t.Fatal("expected an error for a truncated stream")
	}
}
