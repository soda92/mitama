# ARC archives

All game data lives in `.arc` files: `mitama.arc`, `shinobi.arc`, `text.arc`,
`bgm.arc`, `se.arc`, `bagui.arc`, `battle.arc`, `object.arc`, `sprite.arc`,
`kunoichi.arc`, `kuno_EX.arc`.

The same format appears in the 2000 `arcana` demo and the 2001 shop demo.

## Directory

```text
uint32 count
count × 36-byte records
```

Records are **additively encoded** with the six-byte key `arcana`:

```text
plain[i] = cipher[i] + "arcana"[i % 6]   (mod 256)
```

Decoded record:

```c
struct Entry {
    char     name[24];   // CP932, NUL padded
    uint32_t size;       // uncompressed size (or stored size when raw)
    uint32_t stored;     // bytes occupied in the archive
    uint32_t offset;     // absolute offset from archive start
};
```

The file payloads begin immediately after the record table. Offsets are
absolute, so archives are easy to seek.

### Verification

`kunoichi.arc` entry 0 decodes to:

```text
name   = "kunoichi.asc"
size   = 258,710
stored = 258,710
offset = 289,948
```

`289,948 == 4 + 8054 * 36`, and the bytes at that offset are the CP932 voice
manifest beginning with `arcana\r\nD:\mitama\Voice\...`.

The shop-demo `game.arc` entry 0 decodes to:

```text
name   = "00.bmp"
size   = 248
stored = 54
offset = 6,160
```

The 54 stored bytes decompress to a valid 8×8 24-bit BMP; entry 1 `00_1.bmp`
decompresses to a 640×480 24-bit BMP (921,656 bytes).

## Payload encoding

Three cases occur:

1. **Raw LZSS** — present when `stored < size` (images, scenario text).
2. **Raw** — WAVs, the `kunoichi.asc` manifest and structural data.
3. **KWD1 audio** — every `.xa` entry stores a 32-byte KWD1 audio block.

`KWD1` is **not** the LZSS compression described below. It is the audio
codec container used by `xadec.dll`; see [xa.md](xa.md). The extractor keeps
`.xa` entries raw and the server decodes them to WAV on demand.

The record's `stored` value includes the 32-byte KWD1 header
(`stored == compressed + 32`), which is why `size == stored` for `.xa` entries.

## LZSS codec

Reverse-engineered from the decoder at `0x401230` in `arcana.exe` and
`mitama.exe`. It is the classic Okumura LZSS variant with a 4 KB ring buffer.

```text
ring[0x1000] = { 0 }
r = 0xFEE
flags = 0

loop:
    flags >>= 1
    if (flags & 0x100) == 0:
        flags = 0xFF00 | next_byte()      # 8 flag bits, LSB first
    if flags & 1:
        b = next_byte()
        output(b); ring[r] = b; r = (r + 1) & 0xFFF
    else:
        b1 = next_byte(); b2 = next_byte()
        pos = b1 | ((b2 & 0xF0) << 4)
        n   = (b2 & 0x0F) + 3
        repeat n times:
            b = ring[(pos + i) & 0xFFF]
            output(b); ring[r] = b; r = (r + 1) & 0xFFF
```

Notes:

- The ring starts zero-filled, so the first back-references legitimately
  produce leading zero bytes (files often start with hundreds of zeros).
- Copying is sequential and overlapping: the freshly written bytes are visible
  to the rest of the same match, exactly like `memcpy`-free ring copying.
- Output stops at the declared uncompressed size.

Go implementation: `pkg/lzss`.

## Extraction rule

```text
stored := archive[offset : offset+stored]

if entry extension is .xa:
    out = stored                 # raw KWD1 audio block
else if len(stored) < size:
    out = lzss(stored, size)     # BMP / scenario text
else:
    out = stored                 # WAV / manifest / structural data
```

This handles BMPs, scenario text, WAVs, `.XA` voice files and the manifest.

## Archive inventory

| Archive | Entries | Extensions |
| --- | ---: | --- |
| `mitama.arc` | 751 | `.bmp` |
| `shinobi.arc` | 3,444 | `.xa` + `.asc` |
| `kuno_EX.arc` | 582 | `.xa` + `.asc` |
| `kunoichi.arc` | 8,054 | `.xa` (KWD1) + `.asc` |
| `bgm.arc` | 42 | `.xa` |
| `se.arc` | 310 | `.xa` |
| `text.arc` | 420 | `.txt` |
| `sprite.arc` | 224 | `.bmp` |
| `bagui.arc` | 315 | `.bmp` |
| `battle.arc` | 189 | `.chr` `.pty` `.dat` `.ini` |
| `object.arc` | 508 | `.spt` `.mtn` `.o` `.dat` `.bak` `.asc` |
