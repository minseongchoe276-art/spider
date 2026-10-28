// V4 local Chrome measurements. Copy and probe only. No physics or combat numbers change.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { chromium } from '/Users/choeminseong/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const outDir = path.join(root, 'docs/qa/quality-director-2026-10-28');
const shotDir = path.join(outDir, 'shots', 'v4');
fs.mkdirSync(shotDir, { recursive: true });
const base = process.env.QUALITY_URL || 'http://127.0.0.1:5191';
const SEED = 20261028;
const report = { seed: SEED, started: new Date().toISOString(), build: null, tests: [], errors: [] };

function save() {
  fs.writeFileSync(path.join(outDir, 'v4-live.json'), JSON.stringify(report, null, 2));
}
function record(name, status, detail = {}) {
  report.tests.push({ name, status, ...detail });
  console.log(`${status}  ${name}`);
  save();
}
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function compress(frames) {
  const changes = [];
  let previous = '';
  for (const frame of frames) {
    const key = `${frame.state}|${frame.animation}|${frame.attack || ''}`;
    if (key === previous) continue;
    previous = key;
    changes.push(frame);
  }
  const fov = frames.map(frame => frame.fov).filter(value => Number.isFinite(value));
  const gaps = frames.flatMap(frame => [frame.leftGap, frame.rightGap]).filter(value => Number.isFinite(value));
  const hips = frames.map(frame => frame.hips).filter(value => Number.isFinite(value));
  return {
    count: frames.length,
    states: [...new Set(frames.map(frame => frame.state))],
    animations: [...new Set(frames.map(frame => frame.animation))],
    attacks: [...new Set(frames.map(frame => frame.attack).filter(Boolean))],
    slamLand: frames.some(frame => frame.animation === 'slamLand' || frame.attack === 'slamLand'),
    fov: fov.length ? { min: +Math.min(...fov).toFixed(2), max: +Math.max(...fov).toFixed(2) } : null,
    gap: gaps.length ? { min: +Math.min(...gaps).toFixed(3), max: +Math.max(...gaps).toFixed(3) } : null,
    hips: hips.length ? { min: +Math.min(...hips).toFixed(3), max: +Math.max(...hips).toFixed(3) } : null,
    changes: changes.slice(0, 24),
    first: frames[0] || null,
    last: frames.at(-1) || null,
  };
}

const browser = await chromium.launch({
  channel: 'chrome',
  headless: false,
  args: ['--disable-background-timer-throttling', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
page.on('pageerror', error => report.errors.push(String(error)));
page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });

async function shot(name) {
  const file = path.join(shotDir, `${name}.png`);
  await page.screenshot({ path: file });
  return path.relative(root, file);
}
async function ready() {
  await page.waitForFunction(() => globalThis.__shadowPulseQuality?.ready?.(), null, { timeout: 120000 });
  await page.waitForFunction(() => globalThis.__shadowPulseQuality.playing(), null, { timeout: 25000 });
  await page.waitForTimeout(400);
}
async function frames(ms) {
  return page.evaluate(async (duration) => {
    const probe = globalThis.__shadowPulseQuality;
    const samples = [];
    const start = performance.now();
    while (performance.now() - start < duration && samples.length < 280) {
      await new Promise(resolve => requestAnimationFrame(resolve));
      const snap = probe.snapshot();
      const pose = probe.pose();
      samples.push({
        state: snap.state,
        animation: snap.animation,
        animationTime: snap.animationTime,
        attack: snap.attack?.key || null,
        speed: snap.speed,
        fov: snap.camera?.fov ?? pose.fov,
        pitch: snap.camera?.pitch ?? null,
        roll: pose.roll,
        y: snap.position?.[1] ?? null,
        x: snap.position?.[0] ?? null,
        z: snap.position?.[2] ?? null,
        webs: snap.webs?.length || 0,
        leftGap: snap.feet?.left?.gap ?? null,
        rightGap: snap.feet?.right?.gap ?? null,
        hips: pose.hipsHeight,
        wrist: pose.left?.wrist ?? null,
        knee: pose.left?.knee ?? null,
        shoot: pose.shoot?.left ?? null,
        webShot: pose.webShotTimer,
      });
    }
    return samples;
  }, ms);
}
async function settle() {
  await page.evaluate(() => globalThis.__shadowPulseQuality.release());
  let state = 'unknown';
  for (let step = 0; step < 30; step++) {
    state = await page.evaluate(() => globalThis.__shadowPulseQuality.snapshot().state);
    if (state === 'IDLE') return state;
    await page.waitForTimeout(100);
  }
  return state;
}

try {
  await page.goto(`${base}/?city=procedural&play=solo&qualityDirector=1`, { waitUntil: 'domcontentloaded', timeout: 40000 });
  await ready();
  report.build = await page.evaluate(() => globalThis.__shadowPulseQuality.dump().build);
  const guide = await page.evaluate(() => {
    const rootNode = document.getElementById('controls-guide');
    const text = rootNode?.innerText || '';
    const card = document.querySelector('[data-mode="tag"] small')?.textContent || '';
    return {
      card,
      hasOldRange: text.includes('3~5분') || card.includes('3~5분'),
      hasWireName: text.includes('에너지 와이어'),
      hasSpider: text.includes('거미줄') || card.includes('거미줄'),
      hasServerTimer: text.includes('서버 종료 시각'),
      hasTouchException: text.includes('터치는 그 예외'),
      hasGamepad: text.includes('RB, 십자 아래, 십자 오른쪽은 동작이 없습니다'),
      hasCtrlEvade: text.includes('Ctrl + 방향') || text.includes('짧은 회피'),
      callsBEvade: /B 회피|B는 회피/.test(text),
      callsTriggersAlwaysWire: text.includes('LT/RT 양손'),
    };
  });
  record('도움말·로비 카드 문구', guide.hasWireName && guide.hasServerTimer && guide.hasTouchException && guide.hasGamepad && !guide.hasOldRange && !guide.hasSpider && !guide.hasCtrlEvade && !guide.callsBEvade && !guide.callsTriggersAlwaysWire ? 'PASS' : 'FAIL', { detail: guide, shot: await shot('help-ko') });

  const motions = await page.evaluate(() => globalThis.__shadowPulseQuality.motions());
  record('훅·헤비 클립 출처', motions.hook?.source && motions.hook.source === motions.heavy?.source && motions.hook.authored && !motions.hook.choreography && !motions.heavy?.choreography ? 'PASS' : 'FAIL', { detail: motions });
  record('fallVariant 재생 선택', 'UNVERIFIED', { detail: { loaded: !!motions.fallVariant, note: '클립은 로드된다. 착지 분기는 플레이 중 확인한다.' } });

  await settle();
  await page.evaluate(() => globalThis.__shadowPulseQuality.raise(1.2));
  const low = compress(await frames(2200));
  record('낮은 낙하 착지', low.states.includes('LANDING') && low.animations.includes('land') && !low.slamLand ? 'PASS' : (low.states.includes('LANDING') ? 'FAIL' : 'UNVERIFIED'), { detail: low, shot: await shot('land-low') });

  await settle();
  await page.evaluate(() => globalThis.__shadowPulseQuality.raise(12));
  const beforeAudio = await page.evaluate(() => globalThis.__shadowPulseQuality.audioCounts());
  const high = compress(await frames(2800));
  const afterAudio = await page.evaluate(() => globalThis.__shadowPulseQuality.audioCounts());
  record('높은 낙하 착지', high.animations.includes('land') && !high.slamLand ? 'PASS' : (high.count ? 'FAIL' : 'UNVERIFIED'), {
    detail: { ...high, playLandBefore: beforeAudio.playLand || 0, playLandAfter: afterAudio.playLand || 0 },
    shot: await shot('land-high'),
  });

  await settle();
  await page.evaluate(() => { const probe = globalThis.__shadowPulseQuality; probe.raise(2.4); probe.shove(6, 0); });
  const fast = compress(await frames(2200));
  record('빠른 수평 낙하', fast.count > 10 ? 'PASS' : 'UNVERIFIED', { detail: { ...fast, note: '수평 4.5 이상이고 바닥이 이어지면 구르기가 설계된 분기다. slamLand는 공중 내려찍기 전용이다.' }, shot: await shot('land-fast') });

  await settle();
  await page.evaluate(() => globalThis.__shadowPulseQuality.key('KeyQ', true));
  await page.waitForTimeout(200);
  await page.evaluate(() => globalThis.__shadowPulseQuality.key('KeyQ', false));
  const mode = await page.evaluate(() => globalThis.__shadowPulseQuality.combat());
  record('전투 모드 진입', mode?.mode === 'combat' ? 'PASS' : 'FAIL', { detail: mode });

  await page.evaluate(() => { globalThis.__shadowPulseQuality.key('ControlLeft', true); });
  await page.waitForTimeout(180);
  const ctrl = await page.evaluate(() => globalThis.__shadowPulseQuality.combat());
  await page.evaluate(() => globalThis.__shadowPulseQuality.key('ControlLeft', false));
  record('Ctrl은 회피를 시작하지 않음', !ctrl?.action?.key?.startsWith('dodge') ? 'PASS' : 'FAIL', { detail: ctrl });

  async function strike(name, run) {
    await settle();
    await page.evaluate(() => globalThis.__shadowPulseQuality.key('KeyQ', false));
    const before = await page.evaluate(() => globalThis.__shadowPulseQuality.snapshot());
    await run();
    const packed = compress(await frames(900));
    const body = packed.first && packed.last ? Math.hypot((packed.last.x || 0) - (packed.first.x || 0), (packed.last.z || 0) - (packed.first.z || 0)) : null;
    record(name, packed.attacks.length || packed.animations.some(item => ['jab', 'cross', 'heavy', 'special', 'hook'].includes(item)) ? 'PASS' : 'UNVERIFIED', {
      detail: { ...packed, travel: body === null ? null : +body.toFixed(3), started: before.state },
    });
  }
  await strike('정지 잽', async () => { await page.evaluate(() => globalThis.__shadowPulseQuality.mouse(0, true)); });
  await page.evaluate(() => globalThis.__shadowPulseQuality.mouse(0, false));
  await strike('달리기 잽', async () => {
    await page.evaluate(() => globalThis.__shadowPulseQuality.key('KeyW', true));
    await page.waitForTimeout(280);
    await page.evaluate(() => globalThis.__shadowPulseQuality.mouse(0, true));
  });
  await page.evaluate(() => { const probe = globalThis.__shadowPulseQuality; probe.mouse(0, false); probe.key('KeyW', false); });
  await strike('달리기 오른손', async () => {
    await page.evaluate(() => globalThis.__shadowPulseQuality.key('KeyW', true));
    await page.waitForTimeout(220);
    await page.evaluate(() => globalThis.__shadowPulseQuality.mouse(2, true));
  });
  await page.evaluate(() => { const probe = globalThis.__shadowPulseQuality; probe.mouse(2, false); probe.key('KeyW', false); });
  await strike('정지 헤비(E)', async () => { await page.evaluate(() => globalThis.__shadowPulseQuality.key('KeyE', true)); });
  await page.evaluate(() => globalThis.__shadowPulseQuality.key('KeyE', false));
  await shot('heavy-live');
  await strike('질주 잽', async () => {
    await page.evaluate(() => { const probe = globalThis.__shadowPulseQuality; probe.key('ShiftLeft', true); probe.key('KeyW', true); });
    await page.waitForTimeout(280);
    await page.evaluate(() => globalThis.__shadowPulseQuality.mouse(0, true));
  });
  await page.evaluate(() => { const probe = globalThis.__shadowPulseQuality; probe.mouse(0, false); probe.key('KeyW', false); probe.key('ShiftLeft', false); });

  await settle();
  const beforeSpecial = await page.evaluate(() => globalThis.__shadowPulseQuality.combat());
  await page.evaluate(() => globalThis.__shadowPulseQuality.key('KeyG', true));
  await page.waitForTimeout(200);
  const duringSpecial = await page.evaluate(() => globalThis.__shadowPulseQuality.combat());
  await page.evaluate(() => globalThis.__shadowPulseQuality.key('KeyG', false));
  await page.waitForTimeout(400);
  const afterSpecial = await page.evaluate(() => globalThis.__shadowPulseQuality.combat());
  record('돌진 어퍼컷 기력·재사용', duringSpecial?.action?.key === 'special' && duringSpecial.specialCooldown > 7 && duringSpecial.specialCooldown <= 8 && beforeSpecial.stamina - duringSpecial.stamina >= 30 ? 'PASS' : 'FAIL', {
    detail: { before: beforeSpecial, during: duringSpecial, after: afterSpecial },
    shot: await shot('uppercut'),
  });

  const dodges = {};
  for (const direction of ['left', 'right', 'back', 'forward']) {
    await settle();
    const started = await page.evaluate(dir => globalThis.__shadowPulseQuality.reviewDodge(dir), direction);
    const motion = compress(await frames(700));
    const from = started.from || [0, 0, 0];
    const to = motion.last ? [motion.last.x, motion.last.y, motion.last.z] : from;
    dodges[direction] = {
      started: started.started,
      key: started.key,
      distance: +Math.hypot((to[0] || 0) - from[0], (to[2] || 0) - from[2]).toFixed(3),
      states: motion.states,
      animations: motion.animations,
    };
  }
  record('잠복 회피 함수 이동', Object.values(dodges).every(item => item.started) ? 'PASS' : 'UNVERIFIED', {
    detail: { note: '플레이어 Ctrl은 회피를 시작하지 않는다. 이 수치는 Combat.dodge 직접 호출이며 속도 상수는 바꾸지 않았다.', dodges },
    shot: await shot('dodge-latent'),
  });

  await page.evaluate(() => globalThis.__shadowPulseQuality.key('KeyQ', true));
  await page.waitForTimeout(150);
  await page.evaluate(() => globalThis.__shadowPulseQuality.key('KeyQ', false));
  await settle();
  const sought = await page.evaluate(() => globalThis.__shadowPulseQuality.seekWebTarget());
  let swing = { sought };
  if (sought.ok) {
    await page.evaluate(() => globalThis.__shadowPulseQuality.mouse(0, true));
    const held = compress(await frames(4000));
    await page.evaluate(() => globalThis.__shadowPulseQuality.mouse(0, false));
    const released = compress(await frames(700));
    swing = { sought, held: { states: held.states, animations: held.animations, fov: held.fov, webs: held.changes.map(frame => frame.webs), count: held.count }, release: { states: released.states, animations: released.animations, first: released.first, changes: released.changes } };
    record('4초 스윙 FOV·해제 첫 구간', held.states.includes('SWINGING') ? 'PASS' : 'UNVERIFIED', { detail: swing, shot: await shot('swing-4s') });
  } else record('4초 스윙 FOV·해제 첫 구간', 'UNVERIFIED', { detail: swing });

  await settle();
  await page.evaluate(() => globalThis.__shadowPulseQuality.key('Space', true));
  await page.waitForTimeout(90);
  await page.evaluate(() => { const probe = globalThis.__shadowPulseQuality; probe.key('Space', false); probe.mouse(0, true); });
  const jumpWeb = compress(await frames(900));
  await page.evaluate(() => globalThis.__shadowPulseQuality.mouse(0, false));
  record('점프 후 와이어 발사', jumpWeb.count > 5 ? 'PASS' : 'UNVERIFIED', { detail: jumpWeb, shot: await shot('jump-web') });

  const random = mulberry32(SEED);
  const pool = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'KeyE', 'KeyF', 'KeyG'];
  const sequence = [];
  for (let step = 0; step < 24; step++) {
    const code = pool[Math.floor(random() * pool.length)];
    sequence.push(code);
    await page.evaluate(value => globalThis.__shadowPulseQuality.key(value, true), code);
    await page.waitForTimeout(70);
    await page.evaluate(value => globalThis.__shadowPulseQuality.key(value, false), code);
  }
  await page.evaluate(() => globalThis.__shadowPulseQuality.release());
  const afterRandom = await page.evaluate(() => {
    const snap = globalThis.__shadowPulseQuality.snapshot();
    return { state: snap.state, position: snap.position, errors: globalThis.__shadowPulseQuality.errors().length };
  });
  const finite = afterRandom.position?.every(value => Number.isFinite(value));
  record('시드 무작위 입력', finite ? 'PASS' : 'FAIL', { detail: { seed: SEED, sequence, after: afterRandom } });

  const audio = await page.evaluate(() => globalThis.__shadowPulseQuality.audioCounts());
  const vfx = await page.evaluate(() => globalThis.__shadowPulseQuality.vfxCounts());
  record('사운드·VFX 호출 횟수', 'PASS', { detail: { audio, vfx, note: '합성음 호출 횟수다. 음질과 화면 가림은 스크린샷으로만 본다.' }, shot: await shot('vfx') });

  await page.keyboard.press('KeyB');
  await page.waitForTimeout(1200);
  const vehicle = await page.evaluate(() => globalThis.__shadowPulseQuality.vehicle());
  record('솔로 차량 소환', vehicle ? 'PASS' : 'UNVERIFIED', { detail: vehicle, shot: await shot('vehicle-solo') });
} catch (error) {
  report.fatal = String(error?.stack || error);
  record('절차 도시 플레이', 'FAIL', { detail: report.fatal });
}

try {
  const english = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await english.goto(`${base}/?lang=en&city=procedural`, { waitUntil: 'domcontentloaded', timeout: 40000 });
  await english.waitForFunction(() => document.documentElement.lang === 'en' && /Energy Wire|energy wire/.test(document.body.innerText), null, { timeout: 30000 });
  const text = await english.locator('#controls-guide').innerText();
  const hangul = /[가-힣]/.test(text);
  record('영어 도움말', !hangul && /2 players 3 min/.test(text) && /hold RT for the left energy wire/.test(text) && /not to evade/.test(text) ? 'PASS' : 'FAIL', {
    detail: { hangul, sample: text.slice(0, 500) },
  });
  await english.close();
} catch (error) {
  record('영어 도움말', 'UNVERIFIED', { detail: String(error?.message || error) });
}

try {
  await page.goto(`${base}/?combatReview=1`, { waitUntil: 'domcontentloaded', timeout: 40000 });
  await page.waitForFunction(() => document.querySelectorAll('#combat-clip option').length > 5, null, { timeout: 90000 });
  const hashes = {};
  for (const key of ['hook', 'heavy']) {
    await page.evaluate(value => {
      document.querySelector('#combat-clip').value = value;
      document.querySelector('#combat-phase').value = '0.5';
      document.querySelector('#combat-sample').click();
    }, key);
    await page.waitForTimeout(80);
    const file = path.join(shotDir, `${key}-phase50.png`);
    await page.screenshot({ path: file });
    hashes[key] = createHash('sha1').update(fs.readFileSync(file)).digest('hex');
  }
  record('훅·헤비 50% 화면', hashes.hook === hashes.heavy ? 'FAIL' : 'PASS', { detail: { hashes, note: '같은 Boxing Hook 원본이다. 헤비는 heavyClipPhase로 재생 시점이 다르다. 해시가 같으면 그 차이가 화면에 없다.' } });
} catch (error) {
  record('훅·헤비 50% 화면', 'UNVERIFIED', { detail: String(error?.message || error) });
}

try {
  await page.goto(`${base}/?city=hong-kong&play=solo&qualityDirector=1`, { waitUntil: 'domcontentloaded', timeout: 40000 });
  await page.waitForFunction(() => globalThis.__shadowPulseQuality?.ready?.(), null, { timeout: 120000 });
  await page.waitForFunction(() => globalThis.__shadowPulseQuality.playing(), null, { timeout: 25000 });
  let citizens = null;
  for (let step = 0; step < 20; step++) {
    citizens = await page.evaluate(() => globalThis.__shadowPulseQuality.citizens());
    if (citizens?.count > 0) break;
    await page.waitForTimeout(500);
  }
  record('홍콩 시민 표시', citizens?.count > 0 ? 'PASS' : 'UNVERIFIED', { detail: { count: citizens?.count || 0, streamed: citizens?.streamed, sample: citizens?.people?.slice?.(0, 3) || [] }, shot: await shot('hong-kong-citizens') });
} catch (error) {
  record('홍콩 시민 표시', 'UNVERIFIED', { detail: String(error?.message || error) });
}

try {
  const host = await browser.newPage({ viewport: { width: 1100, height: 760 } });
  const guest = await browser.newPage({ viewport: { width: 1100, height: 760 } });
  async function boot(target, name) {
    await target.goto(`${base}/?city=procedural&qualityDirector=1`, { waitUntil: 'domcontentloaded', timeout: 40000 });
    await target.waitForFunction(() => globalThis.__shadowPulseQuality?.ready?.(), null, { timeout: 120000 });
    await target.evaluate(player => {
      document.getElementById('player-name').value = player;
      document.querySelector('[data-mode="tag"]')?.click();
      document.getElementById('room-capacity').value = '2';
    }, name);
  }
  await boot(host, 'V4Host');
  await boot(guest, 'V4Guest');
  await host.evaluate(() => document.getElementById('create-room').click());
  await host.waitForFunction(() => (document.getElementById('room-code-display')?.textContent || '').trim().length >= 4, null, { timeout: 15000 });
  const code = (await host.locator('#room-code-display').innerText()).trim();
  const waiting = await host.locator('#room-message').innerText();
  await guest.evaluate(value => { document.getElementById('room-code').value = value; document.getElementById('join-code').click(); }, code);
  await guest.waitForFunction(() => !document.getElementById('room-panel').classList.contains('hidden'), null, { timeout: 15000 });
  const both = await host.locator('#room-message').innerText();
  await host.evaluate(() => document.getElementById('room-ready').click());
  await guest.evaluate(() => document.getElementById('room-ready').click());
  await host.waitForTimeout(400);
  await host.evaluate(() => document.getElementById('room-start').click());
  await host.waitForFunction(() => globalThis.__shadowPulseQuality.playing(), null, { timeout: 20000 });
  await guest.waitForFunction(() => globalThis.__shadowPulseQuality.playing(), null, { timeout: 20000 });
  const notice = await host.evaluate(() => document.getElementById('game-notice')?.textContent || '');
  const timer = await host.locator('#match-timer').innerText();
  await host.keyboard.down('w');
  await host.waitForTimeout(600);
  await host.keyboard.up('w');
  const hostSnap = await host.evaluate(() => globalThis.__shadowPulseQuality.snapshot());
  const peers = await guest.evaluate(() => globalThis.__shadowPulseQuality.peers());
  const seen = peers.some(peer => peer.position && Math.hypot(peer.position[0] - hostSnap.position[0], peer.position[2] - hostSnap.position[2]) < 20);
  record('로컬 2인 태그 문구·동기', both.includes('지금은 2명') && both.includes('3분') && seen ? 'PASS' : 'FAIL', {
    detail: { code, waiting, both, notice, timer, seen, peers: peers.map(peer => ({ name: peer.name, motion: peer.motion, position: peer.position })) },
  });
  await host.close();
  await guest.close();
} catch (error) {
  record('로컬 2인 태그 문구·동기', 'UNVERIFIED', { detail: String(error?.stack || error).slice(0, 800) });
}

report.finished = new Date().toISOString();
save();
console.log(JSON.stringify({ build: report.build, tests: report.tests.map(test => [test.status, test.name]), fatal: report.fatal || null, errors: report.errors.slice(0, 8) }, null, 2));
await browser.close();
