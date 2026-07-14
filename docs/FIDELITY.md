# Engine fidelity notes

The shipped browser code contains no decompiled source. It is an independent JavaScript implementation informed by the data and behavior of the archived Windows Phone `geoLib.dll` version 1.1.1.0 and `geoDefenseSwarmWP7.dll` version 1.0.23.0.

**Standalone by default.** The engine ships the level data and the localized UI strings and renders all art and audio procedurally: canvas/WebGL vector graphics (per-type creeps, oriented tower turrets, the honeycomb grid, range rings, Vortex/Thump shockwaves, a generated tiling backdrop texture), Web Audio sound effects, a formant-synthesized "female computer" countdown voice, and a generated "Mission Briefing" card that presents the bundled tutorial text when the original screenshots aren't loaded. It ships no sprite sheets, artwork, WAV audio, or game binaries. Loading the original `.xap`/`.ipa` is optional and swaps in the authentic sprites, full-screen artwork, tutorial screenshots, and WAV audio; the notes below describe the behavior reproduced in both modes.

## Recovered behavior now implemented

- Novice-mode economy starts with 125% of the XML `initCash` value; cash is capped at 5,000. Fresh profiles default to native Hardcore mode.
- Novice-mode creep health is 75% of the integer-scaled wave health. Both `waveHealthFactor` and quadratic `waveHealthFactor2` preserve the native integer truncation order.
- Creep speed and kill wealth use the native linear wave formulas.
- Waves launch on independent timers and may overlap. Swarm creeps use half the normal spawn interval.
- Spawn sequences update after creeps, towers, and shots. Manual advance only zeroes the wave timer; launch remains deferred to SpawnManager. New creeps preserve the native unplaced `(0,0)` frame before their first movement update. Concurrent entries retain insertion order and the current apparent wave number.
- Fast-pass and heal-pass hexes apply their native movement and regeneration effects while remaining unavailable for building.
- Maze routing uses the WP7 Mango-era unstable open-list sort and the original depth-only cost. The assembly's two fast-cell heuristic multiplications are intentionally retained as dead calculations rather than influencing route choice. Creeps retain only their next hex and recompute at every boundary.
- Endless missions cycle their authored wave banks and retain the native score-on-survival ending rule.
- Tower ranges, seven damage tiers, shot counts, recharge timing, Missile falloff, Laser line damage, Shock target counts, Thump rings, maximum level, upgrade price/time, and resale accounting follow the managed engine.
- Blaster, Laser, and Missile towers can link to Vortex towers for charged attacks. Level-seven Vortex towers can link to each other to form a half-second energy wall that damages in native 0.1-second pulses.
- Score multiplier bonuses use the native distance-to-exit thresholds.
- Vortex towers remain preplaced-only; Laser healing/duplication of Swarm creeps and Shock immunity are modeled.
- Level-three Laser heading lock, drag-to-build, native early-wave gating, Hardcore mode, and complete save/continue state are implemented. Creep taps deliberately do not override targeting because the native game only resolves tower touches.
- Blaster and Missile projectile travel, Missile steering/retargeting, Laser pulse lifetime, and expanding Thump damage rings are persistent and included in saves.
- Native target enumeration is retained: closest-target ties and Shock/locked-Laser queries preserve creep insertion order, level-seven Blaster/Missile towers ignore zero-progress creeps, and all combat queries honor the original 480×628 playfield bounds below the score bar.
- Original runtime-loaded MainMenu, LevelSelect, and PreGame artwork now drives the native difficulty/menu flow.
- Original tutorial artwork is paired with the game-specific localized text and metadata from the selected archive, preserving authored positions, wrapping, scale, and play control.
- Pause uses the native four-action Resume, Quit, Restart, and Options flow with confirmation prompts; the game-over layer preserves its two-second input lock, randomized taunts, completion badge, tap-to-continue behavior, and victory fireworks.
- Sound, place-above-touch, health-bar, and Hardcore/Novice options persist with native fresh-install defaults.
- Local high scores preserve perfect completions, and the original 16 achievement qualification rules are evaluated locally.
- Explosion particles are attracted by Vortex range/gravity and absorbed one-for-one into native energy capacities.
- Selling a charged Vortex releases its stored energy through the native expanding damage wave.
- Native additive sprite blending, touch/range indicators, drag-driven honeycomb brightness, floating multiplier bonuses, doubled `BoomAt` particle counts, 1.5× explosion impulse, and the 31×51 spring-mesh backdrop are reproduced by the canvas/WebGL renderer.
- English and packaged German, Spanish, French, and Italian managed-resource strings are decoded from the selected XAP at runtime.

## Platform and online services intentionally not ported

These native subsystems (`GameMaster`, `XBoxWrap`, `LiveTile`, and the iOS social layer) have no browser equivalent and are replaced or omitted by design, not missing by oversight:

- **Xbox LIVE integration** — online per-map leaderboard submission (`WriteLeaderboard`), achievement award/sync (`AwardAchievement`, `BeginGetAchievements`), gamertag/gamerscore display, sign-in status, and the game-update-required flow. Replaced by a persistent local leaderboard and local evaluation of the original achievement rules.
- **iOS social SDK** — the `.ipa`'s AppTreasures / OpenFeint / Facebook Connect layer (friends, challenges, chat rooms, discovery). Not applicable to a preservation port.
- **Trial mode, in-app purchase, and marketplace** — the `MainMenuScene` "Purchase" item, `OfferUpgradeLevels`, and the `LevelSelectScene` trial lock on levels > 4 are absent because the browser plays the full content.
- **Windows Phone Live Tile** — secondary tiles, pin-a-level, and `FromTile` launch parameters.
- **PreEmptive / SoS analytics** — the `Session.Start` / `Session.Stop` telemetry in `GameMaster.Setup`/`Teardown`.
- **Service/diagnostics menu** — `ServiceMenu` is not a player-facing feature.

## iOS Level Pack 1

The archived iOS `v1.3` package ships five bonus missions absent from the Windows Phone `.xap`: `GAME_LEVEL_LP1_M_0001..0003` (*Lesser Evil*, *Jellyfish*, *Stripes*) and `GAME_LEVEL_LP1_H_0001..0002` (*Chromasome*, *The Groove*). Their XML schema is identical to the base missions. When the `.ipa` is supplied, these are discovered by their `GAME_LEVEL_LP<n>_[EMH]_` naming, parsed by the same level parser, and surfaced under a dedicated **Level Pack 1** menu section (sorted Medium before Hard). They carry an internal `Bonus` difficulty tag so they score on the local leaderboard and can still earn the tower / ×50 / all-classes achievements, while staying out of the base Easy/Medium/Hard completion counts — preserving the native 16-achievement semantics, which are defined only over the 30 base missions.

## Minor cosmetic difference

- The **achievements** list uses the engine's own labels instead of the Xbox service's per-achievement icons, descriptions, and the summed gamerscore "G" total shown by `AchievementsScene`. The qualification rules themselves match the original 16 (`GameState.QualifiedAchievements`).

## Deliberate browser adaptations still being refined

- The optional desktop inspection/control sidebar is collapsed by default behind a small toggle so the native 480×800 surface remains primary.
- Native Glow, Star, Flare, and Ring frames render additively from `TouchIndicators.png`, including random-rotation variants and the original fade-out behavior. Backdrop deformation uses the original 16-pixel triangle topology, UV tiling, impulse falloff, pressure coloration, spring constant, and damping values; a non-WebGL browser falls back to an undeformed tiled backdrop.

These differences are tracked explicitly so passing tests are not mistaken for proof of complete native parity.
