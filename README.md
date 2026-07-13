# Swarm Web Engine

A dependency-free browser reimplementation of **geoDefense Swarm** (Critical Thought Games, 2009/2012). The engine is an independent JavaScript rewrite informed by the archived Windows Phone build; the deployable site contains **no** copyrighted game art, audio, binaries, or level data. Original assets and mission data are read out of an archive you supply, entirely in your browser, and are never uploaded or written into the build.

## Play online

Open the hosted engine and load your own game files — nothing is downloaded from the site except the engine itself:

**▶ https://deadman96385.github.io/swarm-web-engine/**

1. Open the link above.
2. Choose your legally obtained Windows Phone `.xap`.
3. Optionally add your iOS `.ipa` in the same picker for the original WAV audio, the five Level Pack 1 bonus missions, and the 34-mission **Original geoDefense** campaign (the fixed creep-path levels from the predecessor game, bundled inside the iOS app).

Because the site ships no game data, you must supply the archive yourself. It is read locally in your browser and never leaves the tab.

## Play locally

Requires [Node.js](https://nodejs.org/) (18 or newer). No `npm install` is needed — the server and build use only Node built-ins.

**One click:** double-click **`start.cmd`** on Windows, or run **`./start.sh`** on macOS/Linux. The server starts and a browser tab opens automatically. Close the window (or press Ctrl+C) to stop.

**From a terminal**, from the repository root:

| Command | What it does |
| --- | --- |
| `npm start` | Serves on `http://127.0.0.1:4173` and opens your browser. |
| `npm run serve` | Same server, without auto-opening the browser. |

Set a different port with `PORT`, e.g. `PORT=4174 npm start`.

Then choose your legally obtained Windows Phone `.xap` (and optionally the iOS `.ipa` for original audio, the Level Pack 1 bonus missions, and the original *geoDefense* campaign). The archives are read entirely in the browser — never uploaded, copied into the build, or retained after the tab closes. The dev server also enforces an allowlist: it serves only the engine's HTML/CSS/JS and returns 404 for anything else.

## Deploy

Pushing to `main` triggers `.github/workflows/deploy.yml`, which runs `node scripts/build.mjs` and publishes the generated `dist/` to GitHub Pages. The build has no dependencies (Node built-ins only) and copies just the HTML, CSS, and JavaScript engine — no game data is ever present in the repository or the deployed site. To publish anywhere else, run `npm run build` and serve the `dist/` directory as static files.

**Enabling Pages (one time):** in the repository, go to *Settings → Pages → Build and deployment → Source* and select **GitHub Actions**.

---

## What's implemented

The engine reproduces the full **game** — every screen, tower, creep, mode, and mechanic the WP build ships, plus the five iOS Level Pack 1 bonus missions and the 34-mission original *geoDefense* campaign that ships (unused) inside the iOS app. The only things left out are platform/online *services* that can't (or shouldn't) run in a browser. Details and the recovered native formulas are in [docs/FIDELITY.md](docs/FIDELITY.md).

### Content
- **30 missions** — the 10 Easy, 10 Medium, and 10 Hard designs from the WP archive, with original maps, tutorials, entrances/exits, blocked/fast-pass/heal-pass/pass-through cells, pre-placed towers, per-mission economy and lives, creep rosters, wave banks, and tower availability.
- **iOS Level Pack 1** — when the `.ipa` is supplied, the five iOS-exclusive bonus missions (*Lesser Evil*, *Jellyfish*, *Stripes*, *Chromasome*, *The Groove*) load from it and appear under a dedicated **Level Pack 1** menu section. They are scored on the local leaderboard but kept out of the base Easy/Medium/Hard achievement counts.
- **Original geoDefense campaign** — the `.ipa` also carries 34 complete levels (9 Easy, 12 Medium, 13 Hard) from the original *geoDefense* that the shipping Swarm app never loads. Supply the `.ipa` and they appear under an **Original geoDefense** menu section with their own Easy/Medium/Hard tabs. Unlike the Swarm maze, these use fixed creep paths (`<creepPath>` polylines): creeps stream along a drawn route and you build on the surrounding hexes — you can't build on the path, and Vortex is buildable. Scores go to the local leaderboard but, like Level Pack 1, are kept out of the Swarm achievement counts.
- **Endless missions** — authored wave banks cycle and the native score-on-survival ending is preserved.
- **Original presentation loaded at runtime** — main menu, level-select, and pre-game artwork; tutorial art paired with the archive's localized text, positions, wrapping, and scale; English plus packaged **German, Spanish, French, and Italian** managed-resource strings decoded straight from the `.xap`.

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

### Screens and flow
- **Loader** (archive picker) → **main menu** (Easy/Medium/Hard, optional Level Pack 1 and Original geoDefense, Leaderboards, Achievements, Options, Continue) → **level select** → **pre-game** (leaderboard + high score) → **tutorial** → **gameplay**.
- **Level-select completion badges** — each mission row draws the native `Buttons.png` status sprite: perfect (no lives lost), completed, endless-scored, and the endless-unplayed ∞ marker, chosen from the local profile exactly as the native `LevelSelectScene` does.
- Native **pause** flow (Resume, Quit, Restart, Options with confirmation prompts) and **game-over** layer (two-second input lock, randomized taunts, completion badge, tap-to-continue, victory fireworks).
- **About/Credits** — the original 480×800 `Credits.png` art is shown full-screen (tap to dismiss) from the Options panel, matching the native `AboutScene`.
- **Options** persist with native fresh-install defaults: Sound, Place-above-touch, Creep-health bars, Hardcore/Novice — adjustable from the menu and mid-game.
- **Local leaderboards** and the original **16 achievement** qualification rules, evaluated locally (complete/complete-nine/perfect-nine per difficulty, ×50 close call, fully-upgrade each of the five buildable-into-achievement towers, and win after building all five classes).
- **Save/continue** captures full run state — towers, creeps, projectiles, spawn sequences, economy, and options — and restores it on reload.

### Input and rendering
- Touch, mouse, and pointer input; tap-to-select, drag-to-build from the tower bar, drag-to-link, and double-tap Laser lock. Responsive layout around the native 480×800 surface, with an optional collapsible desktop control sidebar.
- Additive sprite blending, touch/range indicators (Glow/Star/Flare/Ring frames with random-rotation and fade variants), drag-driven honeycomb brightness, floating multiplier text, doubled `BoomAt` particle counts, 1.5× explosion impulse, and the 31×51 spring-mesh dynamic backdrop (WebGL, with a tiled fallback).
- **Audio** is SFX-only, matching the original (there is no music track): shots, pops, the low-life female countdown voice (10→1), and menu clicks, played from the optional `.ipa` WAVs.

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

Run `npm test`. The suite exercises the two real archives, ZIP inflation, audio discovery, hex routing, the native health/speed/wealth formulas, placement safety, economy, the upgrade/resale lifecycle, overlapping waves, and win/loss ordering.

## Visual parity workflow

Run `npm run visual:doctor` once to verify Chrome, then `npm run visual:smoke`. The latter starts the allowlisted local server, drives it with the pinned `agent-browser` CLI, uploads your local `.xap`/`.ipa` through the real file input, and captures loader, main-menu, level-select, pre-game, gameplay, pause, and game-over states.

> These captures render the runtime-loaded **original artwork**, so they are written only to the git-ignored `.visual/` directory and are never committed — the repository stays free of copyrighted content.
