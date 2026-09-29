import { describe, expect, it } from 'vitest';
import { HolsterDetector } from '../src/holster.js';
import { InputStateMachine } from '../src/stateMachine.js';

const p = { twitchEnterDeg: 10, foulDeg: 25, drawCrossDeg: -30, aimEnterDeg: 55 };

function makeMachine() {
  return new InputStateMachine({ ...p });
}

/** Feed a steady holster settle: 500ms below -60° with low rate. */
function settleHolstered(m: InputStateMachine, t0 = 0) {
  for (let i = 0; i <= 10; i++) {
    m.update({ t: t0 + i * 50, tiltDeg: -70, holster: 'in' as const });
  }
  return t0 + 500;
}

describe('InputStateMachine transitions (design-doc table)', () => {
  it('notReady → holstered once the phone is steady in the holster', () => {
    const m = makeMachine();
    expect(m.state).toBe('notReady');
    settleHolstered(m);
    expect(m.state).toBe('holstered');
    expect(m.holsterBaselineTilt).toBe(-70);
  });

  it('10–25° pre-signal movement → twitch (warning, no penalty)', () => {
    const m = makeMachine();
    settleHolstered(m);
    const r = m.update({ t: 600, tiltDeg: -55, holster: 'in' }); // +15° above baseline
    expect(m.state).toBe('twitch');
    expect(r.twitchWarning).toBe(true);
  });

  it('returning to the holster clears the twitch', () => {
    const m = makeMachine();
    settleHolstered(m);
    m.update({ t: 600, tiltDeg: -55, holster: 'in' });
    m.update({ t: 700, tiltDeg: -68, holster: 'in' }); // back within 10° of baseline
    expect(m.state).toBe('holstered');
  });

  it('>25° pre-signal movement → foul (early draw)', () => {
    const m = makeMachine();
    settleHolstered(m);
    m.update({ t: 600, tiltDeg: -40, holster: 'out' }); // +30° above baseline
    expect(m.state).toBe('foul');
  });

  it('signal while holstered → armed', () => {
    const m = makeMachine();
    settleHolstered(m);
    m.onEvent({ type: 'signal', t: 700 });
    expect(m.state).toBe('armed');
  });

  it('signal while twitching → armed (no penalty)', () => {
    const m = makeMachine();
    settleHolstered(m);
    m.update({ t: 600, tiltDeg: -55, holster: 'in' });
    m.onEvent({ type: 'signal', t: 700 });
    expect(m.state).toBe('armed');
  });

  it('armed → draw when the tilt crosses -30° after the signal', () => {
    const m = makeMachine();
    settleHolstered(m);
    m.onEvent({ type: 'signal', t: 700 });
    m.update({ t: 800, tiltDeg: -25, holster: 'out' });
    expect(m.state).toBe('draw');
  });

  it('draw → aim when the tilt reaches the aim angle (≥55°)', () => {
    const m = makeMachine();
    settleHolstered(m);
    m.onEvent({ type: 'signal', t: 700 });
    m.update({ t: 800, tiltDeg: -25, holster: 'out' });
    m.update({ t: 900, tiltDeg: 60, holster: 'out' });
    expect(m.state).toBe('aim');
  });

  it('aim → draw when lowering below the aim angle', () => {
    const m = makeMachine();
    settleHolstered(m);
    m.onEvent({ type: 'signal', t: 700 });
    m.update({ t: 800, tiltDeg: -25, holster: 'out' });
    m.update({ t: 900, tiltDeg: 60, holster: 'out' });
    m.update({ t: 1000, tiltDeg: 50, holster: 'out' });
    expect(m.state).toBe('draw');
  });

  it('reload round-trip returns to the pose-based state', () => {
    const m = makeMachine();
    settleHolstered(m);
    m.onEvent({ type: 'signal', t: 700 });
    m.update({ t: 800, tiltDeg: -25, holster: 'out' });
    m.update({ t: 900, tiltDeg: 60, holster: 'out' });
    m.enterReload();
    expect(m.state).toBe('reload');
    m.exitReload(60);
    expect(m.state).toBe('aim');
    m.enterReload();
    m.exitReload(0);
    expect(m.state).toBe('draw');
  });

  it('roundEnd → finished, and reset() restarts clean', () => {
    const m = makeMachine();
    settleHolstered(m);
    m.onEvent({ type: 'roundEnd', t: 1000 });
    expect(m.state).toBe('finished');
    m.reset();
    expect(m.state).toBe('notReady');
  });

  it('forceFoul from the engine (guess-fire) works', () => {
    const m = makeMachine();
    settleHolstered(m);
    m.onEvent({ type: 'forceFoul', t: 900 });
    expect(m.state).toBe('foul');
  });
});

describe('HolsterDetector hysteresis + steadiness', () => {
  it('enters the holster only after steadyMs of steady pose', () => {
    const h = new HolsterDetector({ enterDeg: -60, exitDeg: -35, steadyMs: 400, steadyMaxRateDeg: 25 });
    h.update(-70, 0, 0);
    expect(h.holstered).toBe(false); // entering, not yet steady
    h.update(-70, 0, 200);
    expect(h.holstered).toBe(false);
    h.update(-70, 0, 450);
    expect(h.holstered).toBe(true);
  });

  it('wobble below the enter threshold but unsteady restarts the timer', () => {
    const h = new HolsterDetector({ enterDeg: -60, exitDeg: -35, steadyMs: 400, steadyMaxRateDeg: 25 });
    h.update(-70, 0, 0);
    h.update(-70, 100, 200); // fast movement
    h.update(-70, 0, 300);
    h.update(-70, 0, 500); // only 200ms since the wobble — not steady yet
    expect(h.holstered).toBe(false);
    h.update(-70, 0, 750); // 450ms steady since 300
    expect(h.holstered).toBe(true);
  });

  it('hysteresis: stays in until the tilt rises above the exit threshold', () => {
    const h = new HolsterDetector({ enterDeg: -60, exitDeg: -35, steadyMs: 400, steadyMaxRateDeg: 25 });
    h.update(-70, 0, 0);
    h.update(-70, 0, 500);
    expect(h.holstered).toBe(true);
    h.update(-50, 0, 600); // between -60 and -35: hysteresis keeps it in
    expect(h.holstered).toBe(true);
    h.update(-30, 0, 700); // above -35: out
    expect(h.holstered).toBe(false);
    h.update(-50, 0, 800); // back into the dead band: still out
    expect(h.holstered).toBe(false);
  });
});
