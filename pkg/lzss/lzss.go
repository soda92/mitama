// Package lzss implements the LZSS variant used by Ciel's ARCANA engine.
//
// The decoder mirrors the routine at 0x401230 in arcana.exe / mitama.exe:
//
//   - 0x1000-byte ring buffer, pre-filled with zeros
//   - write cursor starts at 0xFEE
//   - 16-bit flag word, low bit first; a zero high byte pulls in one byte
//   - flag 1: literal byte
//   - flag 0: 12-bit window offset in the low nibble of the second byte's high
//     nibble and a length in the low nibble; (low & 0x0F) + 3 bytes are copied
package lzss

import "fmt"

const (
	ringSize = 0x1000
	ringMask = ringSize - 1
	ringInit = 0xFEE
)

// Decode decompresses src into exactly outLen bytes. It returns an error if
// the input is truncated or the stream does not produce outLen bytes.
func Decode(src []byte, outLen int) ([]byte, error) {
	if outLen < 0 {
		return nil, fmt.Errorf("lzss: negative output length %d", outLen)
	}
	out := make([]byte, 0, outLen)
	if outLen == 0 {
		return out, nil
	}

	var ring [ringSize]byte
	r := ringInit
	var flags uint16
	i := 0

	for len(out) < outLen {
		flags >>= 1
		if flags&0x100 == 0 {
			if i >= len(src) {
				return nil, fmt.Errorf("lzss: truncating at output %d/%d", len(out), outLen)
			}
			flags = 0xFF00 | uint16(src[i])
			i++
		}

		if flags&1 != 0 {
			if i >= len(src) {
				return nil, fmt.Errorf("lzss: truncating at output %d/%d", len(out), outLen)
			}
			b := src[i]
			i++
			out = append(out, b)
			ring[r] = b
			r = (r + 1) & ringMask
			continue
		}

		if i+1 >= len(src) {
			return nil, fmt.Errorf("lzss: truncating back-reference at output %d/%d", len(out), outLen)
		}
		b1, b2 := src[i], src[i+1]
		i += 2
		pos := int(b1) | (int(b2&0xF0) << 4)
		n := int(b2&0x0F) + 3
		for j := 0; j < n && len(out) < outLen; j++ {
			b := ring[(pos+j)&ringMask]
			out = append(out, b)
			ring[r] = b
			r = (r + 1) & ringMask
		}
	}

	return out, nil
}
