import { describe, expect, it } from 'vitest';
import { GyroIntegrator, tiltFromGravity, TiltFusion } from '../src/fusion.js';

describe('tiltFromGravity', () => {
  it('vertical top-up (aim pose) → +90°', () => {
    expect(tiltFromGravity(0, 9.81, 0, 1)).toBeCloseTo(90, 0);
  });

  it('hanging top-down (holster pose) → -90°', () => {
    expect(tiltFromGravity(0, -9.81, 0, 1)).toBeCloseTo(-90, 0);
  });

  it('flat on a table → 0°', () => {
    expect(tiltFromGravity(0, 0, 9.81, 1)).toBeCloseTo(0, 0);
  });

  it('ySign flips the convention for browsers reporting inverted gravity', () => {
    expect(tiltFromGravity(0, -9.81, 0, -1)).toBeCloseTo(90, 0);
  });

  it('45° tilt is between the poses', () => {
    // gravity split between +y and +z at 45°: ay = g*sin(45)
    const ay = 9.81 * Math.SQRT1_2;
    const tilt = tiltFromGravity(0, ay, ay, 1);
    expect(tilt).toBeCloseTo(45, 0);
  });
});

describe('TiltFusion', () => {
  it('tracks a real rotation (gravity follows truth) with little lag', () => {
    const f = new TiltFusion({ gyroWeight: 0.94 });
    f.reset(0);
    let t = 0;
    let angle = 0;
    for (let i = 1; i <= 60; i++) {
      t += 1000 / 60;
      const trueAngle = i * 1.5; // rotating 90°/s: gravity reading tracks truth
      angle = f.step(trueAngle, 90, t);
    }
    // True angle after 1s = 90°. The filter may lag a bit but must be close.
    expect(angle).toBeGreaterThan(80);
    expect(angle).toBeLessThan(95);
  });

  it('converges to gravity when the gyro is silent', () => {
    const f = new TiltFusion({ gyroWeight: 0.9 });
    f.reset(0);
    let t = 0;
    let angle = 0;
    for (let i = 0; i < 600; i++) {
      t += 1000 / 60;
      angle = f.step(42, 0, t);
    }
    expect(angle).toBeCloseTo(42, 0);
  });
});

describe('GyroIntegrator', () => {
  it('integrates rate to angle', () => {
    const g = new GyroIntegrator();
    let t = 0;
    for (let i = 0; i < 60; i++) {
      t += 1000 / 60;
      g.step(60, t); // 60 deg/s
    }
    // 1s × 60°/s = 60° (the first sample only anchors the clock → ~1 step less).
    expect(g.value).toBeGreaterThan(58);
    expect(g.value).toBeLessThan(60);
  });

  it('subtracts the estimated bias', () => {
    const g = new GyroIntegrator();
    let t = 0;
    for (let i = 0; i < 100; i++) {
      t += 5;
      g.calibrate(2, t); // sensor reports a constant +2 deg/s bias while steady
    }
    for (let i = 0; i < 60; i++) {
      t += 1000 / 60;
      g.step(2, t); // still steady — the sensor keeps reporting its bias
    }
    // With the bias learned and subtracted, 1s of "2 deg/s" integrates to ~0.
    expect(Math.abs(g.value)).toBeLessThan(0.05);
  });

  it('reset() clears angle and bias', () => {
    const g = new GyroIntegrator();
    g.step(100, 0);
    g.step(100, 16);
    g.reset();
    expect(g.value).toBe(0);
  });
});
