# English translation

Last updated: 2026-10-25.

The web player has a bilingual dialogue mode. Japanese remains the source of
truth; English is stored as sidecar data so the original scripts and stage
assets are never modified.

This follows the same idea as the G-string build: each dialogue line carries
both languages, the speaker name has a translation dictionary, and the UI can
switch language at any time.

## Data model

The server adds optional fields to the parsed script:

```json
{
  "cmd": "TEXT",
  "speaker": "八",
  "message": "文永捨壱年　文永の役",
  "messageEn": "Bun'ei Suteichi Year, Bun'ei War"
}
```

Choices get a parallel field:

```json
{
  "text": "南寄りの行程で伊勢へ",
  "textEn": "Heading south to Ise",
  "label": "南"
}
```

The frontend selects the field for the current language. If a translation is
missing, it falls back to Japanese rather than showing an empty line.

Speaker names are not sent through Google Translate. The frontend dictionary in
`web-app/src/game/types.ts` maps them:

```text
八 -> 八尋 -> Yahiro
阿 -> 阿門 -> Amon
更 -> 更紗 -> Sarasa
諏 -> 諏慧姫 -> Suikihime
...
```

Combined tags such as `紅・諏` become `Kureha / Suikihime`.

## Translation file

Generated file:

```text
data/dvd/translations.json
```

`data/` is gitignored, so translated text stays local alongside the extracted
game data.

Structure:

```json
{
  "version": 1,
  "source": "ja",
  "target": "en",
  "scenes": {
    "yr1_00": {
      "4": {
        "source": "文永捨壱年　文永の役￥...",
        "text": "Bun'ei...￥..."
      }
    },
    "yr1_01": {
      "580": {
        "source": "",
        "options": {
          "南寄りの行程で伊勢へ": "Heading south to Ise"
        }
      }
    }
  }
}
```

Entries are keyed by **scene name and command index**, not line number. The
server validates `source` before applying a text translation, so editing a
script cannot silently attach an old translation to the wrong line. Missing or
mismatched entries fall back to Japanese.

Page breaks are kept as `￥`. The translator splits pages, translates them
separately, then rejoins them, so the typewriter and page navigation keep
working.

## Tool

```sh
go run ./cmd/translate -pack dvd
```

Useful flags:

```text
-data ./data
-pack dvd
-out data/dvd/translations.json
-batch 50            strings per request
-max-chars 800       source characters per request
-max-url 7500        encoded URL limit
-workers 4           parallel requests
-sleep 500ms         delay after each request
-save-every 10       batches between file writes
-scene yr1_00,yr1_01 only selected scene prefixes
-limit 100           test a bounded number of strings
-force               retranslate existing entries
```

The tool is resumable: it reads the existing `translations.json`, skips entries
whose source still matches, and writes after each checkpoint. Interrupted runs
can simply be restarted.

It uses the public Google Translate web endpoint:

```text
https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=ja&tl=en
```

This is not the paid Cloud Translation API. It is rate-limited and can return
`429`; the tool retries with backoff and treats `400` from an overlong URL by
splitting the batch. For a stable production workflow, use a Google Cloud
Translation API key or another provider.

### Current run

The full DVD text corpus is:

- 420 scene scripts
- 58,635 dialogue commands
- about 1.19 million Japanese characters
- 1,350 choice options

The generated file is about 10 MB and lives under `data/dvd/`.

## Using it in the game

Three equivalent controls:

- toolbar button: `EN` / `JA`
- Settings sidebar → language
- keyboard: `L`

The setting is persisted in `mitama.settings.v1`. Switching language redraws
the current line immediately, including open choice menus; it does not
re-trigger voices or change script position.

The language is a client setting, not part of story archives. An archive made in
Japanese can be loaded while English is selected; both languages come from the
same script position.

## Limitations

- Machine translation quality is uneven, especially for period vocabulary,
  honorifics, names and sexual content.
- A manually reviewed glossary/translation overlay would be needed for a
  publishable localization.
- Translation is tied to the current script command index and source text;
  rerun the tool after editing scripts.
- The current tool translates dialogue and choice text only. Menus, archive UI
  and gallery labels remain in their existing language.
- The Google endpoint is unofficial and may change or rate-limit. The server
  never calls Google at runtime.
