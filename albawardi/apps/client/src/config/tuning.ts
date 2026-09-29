// THE single tuning file (task rule 3): every adjustable number lives here.
// Phase 1 defaults come from the design doc; the hidden panel edits these live.

import {
  DEFAULT_AI,
  DEFAULT_FUSION,
  DEFAULT_HOLSTER,
  DEFAULT_INPUT_MACHINE,
  DEFAULT_ONE_EURO,
  DEFAULT_ROUND,
  type AiParams,
  type FusionParams,
  type HolsterParams,
  type InputMachineParams,
  type OneEuroParams,
  type RoundParams,
} from '@albawardi/shared';

export interface Tuning {
  // --- aim pipeline ---
  sensitivity: number; // 1° = 2.2% of screen width at 1.0
  aimRangeXDeg: number; // ±22° horizontal play range
  aimRangeYDeg: number; // ±14° vertical
  ySign: 1 | -1; // gravity axis convention (calibrated in Phase 2)
  oneEuro: OneEuroParams;
  fusion: FusionParams;
  gravityLp: { minCutoff: number; beta: number };

  // --- state machine / holster ---
  machine: InputMachineParams;
  holster: HolsterParams;

  // --- round rules ---
  round: RoundParams;

  // --- opponent ---
  ai: AiParams;

  // --- weapon spread (Phase-1 revolver numbers from the doc §4) ---
  weapon: { spreadAimDeg: number; spreadHipDeg: number };

  // --- presentation ---
  coinTossMs: number; // mirrored from round.coinTossMs for the animator
  slowMoFactor: number;
  slowMoMs: number;
  recoilShakePx: number;
  autoNextRoundMs: number; // result screen auto-continues after this
  showDebug: boolean; // Hz + draw time overlay
  touchFire: 'secondFinger' | 'thumbLift'; // open decision #3 (doc §10)
}

export const tuning: Tuning = {
  sensitivity: 1.0,
  aimRangeXDeg: 22,
  aimRangeYDeg: 14,
  ySign: 1,
  oneEuro: { ...DEFAULT_ONE_EURO },
  fusion: { ...DEFAULT_FUSION },
  gravityLp: { minCutoff: 0.15, beta: 0.005 },

  machine: { ...DEFAULT_INPUT_MACHINE },
  holster: { ...DEFAULT_HOLSTER },

  round: { ...DEFAULT_ROUND },

  ai: { ...DEFAULT_AI, name: 'الغريم' },

  weapon: { spreadAimDeg: 0.6, spreadHipDeg: 8 },

  coinTossMs: 800,
  slowMoFactor: 0.3,
  slowMoMs: 1400,
  recoilShakePx: 6,
  autoNextRoundMs: 2500,
  showDebug: false,
  touchFire: 'secondFinger',
};
