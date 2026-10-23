# Disc images

The game exists in three relevant forms:

| Release | Container | Contents |
| --- | --- | --- |
| 初回版 (2001) | CloneCD `.ccd` + `.img` + `.sub` | voice disc: `kunoichi.arc` only |
| メッセサンオー特典 | Alcohol `.mdf` + `.mds` | shop demo + wallpapers + `arcana` demo |
| DVD-ROM 版 (2002) | UDF `.iso` | complete game |

## Sector layouts

A disc image stores 2352-byte raw sectors (sync/header, 2048 bytes of user
data, ECC). Some formats append subchannel data.

| Format | Sector size | User data offset |
| --- | --- | --- |
| Plain ISO | 2048 | 0 |
| CloneCD `.img` (Mode 1) | 2352 | 16 |
| Alcohol `.mdf` (+96 subchannel) | 2448 | 16 |

`pkg/disc` probes the PVD at logical sector 16 for each candidate layout:

```text
offset = 16 * sectorSize + dataOffset
check bytes [1:6] == "CD001"
```

The first-press `IMAGE.img` is exactly `355769 * 2352` bytes; the bonus
`VOL_*.mdf` is exactly `327447 * 2448` bytes.

## ISO 9660

Implemented in `pkg/disc`:

1. Read the primary volume descriptor at sector 16.
2. Read the root directory record at offset 156.
3. Walk directory records; `;1` version suffixes are stripped.
4. Expose each file as an `io.ReaderAt` so the ARC reader can seek directly
   into a 728 MB archive without copying it.

The first-press CCD is ISO 9660 and contains exactly one file:

```text
kunoichi.arc   728,263,139 bytes
```

It is a **voice archive**, not the game. `kunoichi.arc` holds
`kunoichi.asc` (a CP932 path manifest) and 8,053 `.XA` voice clips.

## UDF

The DVD-ROM ISO is **UDF 1.02**, not ISO 9660, so the Go reader cannot mount it
yet. For development, extract the archive files with a UDF-capable tool:

```sh
7z x mitama-dvd.iso -o.cache/dvd \
  '*.arc' '*.exe' '*.dll' 'readme.txt'
go run ./cmd/extract -src .cache/dvd -out ./data -pack dvd
```

Implementing a small read-only UDF reader is a later quality-of-life task; it
would let the server read directly from the ISO.

## DVD file inventory

| File | Size | Role |
| --- | ---: | --- |
| `mitama.arc` | 178 MB | 751 background/CG BMPs |
| `kunoichi.arc` | 728 MB | 8,053 voice clips |
| `shinobi.arc` | 340 MB | 3,443 voice clips |
| `kuno_EX.arc` | 88 MB | 581 voice clips |
| `bgm.arc` | 74 MB | 42 music tracks (`S*.XA`) |
| `se.arc` | 19 MB | 310 sound effects/voices (`*.XA`) |
| `text.arc` | 5.6 MB | 420 CP932 scenario scripts |
| `sprite.arc` | 4.3 MB | 224 character/effect BMPs |
| `bagui.arc` | 8.2 MB | 315 UI BMPs |
| `battle.arc` | 83 KB | 131 `.chr`, 52 `.pty`, 5 `.dat` |
| `object.arc` | 179 KB | 215 `.spt`, 202 `.mtn`, 85 `.o` |
