import { describe, expect, it } from 'vitest';
import { OneEuro2D, OneEuroFilter } from '../src/oneEuro.js';

describe('OneEuroFilter', () => {
  it('passes the first value through unchanged', () => {
    const f = new OneEuroFilter();
    expect(f.filter(5, 100)).toBe(5);
  });

  it('smooths a noisy constant signal toward the true value', () => {
    const f = new OneEuroFilter({ minCutoff: 0.5, beta: 0.02, dCutoff: 1 });
    let t = 0;
    const values: number[] = [];
    for (let i = 0; i < 600; i++) {
      t += 1000 / 60;
      const noise = (i % 2 === 0 ? 1 : -1) * 0.5;
      values.push(f.filter(10 + noise, t));
    }
    const last10 = values.slice(-10);
    const mean = last10.reduce((a, b) => a + b, 0) / 10;
    expect(Math.abs(mean - 10)).toBeLessThan(0.2);
    // And the output is far less jittery than the input.
    let maxDelta = 0;
    for (let i = 1; i < values.length; i++) maxDelta = Math.max(maxDelta, Math.abs(values[i] - values[i - 1]));
    expect(maxDelta).toBeLessThan(0.5); // input jumps are 1.0
  });

  it('tracks a fast ramp quickly with high beta', () => {
    const f = new OneEuroFilter({ minCutoff: 1, beta: 1, dCutoff: 1 });
    let t = 0;
    let last = f.filter(0, t);
    for (let i = 1; i <= 120; i++) {
      t += 1000 / 60;
      last = f.filter(i, t); // ramp 60 units/s
    }
    expect(last).toBeGreaterThan(100); // close to the current value 120
  });

  it('reset() forgets state', () => {
    const f = new OneEuroFilter();
    f.filter(10, 100);
    f.filter(12, 200);
    f.reset();
    expect(f.filter(-5, 300)).toBe(-5);
  });
});

describe('OneEuro2D', () => {
  it('filters x and y independently', () => {
    const f = new OneEuro2D();
    const r1 = f.filter(1, 2, 100);
    expect(r1).toEqual({ x: 1, y: 2 });
    const r2 = f.filter(3, 4, 200);
    expect(r2.x).not.toBe(3); // smoothed
    expect(r2.y).not.toBe(4);
  });
});
