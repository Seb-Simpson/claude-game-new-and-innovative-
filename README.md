# LOOPBACK

**Every loop, you fight beside every past version of yourself.**

A neon top-down arena action game where time rewinds every 30 seconds, and your last loop
becomes an **Echo**: a ghost that replays every step, shot and ability you made, fighting
alongside you. Stack up to eight versions of yourself to destroy each sector's Anchor.

## Play
**Online:** https://seb-simpson.github.io/claude-game-new-and-innovative-/ (GitHub Pages, from `main`)

Open `index.html` in any modern browser: desktop (Chrome, Edge, Firefox, Safari) or phone/tablet in landscape. No install, no build.

| Action | Keys |
|---|---|
| Move | WASD / arrows |
| Aim / fire | Mouse / hold left click |
| Ability | Space / right click / Shift |
| Pause | Esc / P |
| Auto-fire toggle | F |
| Mute | M |
| Gamepad | Left stick move, right stick aim, RT fire, A/RB ability |
| **Touch** | Left thumb: move (floating stick) · Right thumb: drag to aim and fire, or just hold to auto-target · Round button: ability · **II**: pause |

## How it works
- **Sectors** have an **Anchor**. Its movement and attacks repeat identically each loop, and
  **damage to it persists** across loops. Kill it to clear the sector.
- When the loop timer ends, time rewinds and your recording becomes an Echo.
- Each loop adds a new wave of enemies on top of the previous ones. Enemies can break your echoes.
- Health refills each loop. Dying costs a Chrono Charge and retries the loop. Out of charges, the run ends.
- 5 sectors, with the CHRONARCH boss (3 phases) at the end. Pick an upgrade between sectors.
- Shards unlock new runners (BULWARK, FLUX) and Lab perks. Win once to unlock Paradox mode.

## Development
- Everything lives in `index.html`: vanilla JS, Canvas 2D, Web Audio (all sound is synthesized).
- Tests: `npm test` (Playwright, headless Chromium). `npm run shots` also saves screenshots to `tests/screenshots/`.
- Debug overlay in game: press the backquote key (`` ` ``).
- `index.html?test` starts in manual-step mode for automation (`window.LOOPBACK.step(n)`).

See `docs/` for the design, architecture and QA notes.
