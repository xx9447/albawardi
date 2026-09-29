// Weapon definitions (design doc §4). Phase 1 ships the revolver only —
// the other two stay out per the "no features beyond the current phase" rule.

import type { ComposureEffects, ZoneDamage } from './damage.js';

export type ReloadGesture = 'revolverRoll';

export interface RevolverReloadSpec {
  kind: 'revolverRoll';
  /** Integrated wrist-roll (deg) to swing the cylinder open (roll left). */
  openRollDeg: number;
  /** Integrated wrist-roll (deg) back to snap it closed (roll right). */
  closeRollDeg: number;
  /** The roll flick must complete within this window to avoid screen rotation. */
  gestureMaxMs: number;
}

export interface WeaponDef {
  id: 'revolver';
  name: string;
  nameEn: string;
  ammo: number;
  minFireIntervalMs: number;
  /** Random spread sd in degrees when in the aim pose. */
  spreadAimDeg: number;
  /** Spread sd when firing from the draw (hip shot) — big, rewards risk. */
  spreadHipDeg: number;
  reload: RevolverReloadSpec;
  damage: ZoneDamage;
  composure: ComposureEffects;
}

export const REVOLVER: WeaponDef = {
  id: 'revolver',
  name: 'المسدس الدوّار',
  nameEn: 'Revolver',
  ammo: 6,
  minFireIntervalMs: 350,
  spreadAimDeg: 0.6,
  spreadHipDeg: 8,
  reload: { kind: 'revolverRoll', openRollDeg: -45, closeRollDeg: 45, gestureMaxMs: 250 },
  damage: { head: 100, torso: 35, arm: 20, leg: 20, hat: 0 },
  composure: { armShakeMult: 1.5, armShakeMs: 2000, hitPushDeg: 3 },
};
