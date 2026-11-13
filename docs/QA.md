# QA

## Automated (`npm test`): 39 checks
Startup, character select, movement, wall/arena collision, firing, loop to rewind to echo creation,
**echo determinism** (position error < 0.001), echo firing, anchor HP persistence, retry flow (charge spent,
state restored), pause/resume, sector clear to upgrade to next sector, boss 3 phases + lasers, game over +
shard banking, same-seed spawn determinism, all 3 runners' abilities, heavy-scene performance budget, resize,
real-time boot, zero page errors.

## Visual checks
Screenshots of the title, select, mid-fight (3 echoes), boss, upgrade and game-over screens were reviewed in headless Chromium.

## Known limits / to tune with playtesting
- Balance (anchor HP, enemy counts, upgrade strength) is set on paper and by scripted bots. Real players should tune it.
- Keyboard + mouse (and gamepad) only. No touch controls.
- Fonts load from Google Fonts. Offline, it falls back to system fonts.
- Software-rendered headless Chromium: about 12 ms/frame with 115 enemies. GPU-accelerated browsers are much faster.
