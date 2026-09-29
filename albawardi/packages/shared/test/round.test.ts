import { describe, expect, it } from 'vitest';
import { DEFAULT_AI, LIMPING_KID, type AiParams } from '../src/ai.js';
import { mulberry32 } from '../src/rng.js';
import { RoundEngine, type RoundInputEvent, type RoundEngineOptions } from '../src/round.js';
import { REVOLVER, type WeaponDef } from '../src/weapons.js';

/** Deterministic revolver: zero spread so scripted aims land exactly. */
const TEST_GUN: WeaponDef = { ...REVOLVER, spreadAimDeg: 0, spreadHipDeg: 0 };

/** Scripted AI: fully controlled reaction/hit for exact scenarios. */
function ai(over: Partial<AiParams>): AiParams {
  return { ...DEFAULT_AI, ...over };
}

const NO_MISS_AI = ai({ accuracy: 1, headProb: 0, minReactionMs: 160, reactionMeanMs: 2000, reactionSdMs: 1 });
const LETHAL_AI = ai({ accuracy: 1, headProb: 1, minReactionMs: 160, reactionMeanMs: 2000, reactionSdMs: 1 });
const MISS_AI = ai({ accuracy: 0, minReactionMs: 160, reactionMeanMs: 4000, reactionSdMs: 1 });

interface Script {
  events: RoundInputEvent[];
  /** Step the engine through these times after the events are queued. */
  until: number;
  opts?: Partial<RoundEngineOptions>;
}

/** Pose helper: hold a tilt from t0..t1 at 60Hz with the given rate. */
function hold(t0: number, t1: number, tiltDeg: number, rateDeg = 0): RoundInputEvent[] {
  const evs: RoundInputEvent[] = [];
  for (let t = t0; t <= t1; t += 1000 / 60) {
    evs.push({ type: 'pose', t: Math.round(t), tiltDeg, rateDeg });
  }
  return evs;
}

/** Feed events live (push + step together) so phases advance naturally. */
function runRound(script: Script): RoundEngine {
  const engine = new RoundEngine({
    rng: mulberry32(7),
    weapon: TEST_GUN,
    params: { signalMinMs: 2000, signalMaxMs: 2000 },
    ai: NO_MISS_AI,
    ...script.opts,
  });
  engine.start(0);
  let i = 0;
  const events = [...script.events].sort((a, b) => a.t - b.t);
  const stepMs = 1000 / 60;
  for (let t = 0; t <= script.until && engine.phase !== 'resolved'; t += stepMs) {
    while (i < events.length && events[i].t <= t) engine.push(events[i++]);
    engine.step(t);
  }
  // Final flush so anything exactly at `until` resolves.
  while (i < events.length) engine.push(events[i++]);
  engine.step(script.until + 1000);
  return engine;
}

/** Settle into the holster (tilt -70, steady) → tension begins at ~t=400. */
const SETTLE = hold(0, 600, -70);

describe('RoundEngine — full duel loop', () => {
  it('happy path: holster → signal → draw → aim → head shot → player wins', () => {
    const engine = runRound({
      events: [
        ...SETTLE,
        ...hold(700, 2340, -70),
        // signal lands at 400 + 2000 = 2400 (deterministic params)
        ...hold(2500, 2600, 60), // cross -30 (draw) then reach aim
        { type: 'fire', t: 3000, aim: { x: 0, y: 0.62 } }, // head, spread 0
      ],
      until: 4000,
      opts: { ai: NO_MISS_AI },
    });

    expect(engine.phase).toBe('resolved');
    const log = engine.getLog();
    expect(log.winner).toBe('player');
    expect(log.foul).toBeNull();
    expect(log.signalShownAt).toBeCloseTo(2400, -2);
    expect(log.shots).toHaveLength(1);
    expect(log.shots[0].zone).toBe('head');
    expect(log.shots[0].hit).toBe(true);
    // Draw time = first shot − signal shown.
    expect(log.drawTimeMs).toBeCloseTo(600, -2);
    expect(log.drawCrossAt).toBeCloseTo(2500, -2);
    expect(log.aiHealth).toBe(0);
  });

  it('records the draw crossing time and the raise separately from the shot', () => {
    const engine = runRound({
      events: [...SETTLE, ...hold(700, 2340, -70), ...hold(2500, 2516, -20), ...hold(2600, 2700, 60), { type: 'fire', t: 3500, aim: { x: 0, y: 0.3 } }],
      until: 5000,
    });
    const log = engine.getLog();
    expect(log.drawCrossAt).toBeCloseTo(2500, -2);
    expect(log.firstShotAt).toBeCloseTo(3500, -2);
    expect(log.shots[0].zone).toBe('torso');
    expect(log.aiHealth).toBe(65);
  });

  it('early draw (>25° before the signal) loses the round immediately', () => {
    const engine = runRound({
      events: [...SETTLE, ...hold(700, 1000, -70), ...hold(1100, 1500, -30)], // +40° before signal (2400)
      until: 3000,
    });
    expect(engine.phase).toBe('resolved');
    const log = engine.getLog();
    expect(log.winner).toBe('ai');
    expect(log.foul).toBe('earlyDraw');
    expect(log.signalShownAt).toBeNull(); // the signal never got displayed
  });

  it('twitch (10–25°) before the signal is only a warning — round continues', () => {
    const events: RoundInputEvent[] = [...SETTLE, ...hold(700, 1000, -70), ...hold(1100, 1300, -60)];
    const engine = new RoundEngine({
      rng: mulberry32(7),
      weapon: TEST_GUN,
      params: { signalMinMs: 2000, signalMaxMs: 2000 },
      ai: NO_MISS_AI,
    });
    engine.start(0);
    let i = 0;
    const sorted = [...events].sort((a, b) => a.t - b.t);
    for (let t = 0; t <= 1600; t += 1000 / 60) {
      while (i < sorted.length && sorted[i].t <= t) engine.push(sorted[i++]);
      engine.step(t);
    }
    expect(['holstered', 'twitch']).toContain(engine.machine.state);
    expect(engine.phase).toBe('tension'); // still waiting for the signal — no foul
  });

  it('a shot <100ms after the signal is a guess → foul', () => {
    const engine = runRound({
      events: [...SETTLE, ...hold(700, 2340, -70), { type: 'fire', t: 2450, aim: { x: 0, y: 0.62 } }],
      until: 3000,
    });
    const log = engine.getLog();
    expect(log.winner).toBe('ai');
    expect(log.foul).toBe('guessFire');
    expect(log.shots).toHaveLength(0);
  });

  it('firing before the signal at all → earlyFire foul', () => {
    const engine = runRound({
      events: [...SETTLE, ...hold(700, 1500, -70), { type: 'fire', t: 1600, aim: { x: 0, y: 0.62 } }],
      until: 2600,
    });
    const log = engine.getLog();
    expect(log.winner).toBe('ai');
    expect(log.foul).toBe('earlyFire');
  });

  it('AI lethal shot wins the round for the AI', () => {
    const engine = runRound({
      events: [...SETTLE, ...hold(700, 2340, -70), ...hold(2500, 4000, 60)],
      until: 5000,
      opts: { ai: LETHAL_AI },
    });
    const log = engine.getLog();
    expect(log.winner).toBe('ai');
    expect(log.playerHealth).toBe(0);
    expect(log.aiShot?.zone).toBe('head');
    expect(log.aiShot?.hit).toBe(true);
  });

  it('two lethal shots within the 10ms window = double death (replay)', () => {
    // Signal ≈ 2416 (first 60Hz step past 2400); AI lethal at signal+210 ≈ 2626,
    // player lethal at 2620 → 6ms apart → both fall.
    const ai = { ...LETHAL_AI, reactionMeanMs: 210, reactionSdMs: 1, minReactionMs: 160 };
    const engine = runRound({
      events: [
        ...SETTLE,
        ...hold(700, 2340, -70),
        ...hold(2500, 2700, 60),
        { type: 'fire', t: 2620, aim: { x: 0, y: 0.62 } }, // lethal
      ],
      until: 4000,
      opts: { ai },
    });
    const log = engine.getLog();
    const signal = log.signalShownAt ?? 0;
    const gap = Math.abs((signal + 210) - 2620);
    expect(gap).toBeLessThanOrEqual(10);
    expect(log.winner).toBe('double');
    expect(log.playerHealth).toBe(0);
    expect(log.aiHealth).toBe(0);
  });

  it('lethal shots more than 10ms apart: the first shooter wins', () => {
    // AI lethal at signal+200; player fires 300ms later — already dead.
    const ai = { ...LETHAL_AI, reactionMeanMs: 200, reactionSdMs: 1, minReactionMs: 160 };
    const engine = runRound({
      events: [
        ...SETTLE,
        ...hold(700, 2340, -70),
        ...hold(2500, 2900, 60),
        { type: 'fire', t: 2800, aim: { x: 0, y: 0.62 } }, // after the AI killed us
      ],
      until: 4000,
      opts: { ai },
    });
    const log = engine.getLog();
    expect(log.winner).toBe('ai');
    expect(log.playerHealth).toBe(0);
    expect(log.shots).toHaveLength(0); // dead players cannot shoot
  });

  it('timeout after 8s with both alive → higher health wins', () => {
    const engine = runRound({
      events: [
        ...SETTLE,
        ...hold(700, 2340, -70),
        ...hold(2500, 3000, 60),
        { type: 'fire', t: 3200, aim: { x: 0, y: 0.3 } }, // torso 35 damage
        ...hold(3400, 11000, 60),
      ],
      until: 11000,
      opts: { ai: MISS_AI },
    });
    const log = engine.getLog();
    expect(log.winner).toBe('player'); // 100 vs 65
    expect(log.aiHealth).toBe(65);
    expect(log.playerHealth).toBe(100);
  });

  it('timeout with equal health = double (replay)', () => {
    const engine = runRound({
      events: [...SETTLE, ...hold(700, 2340, -70), ...hold(2500, 11000, 60)],
      until: 11000,
      opts: { ai: MISS_AI },
    });
    const log = engine.getLog();
    expect(log.winner).toBe('double');
  });

  it('dry firing (empty cylinder) does not waste a shot or a foul', () => {
    const engine = new RoundEngine({
      rng: mulberry32(7),
      weapon: { ...TEST_GUN, ammo: 1, minFireIntervalMs: 0 },
      params: { signalMinMs: 2000, signalMaxMs: 2000 },
      ai: MISS_AI,
    });
    engine.start(0);
    const evs: RoundInputEvent[] = [
      ...SETTLE,
      ...hold(700, 2340, -70),
      ...hold(2500, 2600, 60),
      { type: 'fire', t: 3000, aim: { x: 0, y: 0.3 } }, // spends the single round
      { type: 'fire', t: 3100, aim: { x: 0, y: 0.3 } }, // dry click
    ];
    let i = 0;
    for (let t = 0; t <= 3200 && engine.phase !== 'resolved'; t += 1000 / 60) {
      while (i < evs.length && evs[i].t <= t) engine.push(evs[i++]);
      engine.step(t);
    }
    engine.step(3400);
    const log = engine.getLog();
    expect(log.shots).toHaveLength(1); // the dry click produced nothing
    expect(engine.phase).toBe('live'); // round continues (the AI only fires at ~6400)
    expect(engine.machine.state).toBe('reload'); // dry → reload state
  });

  it('reload: open → per-round taps → close restores firing', () => {
    const engine = new RoundEngine({
      rng: mulberry32(7),
      weapon: { ...TEST_GUN, ammo: 2, minFireIntervalMs: 0 },
      params: { signalMinMs: 2000, signalMaxMs: 2000 },
      ai: MISS_AI,
    });
    engine.start(0);
    const evs: RoundInputEvent[] = [
      ...SETTLE,
      ...hold(700, 2340, -70),
      ...hold(2500, 2600, 60),
      { type: 'fire', t: 3000, aim: { x: 0, y: 0.3 } },
      { type: 'fire', t: 3100, aim: { x: 0, y: 0.3 } }, // empty now
      { type: 'reloadOpen', t: 3200 },
      { type: 'reloadRound', t: 3400 },
      { type: 'reloadRound', t: 3600 },
      { type: 'reloadClose', t: 3800 },
      { type: 'fire', t: 4200, aim: { x: 0, y: 0.3 } },
    ];
    let i = 0;
    for (let t = 0; t <= 4200 && engine.phase !== 'resolved'; t += 1000 / 60) {
      while (i < evs.length && evs[i].t <= t) engine.push(evs[i++]);
      engine.step(t);
    }
    while (i < evs.length) engine.push(evs[i++]); // flush any tail events
    engine.step(4500);
    const log = engine.getLog();
    expect(log.shots).toHaveLength(3);
    expect(log.aiHealth).toBe(0); // clamped: 100 − 105
    expect(log.winner).toBe('player');
  });

  it('min fire interval enforces the 350ms cycle between shots', () => {
    const engine = new RoundEngine({
      rng: mulberry32(7),
      weapon: { ...TEST_GUN, minFireIntervalMs: 350 },
      params: { signalMinMs: 2000, signalMaxMs: 2000 },
      ai: MISS_AI,
    });
    engine.start(0);
    const evs: RoundInputEvent[] = [
      ...SETTLE,
      ...hold(700, 2340, -70),
      ...hold(2500, 2600, 60),
      { type: 'fire', t: 3000, aim: { x: 0, y: 0.3 } },
      { type: 'fire', t: 3200, aim: { x: 0, y: 0.3 } }, // 200ms — too soon, ignored
      { type: 'fire', t: 3300, aim: { x: 0, y: 0.3 } }, // 300ms — still inside 350ms
    ];
    let i = 0;
    for (let t = 0; t <= 3500 && engine.phase !== 'resolved'; t += 1000 / 60) {
      while (i < evs.length && evs[i].t <= t) engine.push(evs[i++]);
      engine.step(t);
    }
    while (i < evs.length) engine.push(evs[i++]);
    engine.step(3600);
    expect(engine.getLog().shots.length).toBe(1);
  });

  it('hip shot from the draw state hits the same zone but is flagged hip', () => {
    const engine = runRound({
      events: [...SETTLE, ...hold(700, 2340, -70), ...hold(2500, 2700, 0), { type: 'fire', t: 3000, aim: { x: 0, y: 0.3 } }],
      until: 4000,
      opts: { ai: MISS_AI },
    });
    const log = engine.getLog();
    expect(log.shots[0].hip).toBe(true);
    expect(log.shots[0].zone).toBe('torso');
  });

  it('the Limping Kid can be plugged in as the round opponent', () => {
    const engine = new RoundEngine({ rng: mulberry32(1), ai: LIMPING_KID, weapon: TEST_GUN });
    engine.start(0);
    engine.push(...hold(0, 600, -70));
    engine.step(700);
    expect(engine.phase).toBe('tension'); // round scheduled and waiting
  });
});
