# Gallery

The gallery is a single full-screen screen with three tabs: **Pictures**,
**Scenes** and **Music**. It is opened from Settings or with **G**.

## Data

`GET /api/gallery?pack=dvd` returns:

```json
{
  "pictures": [
    {
      "key": "cga_a01",
      "name": "CGA_A01",
      "full": "/media/dvd/mitama/CGA_a01.bmp",
      "thumb": "/media/dvd/mitama/CGA_a01s.bmp",
      "variants": ["/media/dvd/mitama/CGA_a01.bmp"],
      "uses": [
        {
          "scene": "eyk1_06",
          "pc": 4,
          "line": 7,
          "speaker": "説",
          "dialogue": "そこでは…"
        }
      ]
    }
  ],
  "scenes": [
    { "name": "yr1_02", "title": "…", "chapter": "yr1" }
  ],
  "music": [
    {
      "name": "S003",
      "title": "導かれし魂",
      "duration": "1:18",
      "file": "bgm/S003.xa",
      "uses": ["yr1_02"],
      "count": 245
    }
  ]
}
```

- Pictures are grouped from `CG*.bmp`; names ending in `s` are thumbnails.
- Variants such as `_1` / `_2` are grouped under one picture.
- Scene titles come from the first `STS` command when present.
- Music usage is gathered by scanning every `MUS` command.

BGM titles and durations are recovered from the executable's sound-test tables
at `0x4a06dc` (title/duration pointer pairs) and `0x4a07cc` (S-filename
pointers). Variant files not in the table derive their base title with
`(別Ver.)`.

Scenes use the first `STS` command when present; otherwise the script name.
There is no official CG title metadata, so pictures use file stems and their
story-use context.

## Seen state

Seen state is stored in `localStorage` under `mitama.gallery.v1`:

```json
{
  "pictures": { "cga_a01": true },
  "scenes": { "yr1_02": true },
  "music": { "S003": true }
}
```

The Player marks:

- pictures when a `BMP CG…` command runs
- music when `MUS` starts a track
- scenes when the current position changes

Opening a picture or replaying a scene also marks it seen.

## Player

Pictures use an image viewer with left/right variant navigation. Each picture's
**Story** buttons list the scenes/commands where that CG appears, including the
first following dialogue line; clicking one closes the gallery and resumes the
script at that command. Music can be previewed with play/stop; the story BGM is
suspended while the gallery is open. Scenes can be replayed through the same
scene-loading path as the navigator.
