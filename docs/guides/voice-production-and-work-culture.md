# Voice production, studio work culture and marketing (2001)

> Production-context notes for **御魂 ～忍～ / Mitama ~Shinobi~**.
> This covers the voice-recording chain, the KWD1/`.XA` delivery format, the
> company/work structure, and how a 2001 adult PC game was marketed and sold.
> It is not a content guide.

## Part 1 — Voice recording and delivery

### What is actually on the voice disc

The voice is not stored as 16-bit PCM. It is stored as **KWD1 codec 8**, an
8-bit ADPCM family, decoded by `xadec.dll` and output as 16-bit PCM.

Measured from the first-press voice disc:

| Item | Value |
| --- | --- |
| Files | 8,053 |
| Container | KWD1 |
| Codec | 8 (8-bit ADPCM) |
| Channels | mono |
| Sample rate | 7,287 files @ 22,050 Hz; 764 @ 44,100 Hz; 2 @ 22,255 Hz |
| Total size | ~727 MB |
| Total duration | ~8.1 hours |
| Median line length | ~2.5 seconds |
| Longest line | ~27.8 seconds |

Each 32-sample block is 33 bytes: one predictor/shift byte plus 32 sample
bytes. That is about **8.25 bits per sample**, or roughly **22.7 KB/s** at
22.05 kHz. The decoder reconstructs 16-bit PCM, but the source is still
quantised 8-bit ADPCM.

The two 22,255 Hz files are almost certainly a sample-rate conversion artifact,
not a different recording chain.

### Likely recording chain

The disc does not document the microphone, preamp or studio. A plausible
Japanese voice-studio chain in 2001 would look like this:

| Stage | Likely equipment |
| --- | --- |
| Microphone | Neumann U87/U89, AKG C414, Sony C-38B, Audio-Technica AT4050 |
| Preamp | Neve 1073/1084, API 512, SSL channel, Avalon VT-737, UA 6176 |
| Compression | UREI 1176, Teletronix LA-2A, DBX 160 |
| Recorder | Pro Tools Mix-era system, Sonic Solutions, SADiE, or DAT |
| DAT examples | Sony PCM-R500 / PCM-2700A, Panasonic SV-3800 |
| Monitoring | Yamaha NS-10M or similar |
| Room | Small treated vocal booth, pop filter, shock mount |

The session was probably captured at **16-bit/44.1 kHz** or **24-bit/48 kHz**,
edited per line, and delivered as PCM. The developer then downsampled and
encoded to KWD1.

Because this is an ADV, there is no lip-sync. Recording is closer to a radio
drama: actors work from the script, often by character and scene rather than in
chronological order. The sound director or producer gives context; the scenario
writer may attend, depending on the project. That lets an actor record hundreds
of short lines in a session without waiting for final animation.

### Why XA / KWD1?

The `.XA` extension is a CD-era naming convention, but the payload here is
**custom KWD1**, not Sony's CD-XA ADPCM bitstream. The reasons for using it are
practical:

1. **Space.**
   16-bit/44.1 kHz mono is about 88 KB/s.
   8-bit/22.05 kHz ADPCM is about 22.7 KB/s.
   That is roughly a **4× reduction**. Eight hours of voice would be about
   2.5 GB as 16/44.1 mono; the actual voice disc is about 727 MB.

2. **CD-ROM streaming.**
   A 1× CD-ROM transfers about 150 KB/s. At 22.7 KB/s, voice leaves room for
   seeking, BGM and SE. The separate voice disc is designed to stream
   independently of the game disc.

3. **CPU cost.**
   On a 200 MHz Pentium, a fixed-block ADPCM decoder is cheap and predictable.
   MP3/AAC decoding would have been heavier and less attractive for a game that
   also needs CPU for battles and transitions.

4. **Engine reuse.**
   The ARCANA engine already used `xadec.dll` for BGM and SE. Reusing the same
   KWD1 family for voice kept one audio path.

5. **Scalable quality.**
   KWD1 supports 4-, 6- and 8-bit ADPCM, mono/stereo, and 22.05/44.1 kHz. The
   game uses 8-bit mono for voice; some SE use 44.1 kHz 6-bit stereo. The engine
   can choose the tradeoff per content type.

The exact encoder is not shipped on the disc; only the decoder DLL is. The
studio delivered PCM and the developer encoded it offline.

### Why it still sounds clear

Voice is a forgiving signal, and the production chain was good:

- speech energy is concentrated below roughly 8 kHz; 22.05 kHz gives an
  11.025 kHz Nyquist limit, enough for intelligibility and most consonants;
- 8-bit **ADPCM** is not naive 8-bit PCM; the two-tap adaptive predictor removes
  redundancy, so quantisation error is applied mostly to the residual;
- close-mic recording gives a high signal-to-noise ratio, and the voice masks
  codec noise;
- mono avoids stereo phase and masking problems;
- ADPCM has no MP3-style block artifacts; its errors are more like a soft hiss.

It is not audiophile fidelity. Dynamic range is limited, very quiet breaths and
room tone can disappear, loud screams need limiting, and the 22.05 kHz files are
band-limited to about 11 kHz. The format captures the **performance** — timing,
pitch, breath and emotion — but not the full technical range of a 24-bit/96 kHz
master. What you hear is a well-recorded performance through a lossy but
voice-appropriate codec.

## Part 2 — Company structure and work culture

### Space Project and Ciel

Space Project was primarily an adult-game **publisher/sales company**, not a
single integrated development studio. It operated multiple brands — JANIS,
Ciel, SPEED, NOA and others — and relied heavily on external production
companies for development.

Ciel was one of those brands. Its identity was strongly tied to **Tony's art**.
The credits for *Mitama* show the layered structure:

```text
制作        sorciere        actual development
製作        FORCE           production/project
発売・販売  Ciel            brand, publishing and sales
```

### Tony's company: rpm

Tony's own company was **有限会社アールピーエム / rpm**, not just a personal
artist label:

| Item | Detail |
| --- | --- |
| Name | 有限会社アールピーエム (rpm Y.K.) |
| Founded | July 2000, Sendai (Aoba-ku) |
| Earlier | Team “rpm” formed in 1998 |
| Representative | 田中 貴之 (Tony) |
| Capital | ¥3,000,000 |
| Staff | 13 (archived 2012 profile) |
| Offices | Tokyo (Shinjuku) and Sendai |
| Business | Software planning, development and sales |

Timeline: Team “rpm” formed in 1998; company founded in July 2000; Tokyo
office opened in September 2003; the main base moved to Tokyo in February 2005.

Its archived client list included Sega, Toranoana, Harvest Publishing,
MediaWorks, France Shoin, Studio Frontline, Stoneheads, Unspeakable and others.
That is a real small production company with multiple clients, not a one-person
art circle.

rpm's own product page lists *Partner*, *Room with Lina*, *Tsubasa no
Hatameki*, *Arcana*, *Mitama*, *Genmukan*, *After...*, *Sora no Iro*, *Shin
Genmukan* and *Shining Tears*. The formal *Mitama* credits still name
**sorciere** for 制作 and **FORCE** for 製作, so the exact division of labour is
not public. The safest reading is:

> rpm was Tony's production base and lists *Mitama* among its works, while
> sorciere/Force are the credited development/production entities.

Later Ciel/Tony titles — *After...*, *そらのいろ、みずのいろ*, *真章 幻夢館*,
*Fault!!* — are credited to **rpm** as the production company. By 2013 Tony was
also leading the production group **AlbionWorks**; rpm's website is now only
archived.

A simplified structure:

```text
Space Project (publisher/sales, multiple brands)
  └── Ciel (brand: planning, marketing, title identity)
        ├── external development studio (sorciere / Force / later rpm)
        ├── contracted artist (Tony)
        ├── contracted scenario writer (さとだみつひこ)
        ├── contracted composer/sound director
        ├── external voice studio and cast
        ├── QA/testers
        └── manufacturing, distribution and retail
```

The brand-level core team was probably small — often a producer/director plus a
few planners and production staff — while art, writing, music, programming,
voice and testing were brought in per project. That is a different model from a
large console studio with hundreds of internal staff.

### Typical project roles

| Role | Typical arrangement |
| --- | --- |
| Producer / director | Brand or publisher staff; project owner |
| Scenario | Often freelance or external studio |
| Character art / CG | Contracted artist or small art studio |
| Programming | External studio or a few in-house programmers |
| Sound director / composer | Contracted; coordinates BGM, SE and voice |
| Voice casting / recording | External voice studio; producer/sound director attends |
| QA / debug | Small in-house team plus testers |
| Sales / distribution | Publisher; specialty retail and mail order |

This is why credits often list several company names for one title. The brand is
the commercial face; the actual work is distributed across a network of small
studios and freelancers.

### Work culture

The structural pattern encouraged a particular working culture:

- **Project-based and deadline-driven.** Release dates were tied to retail
  seasons, magazine coverage and pre-orders. Teams crunched near master-up.
- **Small core, many freelancers.** Few people were salaried; many were paid per
  project or per asset. Job security depended on the next title.
- **Generalists.** A director might also write, script, cast and debug. A
  programmer might handle tools, engine code and packaging.
- **Late QA and post-release patches.** *Mitama* itself received patches for
  Windows Me installation, voice-output problems, typos, recollection-mode
  bugs, Windows 2000 rendering, save errors and battle/route bugs. The special
  price DVD also needed a patch. That is a small-team QA culture, not a
  large-platform certification pipeline.
- **Hit-driven economics.** Adult PC games were niche, relatively expensive per
  unit, and sold through age-restricted specialty channels. A few hits
  subsidised the catalogue; re-releases and download editions extended the tail.
- **Close fan communication.** Official sites, demo movies, magazines, pre-order
  bonuses and mail order created a direct loop between creators and a small
  audience. Artist and writer names were marketed heavily.

### Voice-actor work culture

Voice work was usually contracted per project rather than salaried:

- casting through the publisher/sound director and an external voice studio;
- recording by character and scene, without lip-sync;
- many short lines per session, with per-line editing afterwards;
- adult-game work often credited under an alias, separate from general anime
  and console work;
- payment per role/session rather than residuals;
- schedules could be tight because voice was recorded before final programming
  and sometimes before all art was complete.

The alias system is not cosmetic. It let actors work in adult games while
maintaining a separate general-audience career. Maki Midori / Touko Itou is a
clear example: the same performer is credited as **Midori Maki** in general
work and **Touko Itou** in adult games.

## Marketing and purchasing in 2001

### The marketing funnel

A Ciel-type adult PC game was marketed through a small, specialised funnel:

1. **Magazine announcement.**
   Titles were announced and covered in *Tech Gian*, *BugBug*, *Push!!*,
   *MegaStore*, *Dengeki Hime* and similar magazines. *Tech Gian* was a
   DVD-ROM magazine, so it could carry demo discs and large media assets.

2. **Official website.**
   Ciel's *Mitama* page had story, system, characters, gallery, downloadable
   wallpapers and a **66 MB MPEG-1 demo movie** (1:43). That was a large
   download in 2001; magazine discs and shop demos mattered.

3. **Character/artist reveal.**
   Tony's name and art were the main hook. Character profiles and sample CG
   were released before the game. The package art, telephone cards and
   wallpapers were part of the same visual campaign.

4. **Demo and store presence.**
   A playable or movie demo circulated through magazines and stores. The
   Special Price edition later included the original store demo as an extra.

5. **Preorder campaign.**
   Preorder bonuses were central to the market: telephone cards, drama CDs,
   art books, tapestries, clear files and shop-specific extras. I have not
   confirmed a complete *Mitama*-specific bonus list, but these were the
   standard campaign items of the period.

6. **Release and word of mouth.**
   Release-day sales at specialty shops, official BBS/fan sites and 2ch
   threads created the first wave of impressions. Reviews and play reports in
   magazines followed.

7. **Long tail.**
   *Mitama* got a Special Price DVD in 2002 and a download edition in 2007.
   The 2002 edition added a newly recorded image song and image movie, a
   24-page full-colour character guidebook, new Tony package art, Windows XP
   support, the old store demo and new wallpapers. A novelisation followed in
   2002, and the Milky OVA in 2009.

The overall pattern was **artist-led, magazine-mediated and preorder-driven**,
not mass-market advertising.

### Where users bought the game

In 2001 the normal purchase was a physical CD-ROM package:

- **Specialty PC-game shops** in Akihabara, Nipponbashi, Osu and other otaku
  districts: Sofmap, Messe Sanoh, Toranoana, Getchu, Trader and similar stores.
- **Mail order / online shops**, often with telephone or fax ordering as well
  as web ordering. Payment was typically credit card or cash on delivery.
- **Age-restricted floors or sections.** Adult PC games were sold in separate
  18+ areas, with age checks at the shop or on delivery.
- **Preorder at a specific shop** to get that shop's bonus. Some fans bought
  multiple shop editions for different telephone cards or tapestries.
- **Used market** after release: Sofmap, K-Books, Mandarake and similar
  stores bought and resold packages.

The standard price was **¥8,800 pre-tax** (¥9,240 with tax). The 2002 Special
Price DVD was **¥4,800 pre-tax**. The 2007 download edition was sold through
DLsite, Getchu, Gyutto and Digiket rather than Steam.

There was no general mass-market release, no console version and no global
digital storefront. The audience was niche, adult and geographically
concentrated around the specialty-shop districts.

### Was it different from mainstream game companies?

Yes in structure, less so in deadline pressure.

| Dimension | Adult PC game (Ciel-type) | Mainstream console game |
| --- | --- | --- |
| Team size | Small core plus freelancers | Larger internal team |
| Approval | No console first-party certification | Platform holder certification |
| Budget | Comparatively modest | Larger |
| Sales channel | Age-restricted specialty retail/mail order | Mass retail and platform stores |
| Marketing | Artist/writer/voice cast, magazines, demo movies | Broad media and platform marketing |
| Career structure | Project-based, precarious | More structured, still project-based |
| Crunch | Common | Common |

The adult-game field was not a monolith. Some companies were tiny circle-like
operations; others, like Space Project, were commercial publishers with multiple
brands and retail reach. Ciel/Space Project was closer to the commercial end,
but still depended on a small creative core and external studios.

The biggest cultural differences were:

- **No console gatekeeper.** Faster and cheaper to ship, but no platform QA or
  certification safety net.
- **Direct niche audience.** Stronger creator-brand loyalty, but a much smaller
  market and higher dependence on hits.
- **Alias and privacy culture.** Voice actors and staff often separated adult
  and general-audience identities.
- **More visible auteur names.** Fans followed the artist, writer or voice cast,
  not just the brand.
- **More precarious employment.** Fewer salaried positions, more project work
  and more financial fragility.

### Caveats

Public data on 2001 adult-game salaries, hours and contracts is sparse. The
company structure above is documented by credits and brand histories; the
work-culture picture is a structural inference plus common industry accounts,
not audited statistics. Treat it as a map of the typical model, not a claim
about every studio.

## Sources

- [Ciel: 御魂 ～忍～ official page](https://www.sp-janis.com/ciel/mitama/)
- [Ciel: 御魂 ～忍～ support page](https://www.sp-janis.com/ciel/mitama/support.html)
- [Ciel: 御魂 ～忍～ Special Price page](https://www.sp-janis.com/ciel/mitama/specialprice.html)
- [Wikipedia (ja): スペースプロジェクト](https://ja.wikipedia.org/wiki/スペースプロジェクト)
- [Wikipedia (ja): Tony](https://ja.wikipedia.org/wiki/Tony)
- [Wikipedia (en): Tony Taka](https://en.wikipedia.org/wiki/Tony_Taka)
- [Archived rpm company profile](https://web.archive.org/web/20120717105211/http://www.rpm-web.com/outline.html)
- [Archived rpm product list](https://web.archive.org/web/20120717105211/http://www.rpm-web.com/product.html)
- [SEGA VOICE: Tony interview](https://www.sega.jp/fb/segavoice/041103/01.html)
- [VNDB: Mitama download edition](https://vndb.org/r70848)
- [Wikipedia (ja): 真木碧](https://ja.wikipedia.org/wiki/真木碧)
- [VNDB: Maki Midori](https://vndb.org/s2000)

## Related

- [KWD1 / .XA audio format](../formats/xa.md)
- [Tony and Ran's voice actor](tony-and-ran-voice-actor.md)
- [Mitama cultural and market context](mitama-culture-context.md)
- [In-story adult scene guide (18+)](in-story-adult-scenes.md)
