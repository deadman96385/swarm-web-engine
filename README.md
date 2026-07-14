# Swarm Web Engine

A dependency-free browser reimplementation of **geoDefense Swarm** (Critical Thought Games, 2009/2012). The engine is an independent JavaScript rewrite informed by the archived Windows Phone build. It **plays standalone**: the site ships the mission/level data and localized UI text and renders **all graphics and audio procedurally** — canvas/WebGL vector art, Web Audio sound effects, and a formant-synthesized "female computer" countdown voice. It bundles **no** sprite sheets, artwork, WAV audio, or game binaries.

Owners of the original Windows Phone `.xap` / iOS `.ipa` can *optionally* load them (from **Help &amp; Options → Load original archives**) to swap in the authentic sprites, artwork, and WAV audio. The engine extracts only the content it uses and caches that payload in IndexedDB, so it survives reloads without retaining the full packages. Nothing is uploaded or written into the build; the **Use procedural graphics** / **Use original graphics** toggle switches presentations without discarding the cache or restarting an active mission.

## Play online

Just open the hosted engine — it boots straight to the menu and is immediately playable, including the Level Pack 1 bonus missions and the 34-mission **Original geoDefense** campaign:

**▶ https://deadman96385.github.io/swarm-web-engine/**

If you own the originals, use **Help &amp; Options → Load original archives** to add your legally obtained `.xap` (and optionally the `.ipa`) for the authentic sprites, artwork, and WAV audio. The files are read locally; only the needed extracted assets are cached in that browser's site storage, and nothing is uploaded.

### Install on a phone or tablet

The deployed game is an installable PWA and works offline after its first successful load. On iPhone or iPad, open the site in Safari, choose **Share → Add to Home Screen**, and keep **Open as Web App** enabled; Chrome on iOS shows guidance to hand the page off to Safari first. Chrome on Android exposes **Install app** in its menu, while Samsung Internet shows its install icon/Add to Home action. Supporting Chromium browsers also expose an **Install game** action in **Help & Options** when the browser makes its install prompt available.

Installed iOS/iPadOS Home Screen web apps have storage isolated from Safari and are exempt from Safari's seven-day script-writable-storage cleanup. For play in an ordinary Safari tab, **Help & Options** also provides **Export save backup** and **Import save backup** actions for scores, achievements, options, procedural sets, and the current mission.

The first visit to mission select shows a dismissible, platform-specific install suggestion. On Android it presents installation as optional and summarizes full-screen play, offline access, and the home-screen shortcut; on iPhone, iPad, and Safari on Mac it includes the storage guidance and an immediate backup action. Choosing **Not now** suppresses it for 30 days, and installed/standalone mode never shows it.

## Play locally

Requires [Node.js](https://nodejs.org/) (18 or newer). No `npm install` is needed — the server and build use only Node built-ins.

**One click:** double-click **`start.cmd`** on Windows, or run **`./start.sh`** on macOS/Linux. The server starts and a browser tab opens automatically. Close the window (or press Ctrl+C) to stop.

**From a terminal**, from the repository root:

| Command | What it does |
| --- | --- |
| `npm start` | Serves on `http://127.0.0.1:4173` and opens your browser. |
| `npm run serve` | Same server, without auto-opening the browser. |

Set a different port with `PORT`, e.g. `PORT=4174 npm start`.

The page is playable immediately — no files to pick. Loading the original archives is optional (Help &amp; Options → Load original archives) and, like online, happens entirely in the browser. The dev server enforces an allowlist: it serves only the engine's HTML/CSS/JS and returns 404 for anything else.

### Regenerating the bundled data (maintainers)

The committed `src/bundled-levels.js` (69 missions) and `src/bundled-strings.js` (en/de/es/fr/it) are generated once from the original archives. To regenerate, place the `.xap`/`.ipa` in `archive/` (or pass a directory) and run:

```
npm run extract-data            # reads ./archive
npm run extract-data /path/to/archives
```

The extractor reuses the same ZIP reader and .NET-resource decoder the runtime uses, so bundled data matches an archive import exactly. Only level XML and localized strings are extracted — never art or audio.

## Deploy

Pushing to `main` triggers `.github/workflows/deploy.yml`, which runs `node scripts/build.mjs` and publishes the generated `dist/` to GitHub Pages. The build has no dependencies (Node built-ins only) and copies the HTML, CSS, JavaScript engine, web app manifest, service worker, and icons — including the bundled level data and localized strings. No sprite sheets, artwork, WAV audio, or game binaries are ever present in the repository or the deployed site. To publish anywhere else, run `npm run build` and serve the `dist/` directory as static files over HTTPS so installation and offline caching are available.

**Enabling Pages (one time):** in the repository, go to *Settings → Pages → Build and deployment → Source* and select **GitHub Actions**.

---

## What's implemented

The engine reproduces the full **game** — every screen, tower, creep, mode, and mechanic the WP build ships, plus the five iOS Level Pack 1 bonus missions and the 34-mission original *geoDefense* campaign that ships (unused) inside the iOS app. The only things left out are platform/online *services* that can't (or shouldn't) run in a browser. Details and the recovered native formulas are in [docs/FIDELITY.md](docs/FIDELITY.md).

### Content
- **30 missions** — the 10 Easy, 10 Medium, and 10 Hard designs from the WP archive, with original maps, tutorials, entrances/exits, blocked/fast-pass/heal-pass/pass-through cells, pre-placed towers, per-mission economy and lives, creep rosters, wave banks, and tower availability.
- **Swarm XL** — twelve curated 22×24 missions (four per difficulty) that reinterpret classic Swarm concepts across several fixed entrance→exit lanes. XL adds a pan/zoom camera, minimap, paired lane markers, multi-chain waves, and its own economy curve.
- **LHC // Breach Grid** — a bundled 12-mission security-themed fan expansion with four authored and engine-validated missions per difficulty.
- **Procedural Swarm** — four deterministic seeded missions per difficulty, board size (Standard or XL), and Normal/Random Economy mode. Maps, terrain, waves, rosters, and tower availability are regenerated from the visible seed and validated with the engine's real parser and pathfinder before play.
- **iOS Level Pack 1** — when the `.ipa` is supplied, the five iOS-exclusive bonus missions (*Lesser Evil*, *Jellyfish*, *Stripes*, *Chromasome*, *The Groove*) load from it and appear under a dedicated **Level Pack 1** menu section. They are scored on the local leaderboard but kept out of the base Easy/Medium/Hard achievement counts.
- **Original geoDefense campaign** — the `.ipa` also carries 34 complete levels (9 Easy, 12 Medium, 13 Hard) from the original *geoDefense* that the shipping Swarm app never loads. Supply the `.ipa` and they appear under an **Original geoDefense** menu section with their own Easy/Medium/Hard tabs. Unlike the Swarm maze, these use fixed creep paths (`<creepPath>` polylines): creeps stream along a drawn route and you build on the surrounding hexes — you can't build on the path, and Vortex is buildable. Scores go to the local leaderboard but, like Level Pack 1, are kept out of the Swarm achievement counts.
- **Endless missions** — authored wave banks cycle and the native score-on-survival ending is preserved.
- **Presentation** — menus, HUD, towers, creeps, shots, the hex grid, range/touch indicators, and the reactive spring-mesh backdrop are all drawn procedurally (additive canvas/WebGL). Localized UI text ships bundled: English plus **German, Spanish, French, and Italian**. Loading the original `.xap` swaps in the authentic sprite sheets, full-screen artwork, and tutorial images (paired with the localized text, positions, wrapping, and scale).

### Towers (6 classes, 7 tiers)
- **Blaster, Laser, Missile, Shock, Thump, Vortex** — native ranges, seven damage tiers, shot counts, recharge timing, timed upgrades, and resale accounting.
- Missile falloff, steering, and retargeting; Laser line damage, three-pulse lifetime, and level-3 heading lock; Shock target counts and Swarm immunity; expanding Thump rings; Vortex gravity wells that attract and absorb explosion particles into an energy pool.
- **Energy links** — Blaster/Laser/Missile towers link to a Vortex for charged attacks; level-7 Vortex towers link to each other to form a half-second energy wall pulsing every 0.1 s. Selling a charged Vortex releases its stored energy as an expanding damage wave.
- Native target enumeration: closest-target and Shock/locked-Laser ties preserve creep insertion order; level-7 Blaster/Missile ignore zero-progress creeps; every query honors the 480×628 playfield bounds below the score bar.

### Creeps (7 types)
- **Chomper, Cubic, Spinner, Pulsar, Star, Wiggle, Swarm** — per-type rotation, Wiggle/Pulsar oscillation, and Swarm behavior (half spawn interval, Laser-driven healing and 1-in-25 duplication, zero-health frames).
- Maze routing uses the WP7 Mango-era unstable open-list sort and the original depth-only cost; creeps keep only their next hex and recompute at every boundary.

### Modes, economy, and waves
- **Novice** and native **Hardcore** modes (Hardcore is the fresh-install default), with the 125%-of-`initCash` Novice economy, 75% Novice creep health, and the 5,000 cash cap.
- Native integer-truncated wave health (`waveHealthFactor` and quadratic `waveHealthFactor2`), linear speed and kill-wealth formulas, independent overlapping wave timers, and the 25%-timer early-launch gate.
- Native distance-to-exit **score multiplier** bonuses (×5/×10/×20/×50 close-call thresholds).
- XL economy baselines fund several opening fronts while reduced kill-wealth growth prevents simultaneous chains from producing runaway cash; tower prices, upgrades, ranges, resale, and the 5,000 cap remain unchanged.

### Screens and flow
- Boots straight to the **main menu** (Easy/Medium/Hard, Level Pack 1, Original geoDefense, Leaderboards, Achievements, Help &amp; Options, Continue) → **level select** → **pre-game** (leaderboard + high score) → **tutorial** (a generated "Mission Briefing" card built from the bundled localized text, or the original screenshot art when an archive is loaded) → **gameplay**.
- **Level-select completion badges** — each mission row draws the native `Buttons.png` status sprite: perfect (no lives lost), completed, endless-scored, and the endless-unplayed ∞ marker, chosen from the local profile exactly as the native `LevelSelectScene` does.
- Native **pause** flow (Resume, Quit, Restart, Options with confirmation prompts) and **game-over** layer (two-second input lock, randomized taunts, completion badge, tap-to-continue, victory fireworks).
- **About/Credits** — the original 480×800 `Credits.png` art is shown full-screen (tap to dismiss) from the Options panel, matching the native `AboutScene`.
- **Options** persist with native fresh-install defaults: Sound, Place-above-touch, Creep-health bars, Hardcore/Novice — adjustable from the menu and mid-game.
- **Local leaderboards** and the original **16 achievement** qualification rules, evaluated locally (complete/complete-nine/perfect-nine per difficulty, ×50 close call, fully-upgrade each of the five buildable-into-achievement towers, and win after building all five classes).
- **Save/continue** captures full run state — towers, creeps, projectiles, spawn sequences, economy, and options — and restores it on reload.

### Input and rendering
- Touch, mouse, and pointer input; tap-to-select, drag-to-build from the tower bar, drag-to-link, and double-tap Laser lock. Responsive layout around the native 480×800 surface, with an optional collapsible desktop control sidebar.
- XL boards support empty-space drag panning, cursor-anchored wheel zoom, two-finger pinch/pan, transformed drag-to-build placement, a live minimap, and one-tap fit-to-board without moving the native score/build bars.
- Additive sprite blending, touch/range indicators (Glow/Star/Flare/Ring frames with random-rotation and fade variants), drag-driven honeycomb brightness, floating multiplier text, doubled `BoomAt` particle counts, 1.5× explosion impulse, and the 31×51 spring-mesh dynamic backdrop (WebGL, with a tiled fallback). Every original sprite has a procedural vector fallback — per-type creep shapes, oriented tower turrets, the honeycomb grid, range rings, and Vortex/Thump shockwaves — so with no archive loaded the game renders entirely from code, and the backdrop mesh runs on a generated tiling texture.
- **Audio** is SFX-only, matching the original (no music): shots, pops, menu clicks, and the countdown are synthesized in the Web Audio API at boot — zero audio files. The low-life countdown (10→1) is spoken by a small **formant speech synthesizer** for the original's robotic "female computer" voice, identical on every device. Loading the `.ipa` replaces the synth bank with the original WAVs.

---

## Parity with the original

No **game system** is missing — the items below are online/platform services and a single cosmetic detail, which is why remaining differences are largely engine quirks rather than absent features.

### Intentionally not ported (platform / online services)
These have no browser equivalent and are replaced or omitted by design:

- **Xbox LIVE integration** (WP `XBoxWrap`) — online per-map leaderboard submission, achievement award/sync, gamertag/gamerscore display, sign-in status, and the "update required" flow. Replaced by a **persistent local leaderboard** and **local achievement evaluation** using the original 16 rules.
- **iOS social SDK** (AppTreasures / OpenFeint / Facebook Connect in the `.ipa`) — friends, challenges, chat rooms, discovery. Not applicable to a preservation port.
- **Trial mode, in-app purchase, and marketplace** prompts — the browser plays the full content, so the "Purchase" menu item and trial level locks (levels > 4) are absent.
- **Windows Phone Live Tile** — secondary tiles, pin-a-level, and from-tile launch.
- **PreEmptive / SoS session analytics** (`Session.Start`/`Session.Stop` telemetry) — intentionally omitted.
- **Service/diagnostics menu** — the hidden WP service screen is not a player feature.

### Minor cosmetic difference
- The **achievements** list uses the engine's own labels rather than the Xbox service's per-achievement icons, descriptions, and gamerscore "G" total — the qualification rules themselves match the original 16.

This is tracked explicitly so passing tests are not mistaken for complete native parity.

---

## Tests

Run `npm test`. The suite exercises level XML parsing over the bundled data, hex routing, the native health/speed/wealth formulas, placement safety, economy, the upgrade/resale lifecycle, overlapping waves, and win/loss ordering. Two tests cover the optional archive-import path (ZIP inflation, .NET-resource decoding, audio discovery) and **skip automatically** unless the original `.xap`/`.ipa` are present in `archive/`.

## Visual parity workflow

Run `npm run visual:doctor` once to verify Chrome, then `npm run visual:smoke`. The latter starts the allowlisted local server, drives it with the pinned `agent-browser` CLI, and captures the standalone (bundled + procedural) menu, level-select, pre-game, gameplay, pause, and game-over states. If the original `.xap`/`.ipa` are present in `archive/`, it also exercises the archive-import override.

> Captures are written only to the git-ignored `.visual/` directory and are never committed, so any run that loads the original artwork keeps it out of the repository.
