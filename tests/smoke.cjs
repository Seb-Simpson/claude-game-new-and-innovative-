// Loopback browser test suite. Runs the real game in headless Chromium.
// Usage: node tests/smoke.cjs [--shots]   (screenshots go to tests/screenshots/)
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const URL = 'file://' + path.resolve(__dirname, '..', 'index.html');
const SHOTS = process.argv.includes('--shots');
const shotDir = path.join(__dirname, 'screenshots');
let passed = 0, failed = 0;
const results = [];

function check(name, cond, detail = '') {
  if (cond) { passed++; results.push(`  ok   ${name}`); }
  else { failed++; results.push(`  FAIL ${name} ${detail}`); }
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error' && !/fonts\.g/.test(m.text()) && !/ERR_/.test(m.text())) errors.push(m.text()); });
  const shot = async name => { if (SHOTS) { fs.mkdirSync(shotDir, { recursive: true }); await page.screenshot({ path: path.join(shotDir, name + '.png') }); } };
  const ev = (fn, arg) => page.evaluate(fn, arg);

  // ---- startup / title
  await page.goto(URL + '?test');
  await page.waitForTimeout(400);
  check('title screen visible', await page.isVisible('#scr-title'));
  check('game API exposed', await ev(() => !!window.LOOPBACK));
  await ev(() => window.LOOPBACK.resetSave());
  await shot('01-title');

  // ---- character select renders 3 cards, 2 locked on fresh save
  await page.click('button[data-act=play]');
  check('select screen shows 3 runners', await ev(() => document.querySelectorAll('#char-cards .card').length === 3));
  check('fresh save: 2 runners locked', await ev(() => document.querySelectorAll('#char-cards .card.locked').length === 2));
  await shot('02-select');

  // ---- start a run (deterministic seed)
  await ev(() => { LOOPBACK.start('volt', { seed: 12345 }); });
  check('run starts in intro', await ev(() => LOOPBACK.G.mode === 'intro'));
  await ev(() => LOOPBACK.step(160));
  check('intro leads to play', await ev(() => LOOPBACK.G.mode === 'play'));

  // ---- movement & collision
  const x0 = await ev(() => LOOPBACK.G.player.x);
  await ev(() => { LOOPBACK.input({ mx: 1, my: 0, aim: -Math.PI / 2, fire: true }); LOOPBACK.step(30); });
  const x1 = await ev(() => LOOPBACK.G.player.x);
  check('player moves right', x1 > x0 + 60, `${x0} -> ${x1}`);
  check('firing creates bullets', await ev(() => LOOPBACK.G.pb.length > 0));
  await ev(() => { LOOPBACK.input({ mx: 1, my: 0 }); LOOPBACK.step(240); });
  check('player stays inside arena', await ev(() => LOOPBACK.G.player.x <= 1280 - 26 - 14 + 0.01));

  // ---- play a scripted loop: strafe and shoot at the anchor
  await ev(() => {
    const G = LOOPBACK.G;
    for (let i = 0; i < 1900 && G.mode === "play"; i++) {
      const a = G.st.anchor, p = G.player;
      LOOPBACK.input({ mx: Math.sin(i / 50), my: 0, aim: Math.atan2(a.y - p.y, a.x - p.x), fire: true, ability: i % 90 === 0 });
      G.player.inv = 5; // keep the scripted player alive for this test
      LOOPBACK.step(1);
    }
  });
  check('loop timer leads to rewind', await ev(() => LOOPBACK.G.mode === 'rewind'));
  const hpAfterLoop1 = await ev(() => LOOPBACK.G.st.anchor.hp);
  check('anchor took damage in loop 1', await ev(() => LOOPBACK.G.st.anchor.hp < LOOPBACK.G.st.anchor.max));
  await ev(() => LOOPBACK.step(120));
  await shot('03-loop2-start');
  check('rewind creates an echo', await ev(() => LOOPBACK.G.ghosts.length === 1 && LOOPBACK.G.mode === 'play'));
  check('loop counter advanced', await ev(() => LOOPBACK.G.st.loop === 1));
  check('hud: recording strip shows a lane per echo plus now', await ev(() => { LOOPBACK.G.demo = false; LOOPBACK.updateHUD(); return document.querySelectorAll('#h-lanes .ln').length === 2 && document.querySelectorAll('#h-lanes .ln:first-child i').length > 0; }));
  check('anchor damage persists across loops', await ev(h => LOOPBACK.G.st.anchor.hp === h, hpAfterLoop1));

  // ---- determinism: echo replays the recording exactly
  const det = await ev(() => {
    const G = LOOPBACK.G, g = G.ghosts[0]; LOOPBACK.input({ mx: 0, my: 0, fire: false });
    let maxErr = 0, ghostShots = 0;
    for (let i = 0; i < 300; i++) {
      const t = G.st.tick, before = G.pb.length; G.player.inv = 5; LOOPBACK.step(1);
      if (g.alive) maxErr = Math.max(maxErr, Math.abs(g.x - g.rec.x[t]) + Math.abs(g.y - g.rec.y[t]));
      if (G.pb.length > before) ghostShots++;
    }
    return { maxErr, ghostShots };
  });
  check('echo position matches recording', det.maxErr < 1e-3, JSON.stringify(det));
  check('echo fires its recorded shots', det.ghostShots > 10, JSON.stringify(det));

  // ---- death with charges: loop restarts, state restored
  const deathRes = await ev(() => {
    const G = LOOPBACK.G, st = G.st;
    const charges = G.run.charges, loop = st.loop, snapHp = st.snap.anchorHp;
    st.anchor.hp -= 50; // damage that should be undone by the retry
    G.player.inv = 0; G.player.hp = 1;
    G.enemies.push({ id: 9999, type: { color: '#fff', hunter: false, score: 0, shards: 0, r: 12 }, kind: 'drone', x: G.player.x, y: G.player.y, vx: 0, vy: 0, kx: 0, ky: 0, r: 12, hp: 99, max: 99, flash: 0, cd: 999, speed: 0, state: 0, st: 0, dir: 0, rot: 0, wob: 0 });
    LOOPBACK.step(1);
    const midMode = G.mode;
    LOOPBACK.step(120);
    return { midMode, mode: G.mode, chargesBefore: charges, chargesAfter: G.run.charges, loopSame: st.loop === loop, hpRestored: Math.abs(st.anchor.hp - snapHp) < 1e-6, ghosts: G.ghosts.length };
  });
  check('death with charges triggers retry rewind', deathRes.midMode === 'rewind', JSON.stringify(deathRes));
  check('retry spends a charge', deathRes.chargesAfter === deathRes.chargesBefore - 1, JSON.stringify(deathRes));
  check('retry keeps same loop and echoes', deathRes.loopSame && deathRes.ghosts === 1 && deathRes.mode === 'play', JSON.stringify(deathRes));
  check('retry restores anchor HP to loop start', deathRes.hpRestored, JSON.stringify(deathRes));

  // ---- pause / resume
  await ev(() => LOOPBACK.togglePause());
  check('pause shows pause screen', await page.isVisible('#scr-pause'));
  await ev(() => LOOPBACK.togglePause());
  check('resume hides pause screen', !(await page.isVisible('#scr-pause')));

  // ---- gameplay screenshot with echoes in action (play a few loops)
  if (SHOTS) {
    await ev(() => {
      const G = LOOPBACK.G;
      for (let L = 0; L < 2; L++) {
        for (let i = 0; i < 2000 && G.mode === 'play'; i++) {
          const a = G.st.anchor, p = G.player;
          LOOPBACK.input({ mx: Math.cos(i / 40 + L), my: Math.sin(i / 55 + L) * 0.7, aim: Math.atan2(a.y - p.y, a.x - p.x), fire: true });
          G.player.inv = 5; LOOPBACK.step(1);
        }
        LOOPBACK.step(120);
      }
      for (let i = 0; i < 700; i++) { const a = G.st.anchor, p = G.player; LOOPBACK.input({ mx: Math.cos(i / 40), my: 0.3 * Math.sin(i / 30), aim: Math.atan2(a.y - p.y, a.x - p.x), fire: true }); G.player.inv = 5; LOOPBACK.step(1); }
      LOOPBACK.render();
    });
    await shot('04-gameplay-echoes');
  }

  // ---- stage clear -> upgrade screen -> next sector
  await ev(() => { const G = LOOPBACK.G; if (G.mode === 'play') { G.st.anchor.hp = 1; G.st.anchor.active = true; } });
  await ev(() => { const G = LOOPBACK.G; for (let i = 0; i < 400 && G.mode === 'play'; i++) { const a = G.st.anchor; if (a.active && !a.dead) { a.hp = 0.5; G.pb.push({ x: a.x, y: a.y, vx: 0, vy: 0, r: 5, dmg: 5, life: 1, pierce: 0, bounce: 0, ghost: false, homing: 0, chain: 0, hits: null, color: '#fff' }); } G.player.inv = 5; LOOPBACK.step(1); } });
  check('killing the anchor opens upgrade screen', await ev(() => LOOPBACK.G.mode === 'upgrade'));
  check('three upgrade choices offered', await ev(() => document.querySelectorAll('#up-cards .card').length === 3));
  await shot('05-upgrade');
  await ev(() => LOOPBACK.chooseUpgrade(0));
  check('choosing upgrade starts sector 2', await ev(() => LOOPBACK.G.run.stage === 1 && LOOPBACK.G.mode === 'intro'));
  check('echoes reset for new sector', await ev(() => LOOPBACK.G.ghosts.length === 0));

  // ---- boss stage: phases and lasers execute
  await ev(() => LOOPBACK.gotoStage(4));
  check('reached final sector', await ev(() => LOOPBACK.G.run.stage === 4));
  const bossRun = await ev(() => {
    const G = LOOPBACK.G; LOOPBACK.step(160);
    const a = G.st.anchor; let phases = new Set(), lasers = 0, bullets = 0;
    for (let i = 0; i < 1900 && G.mode === 'play'; i++) {
      if (i === 300) a.hp = a.max * 0.5; if (i === 900) a.hp = a.max * 0.2;
      LOOPBACK.input({ mx: Math.sin(i / 60), my: 0, aim: -Math.PI / 2, fire: false });
      G.player.inv = 5; LOOPBACK.step(1); phases.add(a.phase); lasers = Math.max(lasers, a.lasers.length); bullets = Math.max(bullets, G.eb.length);
      if (i === 600) LOOPBACK.render();
    }
    return { phases: [...phases], lasers, bullets, mode: G.mode };
  });
  check('boss goes through all 3 phases', bossRun.phases.length === 3, JSON.stringify(bossRun));
  check('boss fires lasers and bullets', bossRun.lasers > 0 && bossRun.bullets > 10, JSON.stringify(bossRun));
  await shot('06-boss');

  // ---- game over with no charges
  const over = await ev(() => {
    const G = LOOPBACK.G; if (G.mode !== 'play') LOOPBACK.step(130);
    G.run.charges = 0; G.player.inv = 0; G.player.hp = 1; G.player.dashT = 0;
    G.eb.push({ x: G.player.x, y: G.player.y, vx: 0, vy: 0, r: 8, color: '#f00', life: 99, age: 0, anchor: false, flip: 0 });
    LOOPBACK.step(2); const m1 = G.mode; LOOPBACK.step(140);
    return { m1, mode: G.mode, shards: LOOPBACK.save.shards };
  });
  check('death without charges ends run', over.m1 === 'dying' && over.mode === 'over', JSON.stringify(over));
  check('game over screen shows', await page.isVisible('#scr-over'));
  check('shards banked to save', over.shards > 0, JSON.stringify(over));
  await shot('07-gameover');

  // ---- regressions from independent review
  const reg = await ev(() => {
    const G = LOOPBACK.G, out = {};
    const killPlayer = () => { G.player.inv = 0; G.player.hp = 1; G.player.dashT = 0; G.eb.push({ x: G.player.x, y: G.player.y, vx: 0, vy: 0, r: 8, color: '#f00', life: 99, age: 0, anchor: false, flip: 0 }); G.eb.push({ x: G.player.x, y: G.player.y, vx: 0, vy: 0, r: 8, color: '#f00', life: 99, age: 0, anchor: false, flip: 0 }); };
    // #1 death on last loop tick with no charges must end the run
    LOOPBACK.start('volt', { seed: 3 }); LOOPBACK.step(160); LOOPBACK.input({ mx: 0, my: 0, fire: false });
    G.run.charges = 0; while (G.st.tick < G.st.loopTicks - 1) { G.player.inv = 5; LOOPBACK.step(1); }
    killPlayer(); LOOPBACK.step(1); out.lastTickNoCharge = G.mode; // expect dying
    // #1b with charges: retry, not success
    LOOPBACK.start('volt', { seed: 3 }); LOOPBACK.step(160);
    while (G.st.tick < G.st.loopTicks - 1) { G.player.inv = 5; LOOPBACK.step(1); }
    killPlayer(); LOOPBACK.step(1); out.lastTickFail = G.rewind && G.rewind.fail; LOOPBACK.step(130); out.loopAfter = G.st.loop; out.ghostsAfter = G.ghosts.length;
    // #2 anchor killed in the same tick as death is revived on retry; #6 shards restored
    LOOPBACK.start('volt', { seed: 3 }); LOOPBACK.step(160); while (G.st.tick < 200) { G.player.inv = 5; LOOPBACK.step(1); }
    const shards0 = G.run.shards; G.run.shards += 40; G.st.anchor.dead = true;
    killPlayer(); LOOPBACK.step(1); LOOPBACK.step(130);
    out.anchorDeadAfterRetry = G.st.anchor.dead; out.shardsRestored = G.run.shards === shards0;
    while (G.st.tick < 200) { G.player.inv = 5; LOOPBACK.step(1); } out.anchorActive = G.st.anchor.active;
    // #3 slow-mo must not leak into a new run
    G.timeScale = 0.25; LOOPBACK.toTitle(); LOOPBACK.start('volt', { seed: 3 }); out.timeScale = G.timeScale;
    return out;
  });
  check('regression: last-tick death with no charges ends run', reg.lastTickNoCharge === 'dying', JSON.stringify(reg));
  check('regression: last-tick death with charges is a retry', reg.lastTickFail === true && reg.loopAfter === 0 && reg.ghostsAfter === 0, JSON.stringify(reg));
  check('regression: anchor revived on retry (no softlock)', reg.anchorDeadAfterRetry === false && reg.anchorActive === true, JSON.stringify(reg));
  check('regression: shards from failed loop are undone', reg.shardsRestored, JSON.stringify(reg));
  check('regression: slow-mo does not leak into new run', reg.timeScale === 1, JSON.stringify(reg));

  // ---- replay determinism of swarm layers (same seed => same schedule)
  const sameLayers = await ev(() => {
    LOOPBACK.start('bulwark', { seed: 777 }); const a = JSON.stringify(LOOPBACK.G.st.layers);
    LOOPBACK.step(160); const s1 = JSON.stringify(LOOPBACK.G.st.sched);
    LOOPBACK.start('bulwark', { seed: 777 }); LOOPBACK.step(160); const s2 = JSON.stringify(LOOPBACK.G.st.sched);
    return s1 === s2 && s1.length > 10;
  });
  check('same seed gives identical spawn schedule', sameLayers);

  // ---- music renders cleanly for every sector (offline, no speakers needed)
  const mus = await ev(async () => {
    const out = [];
    out.push(['menu', await LOOPBACK.renderMusic({ kind: 'menu', seconds: 6 })]);
    for (let i = 0; i < 5; i++) for (const L of [0, 5]) out.push([`s${i + 1} L${L}`, await LOOPBACK.renderMusic({ sector: i, layers: L, seconds: 5, phase: i === 4 ? 2 : 0 })]);
    return out.map(([k, r]) => ({ k, peak: +r.peak.toFixed(3), rms: +r.rmsDb.toFixed(1), nan: r.nan }));
  });
  check('music: no NaNs and no clipping in any track', mus.every(m => m.nan === 0 && m.peak < 0.98), JSON.stringify(mus));
  check('music: every track sits in a sensible loudness range', mus.every(m => m.rms > -26 && m.rms < -11), JSON.stringify(mus));
  results.push('  music ' + mus.map(m => `${m.k}:${m.rms}dB`).join(' '));

  // ---- other characters' abilities run without errors
  for (const id of ['bulwark', 'flux']) {
    const ok = await ev(id => {
      LOOPBACK.start(id, { seed: 99 }); LOOPBACK.step(160);
      const G = LOOPBACK.G;
      for (let i = 0; i < 900; i++) { const a = G.st.anchor, p = G.player; LOOPBACK.input({ mx: Math.cos(i / 30), my: Math.sin(i / 45), aim: Math.atan2(a.y - p.y, a.x - p.x), fire: true, ability: i % 40 === 0 }); G.player.inv = 5; LOOPBACK.step(1); }
      return G.mode === 'play' && G.run.kills > 0;
    }, id);
    check(`${id} plays a loop and kills enemies`, ok);
  }

  // ---- performance: heavy scene sim+render cost
  const perf = await ev(() => {
    const G = LOOPBACK.G;
    for (let i = 0; i < 120; i++) G.portals.push({ x: 100 + (i * 37) % 1080, y: 80 + (i * 53) % 560, t: 0, dur: 2, type: ['drone', 'shooter', 'wraith', 'splitter'][i % 4], n: 1 });
    let sim = 0, ren = 0;
    for (let i = 0; i < 300; i++) {
      LOOPBACK.input({ mx: 0, my: 0, aim: i / 10, fire: true });
      G.player.inv = 5;
      const t0 = performance.now(); LOOPBACK.step(1); const t1 = performance.now(); LOOPBACK.render(); const t2 = performance.now();
      sim += t1 - t0; ren += t2 - t1;
    }
    return { simMs: +(sim / 300).toFixed(2), renderMs: +(ren / 300).toFixed(2), enemies: G.enemies.length, parts: G.parts.length };
  });
  check('heavy scene sim < 4ms/tick', perf.simMs < 4, JSON.stringify(perf));
  check('heavy scene render < 16ms/frame (headless, software)', perf.renderMs < 16, JSON.stringify(perf));
  results.push(`  perf ${JSON.stringify(perf)}`);

  // ---- resize robustness
  await page.setViewportSize({ width: 800, height: 900 });
  await page.waitForTimeout(100);
  await page.setViewportSize({ width: 1600, height: 700 });
  await page.waitForTimeout(100);

  // ---- real-time mode boots without ?test
  const page2 = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page2.on('pageerror', e => errors.push('page2: ' + e));
  await page2.goto(URL);
  // ---- Tape UI: live demo behind the title, embedded fonts, DOM HUD
  await page2.evaluate(() => LOOPBACK.resetSave());
  await page2.waitForTimeout(4500);
  const demo = await page2.evaluate(() => ({ demo: LOOPBACK.G.demo, tick: LOOPBACK.G.st && LOOPBACK.G.st.tick, mode: LOOPBACK.G.mode, hud: document.getElementById('hud').classList.contains('hidden'), runs: LOOPBACK.save.runs }));
  check('title: live demo plays behind the menu', demo.demo === true && demo.mode === 'play' && demo.tick > 30, JSON.stringify(demo));
  check('title: HUD hidden during demo', demo.hud === true, JSON.stringify(demo));
  check('title: demo does not touch the save', demo.runs === 0, JSON.stringify(demo));
  check('fonts: embedded faces load', await page2.evaluate(async () => { await document.fonts.ready; return document.fonts.check('40px Anton') && document.fonts.check('600 20px "Barlow Condensed"') && document.fonts.check('700 20px "IBM Plex Mono"'); }));
  if (SHOTS) await page2.screenshot({ path: path.join(shotDir, '00-title-demo.png') });
  await page2.click('button[data-act=play]');
  await page2.waitForTimeout(150);
  if (SHOTS) await page2.screenshot({ path: path.join(shotDir, '02b-select.png') });
  await page2.click('#char-cards .card');
  check('select: clicking a runner starts a real run', await page2.evaluate(() => !LOOPBACK.G.demo && LOOPBACK.G.mode === 'intro'));
  await page2.waitForTimeout(3200);
  check('music: sector song plays during a run', await page2.evaluate(() => { const m = LOOPBACK.Snd.music.state; return m.mode === 'song' && m.song === 'The Yard' && m.layers === 0; }), JSON.stringify(await page2.evaluate(() => LOOPBACK.Snd.music.state)));
  check('hud: visible during a run', await page2.evaluate(() => !document.getElementById('hud').classList.contains('hidden')));
  check('hud: shows loop and timecode', await page2.evaluate(() => /loop 1/.test(document.getElementById('h-loop').textContent) && /^00:\d\d\.\d/.test(document.getElementById('h-time').textContent)));
  await page2.keyboard.press('Escape');
  await page2.waitForTimeout(100);
  check('pause: Escape opens pause with timecode', await page2.isVisible('#scr-pause') && await page2.evaluate(() => /loop 1/.test(document.getElementById('pause-code').textContent)));
  if (SHOTS) await page2.screenshot({ path: path.join(shotDir, '09-pause.png') });
  await page2.click('button[data-act=quit]');
  await page2.waitForTimeout(150);
  check('over: abandoning shows run over', await page2.isVisible('#scr-over'));
  if (SHOTS) await page2.screenshot({ path: path.join(shotDir, '10-over.png') });
  await page2.click('button[data-act=title]');
  await page2.waitForTimeout(300);
  check('over: main menu returns to the live title', await page2.isVisible('#scr-title') && await page2.evaluate(() => LOOPBACK.G.demo));
  for (const [act, name] of [['lab', '11-lab'], ['howto', '12-howto'], ['settings', '13-settings']]) {
    await page2.click(`#scr-title button[data-act=${act}]`); await page2.waitForTimeout(120);
    if (SHOTS) await page2.screenshot({ path: path.join(shotDir, name + '.png') });
    await page2.keyboard.press('Escape'); await page2.waitForTimeout(80);
  }
  check('menus: Escape returns to title from sub-screens', await page2.isVisible('#scr-title'));
  await page2.evaluate(() => LOOPBACK.toTitle());
  await page2.evaluate(() => LOOPBACK.start('volt', { seed: 5 }));
  await page2.waitForTimeout(3500);
  check('real-time loop advances simulation', await page2.evaluate(() => LOOPBACK.G.mode === 'play' && LOOPBACK.G.st.tick > 20));
  if (SHOTS) await page2.screenshot({ path: path.join(shotDir, '08-realtime.png') });


  // ================= MOBILE (touch, phone landscape) =================
  const mctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const mp = await mctx.newPage();
  mp.on('pageerror', e => errors.push('mobile: ' + e));
  await mp.goto(URL + '?test');
  await mp.waitForTimeout(400);
  await mp.evaluate(() => LOOPBACK.resetSave());
  check('mobile: touch mode detected', await mp.evaluate(() => document.body.classList.contains('touch') && LOOPBACK.Touch.on));
  const fits = async sel => mp.evaluate(sel => [...document.querySelectorAll(sel)].every(el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.left >= 0 && r.right <= innerWidth + 1; }), sel);
  const playBox = await mp.locator('button[data-act=play]').boundingBox();
  check('mobile: PLAY button visible without scrolling', playBox && playBox.y + playBox.height <= 390, JSON.stringify(playBox));
  check('mobile: title has no horizontal overflow', await mp.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  if (SHOTS) await mp.screenshot({ path: path.join(shotDir, 'm1-title.png') });
  await mp.tap('button[data-act=play]');
  await mp.waitForTimeout(100);
  check('mobile: runner list fits inside screen', await fits('#char-cards .card'));
  if (SHOTS) await mp.screenshot({ path: path.join(shotDir, 'm2-select.png') });
  await mp.tap('#char-cards .card');
  check('mobile: tapping a runner starts a run', await mp.evaluate(() => LOOPBACK.G.mode === 'intro'));
  await mp.evaluate(() => LOOPBACK.step(160));
  const pdown = (id, x, y) => mp.evaluate(([id, x, y]) => document.getElementById('cv').dispatchEvent(new PointerEvent('pointerdown', { pointerId: id, pointerType: 'touch', clientX: x, clientY: y, bubbles: true, cancelable: true })), [id, x, y]);
  const pmove = (id, x, y) => mp.evaluate(([id, x, y]) => document.getElementById('cv').dispatchEvent(new PointerEvent('pointermove', { pointerId: id, pointerType: 'touch', clientX: x, clientY: y, bubbles: true })), [id, x, y]);
  const pup = (id, x, y) => mp.evaluate(([id, x, y]) => document.getElementById('cv').dispatchEvent(new PointerEvent('pointerup', { pointerId: id, pointerType: 'touch', clientX: x, clientY: y, bubbles: true })), [id, x, y]);
  const mx0 = await mp.evaluate(() => LOOPBACK.G.player.x);
  await pdown(1, 150, 280); await pmove(1, 220, 280);
  await mp.evaluate(() => { LOOPBACK.G.player.inv = 99; LOOPBACK.step(30); });
  const mx1 = await mp.evaluate(() => LOOPBACK.G.player.x);
  check('mobile: left stick moves player', mx1 > mx0 + 50, `${mx0} -> ${mx1}`);
  await pdown(2, 600, 200);
  const shots0 = await mp.evaluate(() => { LOOPBACK.G.pb.length = 0; LOOPBACK.step(20); return LOOPBACK.G.pb.length; });
  check('mobile: holding right side fires (auto-target)', shots0 > 0, `bullets=${shots0}`);
  await pmove(2, 600, 120);
  const aimUp = await mp.evaluate(() => { LOOPBACK.G.enemies.length = 0; LOOPBACK.G.st.anchor.active = false; LOOPBACK.step(2); return LOOPBACK.G.player.aim; });
  check('mobile: dragging right stick aims', Math.abs(aimUp + Math.PI / 2) < 0.2, `aim=${aimUp}`);
  if (SHOTS) { await mp.evaluate(() => { const G = LOOPBACK.G; G.st.anchor.active = true; for (let i = 0; i < 500; i++) { G.player.inv = 5; LOOPBACK.step(1); } LOOPBACK.render(); }); await mp.screenshot({ path: path.join(shotDir, 'm3-gameplay.png') }); }
  await pup(1, 220, 280); await pup(2, 600, 120);
  await mp.evaluate(() => { LOOPBACK.G.player.acd = 0; LOOPBACK.updateHUD(); });
  await mp.tap('#t-ab');
  check('mobile: ability button triggers ability', await mp.evaluate(() => { LOOPBACK.step(2); return LOOPBACK.G.player.acd > 0; }));
  check('mobile: sticks released after lift', await mp.evaluate(() => !LOOPBACK.Touch.move && !LOOPBACK.Touch.aim));
  await mp.evaluate(() => LOOPBACK.updateHUD());
  await mp.tap('#t-pause');
  check('mobile: pause button pauses', await mp.isVisible('#scr-pause'));
  if (SHOTS) await mp.screenshot({ path: path.join(shotDir, 'm4-pause.png') });
  await mp.tap('button[data-act=resume]');
  check('mobile: resume via tap', !(await mp.isVisible('#scr-pause')) && await mp.evaluate(() => !LOOPBACK.G.paused));
  // upgrade screen fits on phone
  await mp.evaluate(() => { const G = LOOPBACK.G; for (let i = 0; i < 400 && G.mode === 'play'; i++) { const a = G.st.anchor; if (a.active && !a.dead) { a.hp = 0.5; G.pb.push({ x: a.x, y: a.y, vx: 0, vy: 0, r: 5, dmg: 5, life: 1, pierce: 0, bounce: 0, ghost: false, homing: 0, chain: 0, hits: null, color: '#fff' }); } G.player.inv = 5; LOOPBACK.step(1); } });
  check('mobile: upgrade cards visible', await mp.evaluate(() => { const c = [...document.querySelectorAll('#up-cards .card')]; return c.length === 3 && c.every(el => { const r = el.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight && r.right <= innerWidth + 1; }); }));
  if (SHOTS) await mp.screenshot({ path: path.join(shotDir, 'm5-upgrade.png') });
  await mp.evaluate(() => LOOPBACK.chooseUpgrade(0));
  await mp.evaluate(() => LOOPBACK.step(170));
  // portrait: rotate prompt + auto-pause
  await mp.setViewportSize({ width: 390, height: 844 });
  await mp.waitForTimeout(150);
  check('mobile: portrait shows rotate prompt', await mp.isVisible('#rotate'));
  check('mobile: portrait pauses the run', await mp.evaluate(() => LOOPBACK.G.paused));
  await mp.setViewportSize({ width: 844, height: 390 });
  await mp.waitForTimeout(150);
  check('mobile: landscape hides rotate prompt', !(await mp.isVisible('#rotate')));
  await mctx.close();
  // desktop must stay non-touch
  check('desktop: not in touch mode', await page.evaluate(() => !LOOPBACK.Touch.on));

  check('no page errors', errors.length === 0, errors.join(' | '));
  await browser.close();
  console.log(results.join('\n'));
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
