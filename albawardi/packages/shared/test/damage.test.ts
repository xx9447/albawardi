import { describe, expect, it } from 'vitest';
import { applySpread, hitTestZone, resolveShot, resolveZoneDamage } from '../src/damage.js';
import { mulberry32 } from '../src/rng.js';
import { REVOLVER } from '../src/weapons.js';

describe('hit zones', () => {
  it('head hit is lethal', () => {
    const zone = hitTestZone({ x: 0, y: 0.62 });
    expect(zone).toBe('head');
    const r = resolveZoneDamage(zone, REVOLVER.damage, REVOLVER.composure);
    expect(r.lethal).toBe(true);
    expect(r.damage).toBe(100);
  });

  it('hat hit does no damage but flies off', () => {
    const zone = hitTestZone({ x: 0, y: 0.715 });
    expect(zone).toBe('hat');
    const r = resolveZoneDamage(zone, REVOLVER.damage, REVOLVER.composure);
    expect(r.damage).toBe(0);
    expect(r.hatOff).toBe(true);
  });

  it('torso = 35 damage', () => {
    const zone = hitTestZone({ x: 0, y: 0.3 });
    expect(zone).toBe('torso');
    expect(resolveZoneDamage(zone, REVOLVER.damage, REVOLVER.composure).damage).toBe(35);
  });

  it('arm = 20 damage + composure (shake + push)', () => {
    for (const [x, y, name] of [
      [-0.13, 0.3, 'armL'],
      [0.13, 0.3, 'armR'],
    ] as const) {
      const zone = hitTestZone({ x, y });
      expect(zone).toBe(name);
      const r = resolveZoneDamage(zone, REVOLVER.damage, REVOLVER.composure);
      expect(r.damage).toBe(20);
      expect(r.composure).toEqual({ shakeMult: 1.5, shakeMs: 2000, pushDeg: 3 });
    }
  });

  it('leg = 20 damage', () => {
    expect(hitTestZone({ x: 0.04, y: -0.3 })).toBe('legR');
    expect(hitTestZone({ x: -0.04, y: -0.3 })).toBe('legL');
    const r = resolveZoneDamage('legL', REVOLVER.damage, REVOLVER.composure);
    expect(r.damage).toBe(20);
  });

  it('off-body = miss with zero damage', () => {
    expect(hitTestZone({ x: 0.8, y: 0 })).toBe('miss');
    const r = resolveZoneDamage('miss', REVOLVER.damage, REVOLVER.composure);
    expect(r.damage).toBe(0);
    expect(r.lethal).toBe(false);
  });
});

describe('applySpread', () => {
  it('zero spread keeps the point fixed', () => {
    const rng = mulberry32(1);
    const p = applySpread({ x: 0.1, y: 0.2 }, 0, 22, 14, rng);
    expect(p).toEqual({ x: 0.1, y: 0.2 });
  });

  it('big hip spread rarely stays exactly on the point', () => {
    const rng = mulberry32(7);
    let moved = 0;
    for (let i = 0; i < 50; i++) {
      const p = applySpread({ x: 0, y: 0 }, 8, 22, 14, rng);
      if (Math.abs(p.x) > 0.05 || Math.abs(p.y) > 0.05) moved++;
    }
    expect(moved).toBeGreaterThan(40);
  });
});

describe('resolveShot end-to-end', () => {
  it('a dead-center aim shot with tight spread usually hits the head', () => {
    const rng = mulberry32(99);
    let head = 0;
    for (let i = 0; i < 20; i++) {
      const r = resolveShot({ x: 0, y: 0.62 }, 0.6, 22, 14, REVOLVER.damage, REVOLVER.composure, rng);
      if (r.zone === 'head') head++;
    }
    // 0.6° sd vs the head circle: roughly 3-in-4 land inside even when jittering.
    expect(head).toBeGreaterThanOrEqual(12);
    expect(head).toBeGreaterThan(
      (() => {
        const rng2 = mulberry32(99);
        let hip = 0;
        for (let i = 0; i < 20; i++) {
          const r = resolveShot({ x: 0, y: 0.62 }, 8, 22, 14, REVOLVER.damage, REVOLVER.composure, rng2);
          if (r.zone === 'head') hip++;
        }
        return hip;
      })(),
    );
  });

  it('a hip shot from the same aim is far less reliable', () => {
    const rng = mulberry32(99);
    let head = 0;
    for (let i = 0; i < 50; i++) {
      const r = resolveShot({ x: 0, y: 0.62 }, 8, 22, 14, REVOLVER.damage, REVOLVER.composure, rng);
      if (r.zone === 'head') head++;
    }
    expect(head).toBeLessThan(25); // 8° sd scatters most shots
  });
});
