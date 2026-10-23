// Package xa decodes the KWD1 audio blocks used by the ARCANA engine.
//
// The codec was recovered from xadec.dll (exports xaDecodeOpen,
// xaDecodeSize, xaDecodeConvert, xaDecodeClose).
//
// KWD1 header:
//
//	+0x00  "KWD1"
//	+0x04  uint32 compressed payload size
//	+0x08  uint32 original size (informational)
//	+0x0c  uint16 sample rate
//	+0x0e  byte   codec: 4, 6 or 8
//	+0x0f  byte   channels: 1 or 2
//	+0x10  16 bytes reserved
//
// The payload is a sequence of fixed-size blocks. Each block starts with a
// predictor byte (high nibble selects a coefficient pair, low nibble is the
// sample shift) followed by 32 packed samples. A two-tap adaptive filter then
// turns those into signed 16-bit PCM.
package xa

import (
	"encoding/binary"
	"fmt"
	"math"
)

// Audio is decoded PCM (interleaved little-endian int16).
type Audio struct {
	SampleRate int
	Channels   int
	PCM        []byte
}

// block sizes for codec ids.
func blockSize(codec byte) int {
	switch codec {
	case 4:
		return 17
	case 6:
		return 25
	case 8:
		return 33
	default:
		return 0
	}
}

// Decode decodes one KWD1 block into PCM.
func Decode(data []byte) (*Audio, error) {
	if len(data) < 32 || string(data[:4]) != "KWD1" {
		return nil, fmt.Errorf("xa: not a KWD1 block")
	}
	comp := int(binary.LittleEndian.Uint32(data[4:8]))
	rate := int(binary.LittleEndian.Uint16(data[12:14]))
	codec := data[14]
	channels := int(data[15])
	if rate <= 0 || (channels != 1 && channels != 2) {
		return nil, fmt.Errorf("xa: unsupported format rate=%d channels=%d", rate, channels)
	}
	if blockSize(codec) == 0 {
		return nil, fmt.Errorf("xa: unsupported codec %d", codec)
	}
	if 32+comp > len(data) {
		return nil, fmt.Errorf("xa: payload size %d exceeds buffer %d", comp, len(data))
	}
	payload := data[32 : 32+comp]
	bs := blockSize(codec)
	blocks := len(payload) / bs
	if blocks == 0 {
		return &Audio{SampleRate: rate, Channels: channels}, nil
	}

	var state [2][2]int16
	frames := blocks * 32
	if channels == 2 {
		frames = (blocks / 2) * 32
	}
	pcm := make([]byte, 0, frames*channels*2)
	var tmp [32]int16

	if channels == 1 {
		for b := 0; b < blocks; b++ {
			k := unpackBlock(codec, payload[b*bs:(b+1)*bs], &tmp)
			filter(&state[0], k, &tmp)
			appendPCM(&pcm, tmp[:])
		}
	} else {
		for b := 0; b+1 < blocks; b += 2 {
			k0 := unpackBlock(codec, payload[b*bs:(b+1)*bs], &tmp)
			filter(&state[0], k0, &tmp)
			var left [32]int16
			copy(left[:], tmp[:])
			k1 := unpackBlock(codec, payload[(b+1)*bs:(b+2)*bs], &tmp)
			filter(&state[1], k1, &tmp)
			for i := 0; i < 32; i++ {
				pcm = binary.LittleEndian.AppendUint16(pcm, uint16(left[i]))
				pcm = binary.LittleEndian.AppendUint16(pcm, uint16(tmp[i]))
			}
		}
	}

	return &Audio{SampleRate: rate, Channels: channels, PCM: pcm}, nil
}

func appendPCM(dst *[]byte, samples []int16) {
	for _, s := range samples {
		*dst = binary.LittleEndian.AppendUint16(*dst, uint16(s))
	}
}

func unpackBlock(codec byte, block []byte, out *[32]int16) int {
	k := int(block[0])
	switch codec {
	case 4:
		for i := 0; i < 16; i++ {
			b := block[1+i]
			out[i*2] = int16(uint16(b&0xF0) << 8)
			out[i*2+1] = int16(uint16(b) << 12)
		}
	case 6:
		for i := 0; i < 8; i++ {
			b0 := block[1+i*3]
			b1 := block[2+i*3]
			b2 := block[3+i*3]
			u := uint32(b0)<<16 | uint32(b1)<<8 | uint32(b2)
			out[i*4+0] = int16(uint16(b0&0xFC) << 8)
			out[i*4+1] = int16(uint16((u >> 2) & 0xFC00))
			out[i*4+2] = int16(uint16((u & 0xFFFFFFC0) << 4))
			out[i*4+3] = int16(uint16(u << 10))
		}
	case 8:
		for i := 0; i < 32; i++ {
			out[i] = int16(uint16(block[1+i]) << 8)
		}
	}
	return k
}

// Coefficients copied from xadec.dll .data at 0x7030 and 0x703c.
var (
	coeff1 = [16]int{0, 240, 460, 392, 488, 0, 0, 0, 208, 220, 240, 0, 5718, 4096, 65535, 65535}
	coeff2 = [16]int{0, 0, 208, 220, 240, 0, 5718, 4096, 65535, 65535, 65535, 65535, 2560, 0, 0, 0}
)

func filter(state *[2]int16, k int, samples *[32]int16) {
	idx := (k >> 4) & 0xF
	shift := uint(k & 0xF)
	t1 := coeff1[idx]
	t2 := coeff2[idx]
	p1 := int(state[0])
	p2 := int(state[1])
	for i, s := range samples {
		pred := p1*t1 - p2*t2
		pred = (pred + ((pred >> 31) & 0xFF)) >> 8
		v := int16((int(s) >> shift) + pred)
		samples[i] = v
		p2 = p1
		p1 = int(v)
	}
	state[0] = int16(p1)
	state[1] = int16(p2)
}

// EncodeWAV wraps PCM in a canonical 44-byte RIFF/WAVE header.
func EncodeWAV(a *Audio) []byte {
	dataLen := len(a.PCM)
	blockAlign := a.Channels * 2
	byteRate := a.SampleRate * blockAlign
	out := make([]byte, 44, 44+dataLen)
	copy(out[0:4], "RIFF")
	binary.LittleEndian.PutUint32(out[4:8], uint32(36+dataLen))
	copy(out[8:12], "WAVE")
	copy(out[12:16], "fmt ")
	binary.LittleEndian.PutUint32(out[16:20], 16)
	binary.LittleEndian.PutUint16(out[20:22], 1) // PCM
	binary.LittleEndian.PutUint16(out[22:24], uint16(a.Channels))
	binary.LittleEndian.PutUint32(out[24:28], uint32(a.SampleRate))
	binary.LittleEndian.PutUint32(out[28:32], uint32(byteRate))
	binary.LittleEndian.PutUint16(out[32:34], uint16(blockAlign))
	binary.LittleEndian.PutUint16(out[34:36], 16)
	copy(out[36:40], "data")
	binary.LittleEndian.PutUint32(out[40:44], uint32(dataLen))
	return append(out, a.PCM...)
}

// DurationMS is handy for logs/UI.
func (a *Audio) DurationMS() int {
	if a.SampleRate == 0 || a.Channels == 0 {
		return 0
	}
	return int(math.Round(float64(len(a.PCM)) / float64(a.SampleRate*a.Channels*2) * 1000))
}
