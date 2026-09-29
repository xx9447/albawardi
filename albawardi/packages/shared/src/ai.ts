// Computer opponents (design doc §4). Reaction time is a distribution, not a
// fixed number. Phase 1 ships one default opponent + the deliberately weak
// "Limping Kid" used in tests; the other 4 characters arrive in Phase 2.

import type { HitZone } from './damage.js';
import { sampleNormal, type Rng } from './rng.js';

export interface AiParams {
  name: string;
  reactionMeanMs: number;
  reactionSdMs: number;
  /** Probability the shot connects at all. */
  accuracy: number;
  /** Fraction of connecting shots aimed at the head. */
  headProb: number;
  /** AI reaction is clamped here so it never fouls the 100ms guess rule. */
  minReactionMs: number;
}

export const DEFAULT_AI: AiParams = {
  name: 'الغريم',
  reactionMeanMs: 550,
  reactionSdMs: 120,
  accuracy: 0.5,
  headProb: 0.1,
  minReactionMs: 160,
};

/** Deliberately weak teaching opponent (first duel should be a win). */
export const LIMPING_KID: AiParams = {
  name: 'كيد الأعرج',
  reactionMeanMs: 650,
  reactionSdMs: 140,
  accuracy: 0.3,
  headProb: 0.05,
  minReactionMs: 220,
};

export interface AiPlan {
  fireAtMs: number;
  willHit: boolean;
  zone: HitZone;
}

export class AiOpponent {
  constructor(public params: AiParams, private rng: Rng) {}

  /** Decide this round's shot from the moment the signal was displayed. */
  planRound(signalShownAtMs: number): AiPlan {
    const reaction = sampleNormal(
      this.rng,
      this.params.reactionMeanMs,
      this.params.reactionSdMs,
      this.params.minReactionMs,
    );
    const willHit = this.rng() < this.params.accuracy;
    const zone: HitZone = willHit ? (this.rng() < this.params.headProb ? 'head' : 'torso') : 'miss';
    return { fireAtMs: signalShownAtMs + reaction, willHit, zone };
  }
}
