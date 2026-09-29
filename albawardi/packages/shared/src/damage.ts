// Hitscan damage model (design doc §4): hits are instant, zones carry
// different damage, the hat flies off without damage, and the arm hit costs
// "composure" (reticle shake) instead of just health.

import type { Rng } from './rng.js';
import { gaussian } from './rng.js';

/** Normalized aim space: x ∈ [-1,1] (left..right), y ∈ [-1,1] (bottom..top). */
export interface AimPoint {
  x: number;
  y: number;
}

export type HitZone = 'head' | 'hat' | 'torso' | 'armL' | 'armR' | 'legL' | 'legR' | 'miss';

export interface ZoneGeometry {
  head: { cx: number; cy: number; r: number };
  hat: { cx: number; cy: number; r: number };
  torso: { x0: number; x1: number; y0: number; y1: number };
  armL: { x0: number; x1: number; y0: number; y1: number };
  armR: { x0: number; x1: number; y0: number; y1: number };
  legL: { x0: number; x1: number; y0: number; y1: number };
  legR: { x0: number; x1: number; y0: number; y1: number };
}

/** The static opponent's zones in normalized aim coordinates (Phase 1). */
export const OPPONENT_ZONES: ZoneGeometry = {
  head: { cx: 0, cy: 0.62, r: 0.052 },
  hat: { cx: 0, cy: 0.715, r: 0.048 },
  torso: { x0: -0.1, x1: 0.1, y0: 0.1, y1: 0.58 },
  armL: { x0: -0.165, x1: -0.1, y0: 0.12, y1: 0.52 },
  armR: { x0: 0.1, x1: 0.165, y0: 0.12, y1: 0.52 },
  legL: { x0: -0.075, x1: -0.012, y0: -0.6, y1: 0.1 },
  legR: { x0: 0.012, x1: 0.075, y0: -0.6, y1: 0.1 },
};

export function hitTestZone(p: AimPoint, g: ZoneGeometry = OPPONENT_ZONES): HitZone {
  // hat above head first (a shot between them is the neck → torso region).
  const inCircle = (c: { cx: number; cy: number; r: number }) =>
    (p.x - c.cx) ** 2 + (p.y - c.cy) ** 2 <= c.r ** 2;
  const inRect = (r: { x0: number; x1: number; y0: number; y1: number }) =>
    p.x >= r.x0 && p.x <= r.x1 && p.y >= r.y0 && p.y <= r.y1;
  if (inCircle(g.hat)) return 'hat';
  if (inCircle(g.head)) return 'head';
  if (inRect(g.torso)) return 'torso';
  if (inRect(g.armL)) return 'armL';
  if (inRect(g.armR)) return 'armR';
  if (inRect(g.legL)) return 'legL';
  if (inRect(g.legR)) return 'legR';
  return 'miss';
}

export interface ZoneDamage {
  head: number;
  torso: number;
  arm: number;
  leg: number;
  hat: number;
}

export interface ComposureEffects {
  /** Extra reticle shake multiplier when hit in the arm. */
  armShakeMult: number;
  armShakeMs: number;
  /** Any hit pushes the reticle this many degrees away. */
  hitPushDeg: number;
}

export interface DamageResult {
  zone: HitZone;
  damage: number;
  lethal: boolean;
  hatOff: boolean;
  composure: { shakeMult: number; shakeMs: number; pushDeg: number } | null;
}

export function resolveZoneDamage(
  zone: HitZone,
  dmg: ZoneDamage,
  composure: ComposureEffects,
): DamageResult {
  switch (zone) {
    case 'head':
      return { zone, damage: dmg.head, lethal: true, hatOff: false, composure: null };
    case 'torso':
      return { zone, damage: dmg.torso, lethal: false, hatOff: false, composure: null };
    case 'armL':
    case 'armR':
      return {
        zone,
        damage: dmg.arm,
        lethal: false,
        hatOff: false,
        composure: { shakeMult: composure.armShakeMult, shakeMs: composure.armShakeMs, pushDeg: composure.hitPushDeg },
      };
    case 'legL':
    case 'legR':
      return { zone, damage: dmg.leg, lethal: false, hatOff: false, composure: null };
    case 'hat':
      return { zone, damage: dmg.hat, lethal: false, hatOff: true, composure: null };
    default:
      return { zone: 'miss', damage: 0, lethal: false, hatOff: false, composure: null };
  }
}

/**
 * Apply random spread to an aim point. `spreadDeg` is the sd of the offset in
 * degrees; converted to normalized units through the play ranges (±22° x, ±14° y).
 */
export function applySpread(
  aim: AimPoint,
  spreadDeg: number,
  playRangeXDeg: number,
  playRangeYDeg: number,
  rng: Rng,
): AimPoint {
  if (spreadDeg <= 0) return { ...aim };
  const dx = (gaussian(rng) * spreadDeg) / playRangeXDeg; // deg → normalized
  const dy = (gaussian(rng) * spreadDeg) / playRangeYDeg;
  return { x: aim.x + dx, y: aim.y + dy };
}

/** Resolve a full shot: spread → zone test → damage. */
export function resolveShot(
  aim: AimPoint,
  spreadDeg: number,
  playRangeXDeg: number,
  playRangeYDeg: number,
  dmg: ZoneDamage,
  composure: ComposureEffects,
  rng: Rng,
): DamageResult {
  const p = applySpread(aim, spreadDeg, playRangeXDeg, playRangeYDeg, rng);
  const zone = hitTestZone(p);
  return resolveZoneDamage(zone, dmg, composure);
}
