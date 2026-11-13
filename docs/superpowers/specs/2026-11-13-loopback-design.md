# Loopback — Design

## Intent
A complete browser game that blows a teenage player away with its core mechanic and holds them for
40–50 minutes across several replayable runs. The hook: **every loop, time rewinds and your past
self fights beside you** — by the end of a sector you are an army of your own recordings.

## Goals
- A mechanic that produces a genuine "whoa" moment within the first two minutes (loop 2).
- Depth that grows with skill: players learn to *plan for* their future echoes.
- Short runs (≈10–12 min if successful), meta-progression that spans 4–6 runs.
- Tight controls, strong game-feel (hit-stop, shake, particles, synthesized audio).
- Zero install: one `index.html`, opens in any modern desktop browser.

## Non-goals
- Mobile/touch play (keyboard + mouse, gamepad as a bonus).
- Online features, accounts, servers.
- Hand-drawn art or recorded music (all visuals/audio procedural).

## Anti-goals
- Clones that feel decorative. Echoes must measurably matter (they damage the Anchor).
- Unreadable chaos: enemy bullets must always be distinguishable from player shots.

## Approaches considered
1. **Single-file vanilla JS + Canvas 2D (chosen).** No build, works offline/double-click, easy to
   host on GitHub Pages; 2D neon style fits Canvas well.
2. Phaser/TypeScript/Vite. More structure, but a build step and dependency for a game whose systems
   are small and custom (the replay system is the core and must be hand-built anyway).
3. Three.js 3D. Visually richer but much more cost/risk for no gain to the core mechanic.

## Core design
- **Sector** = an arena with an **Anchor** (mini-boss). Kill the Anchor to clear the sector.
- **Loop** = 30 s (35 s on the final sector). When the timer ends, time rewinds; your recording
  becomes an **Echo** that replays your exact movement, shots and abilities in every later loop.
- The Anchor's **position and bullet patterns are a pure function of loop time**, so echoes'
  recorded shots land again — and its **HP persists across loops**. More loops = more echoes = more DPS.
- Each loop adds a new deterministic **swarm layer** (same spawn times/places as before + new ones).
  Swarm enemies react to whoever is nearest, including echoes.
- Echoes have **stability**: swarm enemies can break them; a broken echo is lost for the sector.
- HP refills every loop. Dying spends a **Chrono Charge** and restarts the current loop
  (state restored to loop start). No charges left → run over.
- Between sectors: pick 1 of 3 upgrades (some affect echoes). 5 sectors; sector 5 is the
  CHRONARCH boss (3 phases).
- Meta: shards → unlock characters (VOLT, BULWARK, FLUX) and lab perks; Paradox mode after a win.

## Builder's calls
Balance numbers, enemy roster, VFX/SFX details, HUD layout are implementation calls, tuned by playtest.
