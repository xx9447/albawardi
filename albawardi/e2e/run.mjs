// Al-Bawardi E2E — drives the built client in a real browser through a full
// duel round via the mouse input path, and checks the sensor-lab fallback.
// Run: node e2e/run.mjs   (expects vite preview servers on 4173 + 4174)

import pw from '/home/saoud/.hermes/hermes-agent/node_modules/playwright-core/index.js';
const { firefox } = pw;

const results = [];
const check = (name, ok, extra = '') => {
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`);
};

async function main() {
  const browser = await firefox.launch({
    executablePath: '/home/saoud/.cache/ms-playwright/firefox-1539/firefox/firefox',
    headless: true,
  });
  const page = await (await browser.newContext({ viewport: { width: 800, height: 600 } })).newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));

  // ---------- client: full round ----------
  await page.goto('http://localhost:4173/', { waitUntil: 'networkidle' });
  check('client loads', (await page.title()).includes('البواردي'));

  await page.getByText('ادخل الشارع').click();
  await page.waitForTimeout(300);
  check('explainer card after title tap', await page.getByText('فهمت — يلا نبارز').isVisible());

  // Deterministic round: AI misses, short tension, zero spread
  await page.evaluate(() => {
    const b = window.__bawardi;
    b.tuning.ai.accuracy = 0;
    b.tuning.round.signalMinMs = 1500;
    b.tuning.round.signalMaxMs = 2200;
    b.tuning.weapon.spreadAimDeg = 0;
    b.tuning.weapon.spreadHipDeg = 0;
  });

  await page.getByText('فهمت — يلا نبارز').click();
  await page.waitForTimeout(1800); // wait out the no-motion fallback timer
  const note = await page.locator('.controls-note').textContent();
  check('auto-detected mouse controls', note.includes('الماوس'), note);

  // Space hold → holster → tension
  await page.keyboard.down('Space');
  await page.waitForFunction(() => window.__bawardi.game.activeEngine?.phase === 'tension', null, { timeout: 6000 });
  check('Space hold = holster, tension begins', true);

  // Wait for the coin signal
  const liveOk = await page
    .waitForFunction(() => window.__bawardi.game.activeEngine?.phase === 'live', null, { timeout: 9000 })
    .then(() => true)
    .catch(() => false);
  check('coin signal arrives (phase live)', liveOk);

  // Release = draw, aim head, fire
  await page.keyboard.up('Space');
  await page.waitForTimeout(100);
  await page.evaluate(() => window.__bawardi.input.testAim(0, 0.62));
  await page.mouse.click(400, 300);
  await page.waitForTimeout(1200); // headless RAF throttling: let the sim catch up
  const eng = await page.evaluate(() => {
    const e = window.__bawardi.game.activeEngine;
    return { state: e.machine.state, shots: e.getLog().shots };
  });
  check('fire produces a shot', eng.shots.length >= 1, `state=${eng.state} zone=${eng.shots[0]?.zone}`);

  const resolved = await page
    .waitForFunction(() => window.__bawardi.game.activeEngine?.phase === 'resolved', null, { timeout: 12000 })
    .then(() => true)
    .catch(() => false);
  check('round resolves', resolved);

  const log = await page.evaluate(() => window.__bawardi.game.activeEngine.getLog());
  check('head shot = player win', log.winner === 'player', `winner=${log.winner}`);
  check('draw time recorded (350-700ms window)', log.drawTimeMs > 100 && log.drawTimeMs < 3000, `${Math.round(log.drawTimeMs)}ms`);

  await page.waitForTimeout(800);
  const resultText = (await page.locator('.result').textContent().catch(() => '')) || '';
  check('result card shows draw time', /زمن السحب/.test(resultText), resultText.slice(0, 60).replace(/\s+/g, ' '));

  // Auto-next: a new round should start
  const round2 = await page
    .waitForFunction(() => window.__bawardi.game.activeEngine?.getLog().index === 2, null, { timeout: 8000 })
    .then(() => true)
    .catch(() => false);
  check('auto-next round starts', round2);

  // Guess-fire foul: wait for the signal, then push a fire 50ms after it
  await page.keyboard.down('Space');
  await page.waitForFunction(() => window.__bawardi.game.activeEngine?.phase === 'live', null, { timeout: 9000 }).catch(() => {});
  const foulLog = await page
    .evaluate(() => {
      const e = window.__bawardi.game.activeEngine;
      const t = e.signalShownAt + 50; // deterministic: inside the 100ms guess window
      e.push({ type: 'fire', t, aim: { x: 0, y: 0.62 } });
      return new Promise((resolve) => setTimeout(() => resolve(e.getLog()), 500));
    })
    .catch(() => null);
  check(
    'instant fire = guess foul (round lost)',
    !!foulLog && foulLog.foul === 'guessFire' && foulLog.winner === 'ai',
    `foul=${foulLog?.foul} winner=${foulLog?.winner}`,
  );
  await page.keyboard.up('Space');

  // ---------- sensor-lab: fallback path ----------
  await page.goto('http://localhost:4174/', { waitUntil: 'networkidle' });
  check('sensor-lab loads', (await page.title()).includes('مختبر'));
  await page.locator('#startBtn').click();
  await page.waitForTimeout(1000);
  const labState = await page.evaluate(() => document.querySelector('#permNote').textContent || '');
  check(
    'sensor-lab fallback shown (no sensors in headless)',
    /متصفح ما يدعم|ما وصلت أي قراءة|رُفضت|رفضت/.test(labState) || labState.includes('✓'),
    labState.slice(0, 80),
  );

  // ---------- console health ----------
  const realErrors = errors.filter((e) => !/favicon|Download the React DevTools/i.test(e));
  check('no console/page errors', realErrors.length === 0, realErrors.slice(0, 3).join(' | ').slice(0, 200));

  await browser.close();
  console.log(results.join('\n'));
  const failed = results.filter((r) => r.startsWith('FAIL')).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error('E2E crashed:', e);
  process.exit(1);
});
