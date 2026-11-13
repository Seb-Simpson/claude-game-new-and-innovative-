# Architecture

Single file `index.html`, organised in sections:

| Section | Responsibility |
|---|---|
| Core constants & utils | Arena size (1280×720 logical), seeded RNG (`mulberry32`), math helpers |
| Save data | `localStorage` with try/catch; game works without storage |
| Audio (`Snd`) | Synthesized SFX + 16th-note lookahead music scheduler with intensity levels |
| Input | Keyboard, mouse, gamepad, touch twin-sticks (`Touch`, `readTouch`, aim assist); `G.virtual` overrides input for tests |
| Game data | `CHARS`, `ETYPES`, `STAGES`, `ANCHORS`, `UPGRADES`, `PERKS` (tuning lives here) |
| Loop flow | `startRun` → `startStage` → `beginLoop` → `endLoop` → `finishRewind` / `playerDeath` / `anchorKilled` → `finishStage` |
| Simulation | Fixed 60 Hz `tick()`; `simTick()` runs player, echoes, anchor, enemies, bullets, pickups |
| Rendering | Canvas 2D with cached radial-glow sprites and additive blending. World in 1280×720 letterboxed space; HUD and touch controls in screen space (`view.hud` scale, safe-area insets). Adaptive DPR |
| UI screens | DOM overlays (title, select, lab, how-to, settings, pause, upgrade, game over) |
| Test hooks | `window.LOOPBACK` (`start`, `step`, `input`, `gotoStage`, ...); `?test` disables real-time stepping |

## Key invariants
- **Recording**: each loop, the player's x, y, aim and flags (fired, ability) are written per tick into typed arrays.
  Echoes replay those exact values, so they are deterministic regardless of frame rate.
- **Anchor** position and patterns depend only on loop tick (except aimed shots), so echo shots line up again.
- **Swarm layers** are generated from `run.seed + stage + layer`, so they are identical every loop.
- **Retry** (death with charges) restores anchor HP and echo stability from the loop-start snapshot (`st.snap`).
- Mode machine: `title | intro | play | rewind | dying | upgrade | over`, plus `G.paused`.
