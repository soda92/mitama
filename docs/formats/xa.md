# KWD1 / .XA audio

Every `.xa` file in the archives is a **KWD1** block. It is decoded by
`xadec.dll` (`xaDecodeOpen`, `xaDecodeSize`, `xaDecodeConvert`,
`xaDecodeClose`) and output as 16-bit signed PCM.

The Go implementation is `pkg/xa`; the server converts on demand at
`/api/audio` and the CLI can convert a file directly:

```sh
go run ./cmd/xadecode -o S001.wav data/dvd/bgm/S001.xa
```

## Header

```c
struct KWD1 {
    char     magic[4];       // "KWD1"
    uint32_t compressed;     // payload bytes after the header
    uint32_t original;       // informational
    uint16_t sample_rate;    // 22050 or 44100 (one file is 22255)
    uint8_t  codec;          // 4, 6 or 8
    uint8_t  channels;       // 1 or 2
    uint8_t  reserved[16];
};
```

The payload starts at offset `0x20` and is a sequence of fixed-size blocks:

| Codec | Block size | Samples per block |
| ---: | ---: | ---: |
| 4 | 17 | 32 |
| 6 | 25 | 32 |
| 8 | 33 | 32 |

For stereo, every two consecutive blocks form one 32-frame stereo group: the
first block is the left channel and the second is the right channel.

## Block decoding

Each block starts with a predictor byte `k`:

- `shift = k & 0x0F`
- `index = k >> 4` (0–15)

The remaining bytes are unpacked into 32 signed 16-bit samples.

### Codec 8

One byte per sample:

```text
s[i] = int16(b[i] << 8)
```

### Codec 4

16 bytes, two 4-bit samples per byte:

```text
s[2i]   = int16((b & 0xF0) << 8)
s[2i+1] = int16(b << 12)
```

### Codec 6

8 groups of 3 bytes, four samples per group:

```text
u = (b0 << 16) | (b1 << 8) | b2
s0 = (b0 & 0xFC) << 8
s1 = (u >> 2) & 0xFC00
s2 = (u & 0xFFFFFFC0) << 4
s3 = u << 10
```

## Adaptive filter

After unpacking, each sample passes through a two-tap filter. State is kept
per channel.

```text
pred = prev1 * c1[index] - prev2 * c2[index]
pred = (pred + ((pred >> 31) & 0xFF)) >> 8
out  = int16((sample >> shift) + pred)

prev2 = prev1
prev1 = out
```

Coefficient tables from `xadec.dll` `.data` at `0x7030` (`c1`) and `0x703c`
(`c2`):

```text
c1 = [0, 240, 460, 392, 488, 0, 0, 0, 208, 220, 240, 0, 5718, 4096, 65535, 65535]
c2 = [0,   0, 208, 220, 240, 0, 5718, 4096, 65535, 65535, 65535, 65535, 2560, 0, 0, 0]
```

All arithmetic is done on 32-bit signed values and truncated to 16 bits at the
end, matching the original 32-bit x86 code.

## Verification

The Go decoder was compared byte-for-byte against `xadec.dll` under Wine for:

- `S001.xa` — codec 8, mono, 22050 Hz, 82 s
- `Se001.xa` — codec 6, stereo, 44100 Hz
- `000.xa` — codec 8, stereo, 44100 Hz
- `S027.xa` — codec 8, stereo, 22050 Hz

All four decodes produced identical PCM. `cmd/xadecode` and
`pkg/xa/xa_test.go` cover the format.
