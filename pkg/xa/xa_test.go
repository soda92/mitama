package xa

import (
	"encoding/binary"
	"testing"
)

func kwd(codec, channels byte, blocks ...[]byte) []byte {
	var payload []byte
	for _, b := range blocks {
		payload = append(payload, b...)
	}
	h := make([]byte, 32, 32+len(payload))
	copy(h, "KWD1")
	binary.LittleEndian.PutUint32(h[4:8], uint32(len(payload)))
	binary.LittleEndian.PutUint32(h[8:12], uint32(len(payload)))
	binary.LittleEndian.PutUint16(h[12:14], 22050)
	h[14] = codec
	h[15] = channels
	return append(h, payload...)
}

func TestMonoCodec8(t *testing.T) {
	block := make([]byte, 33)
	block[0] = 0x08
	for i := 0; i < 32; i++ {
		block[1+i] = byte(i + 1)
	}
	a, err := Decode(kwd(8, 1, block))
	if err != nil {
		t.Fatal(err)
	}
	if a.Channels != 1 || a.SampleRate != 22050 || len(a.PCM) != 64 {
		t.Fatalf("audio = %+v len=%d", a, len(a.PCM))
	}
	for i := 0; i < 32; i++ {
		got := int16(binary.LittleEndian.Uint16(a.PCM[i*2:]))
		want := int16(byte(i + 1))
		if got != want {
			t.Fatalf("sample %d = %d, want %d", i, got, want)
		}
	}
}

func TestStereoCodec8(t *testing.T) {
	left := make([]byte, 33)
	right := make([]byte, 33)
	left[0], right[0] = 0x08, 0x08
	for i := 0; i < 32; i++ {
		left[1+i] = 1
		right[1+i] = 2
	}
	a, err := Decode(kwd(8, 2, left, right))
	if err != nil {
		t.Fatal(err)
	}
	if a.Channels != 2 || len(a.PCM) != 128 {
		t.Fatalf("channels=%d len=%d", a.Channels, len(a.PCM))
	}
	for i := 0; i < 32; i++ {
		l := int16(binary.LittleEndian.Uint16(a.PCM[i*4:]))
		r := int16(binary.LittleEndian.Uint16(a.PCM[i*4+2:]))
		if l != 1 || r != 2 {
			t.Fatalf("frame %d = %d/%d", i, l, r)
		}
	}
}

func TestEncodeWAV(t *testing.T) {
	w := EncodeWAV(&Audio{SampleRate: 22050, Channels: 1, PCM: []byte{0, 0}})
	if string(w[:4]) != "RIFF" || string(w[8:12]) != "WAVE" || string(w[36:40]) != "data" {
		t.Fatalf("bad header: %q", w[:44])
	}
	if got := binary.LittleEndian.Uint32(w[40:44]); got != 2 {
		t.Fatalf("data size = %d", got)
	}
}
