# QA

## Automated (`npm test`): 44 checks
Startup, character select, movement, wall/arena collision, firing, loop to rewind to echo creation,
**echo determinism** (position error < 0.001), echo firing, anchor HP persistence, retry flow (charge spent,
state restored), pause/resume, sector clear to upgrade to next sector, boss 3 phases + lasers, game over +
shard banking, same-seed spawn determinism, all 3 runners' abilities, heavy-scene performance budget, resize,
real-time boot, zero page errors.

## Independent review (fixed, with regression tests)
- A death on the final tick of a loop was overridden by the loop ending: deaths with no charges were cancelled and failed loops became echoes. Fixed.
- After a retry, the anchor could stay "dead" at full HP: a softlock. Retry now restores the anchor fully.
- A death mid-update could index an emptied bullet list (possible crash). Fixed.
- Slow-motion leaked into the next run after quitting. `timeScale` is now reset.
- Starting a run with Space triggered a dash on tick 0. Ability input is now ignored outside play.
- Menu keys: Space and arrow keys now work in menus during a run, and Escape steps back through pause sub-menus.
- Shards, score and kills from a failed (retried) loop are now rolled back.
- The upgrade screen ignores clicks for 450 ms, so a click from the fight can't pick an upgrade.

## Visual checks
Screenshots of the title, select, mid-fight (3 echoes), boss, upgrade and game-over screens were reviewed in headless Chromium.

## Known limits / to tune with playtesting
- Balance (anchor HP, enemy counts, upgrade strength) is set on paper and by scripted bots. Real players should tune it.
- Keyboard + mouse (and gamepad) only. No touch controls.
- Fonts load from Google Fonts. Offline, it falls back to system fonts.
- Software-rendered headless Chromium: about 12 ms/frame with 115 enemies. GPU-accelerated browsers are much faster.
