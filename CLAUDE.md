# Loopback — project notes for Claude
- The game is one file: `index.html` (vanilla JS + Canvas 2D + Web Audio). No build step; keep it that way.
- Tuning data lives in the `GAME DATA` section (`STAGES`, `ANCHORS`, `ETYPES`, `UPGRADES`).
- Echo determinism is the core feature: never make echo replay depend on frame time or `Math.random`.
- Run `npm test` (Playwright, headless Chromium) after changes; `npm run shots` to inspect visuals.
- Design: `docs/superpowers/specs/2026-11-13-loopback-design.md`; architecture: `docs/ARCHITECTURE.md`; QA: `docs/QA.md`.
