import { describe, expect, it } from 'vitest';
import { AiOpponent, DEFAULT_AI, LIMPING_KID } from '../src/ai.js';
import { mulberry32 } from '../src/rng.js';

describe('AiOpponent', () => {
  it('reaction time is a distribution around the mean, never below the floor', () => {
    const ai = new AiOpponent(DEFAULT_AI, mulberry32(3));
    const samples: number[] = [];
    for (let i = 0; i < 500; i++) {
      const plan = ai.planRound(1000);
      samples.push(plan.fireAtMs - 1000);
      expect(plan.fireAtMs).toBeGreaterThanOrEqual(1000 + DEFAULT_AI.minReactionMs);
    }
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    // The sample mean lands near 550ms (± a healthy margin).
    expect(mean).toBeGreaterThan(450);
    expect(mean).toBeLessThan(650);
    // And there is real variance — it is not one fixed number.
    const min = Math.min(...samples);
    const max = Math.max(...samples);
    expect(max - min).toBeGreaterThan(100);
  });

  it('the Limping Kid is slower and less accurate than the default opponent', () => {
    const kid = new AiOpponent(LIMPING_KID, mulberry32(5));
    const def = new AiOpponent(DEFAULT_AI, mulberry32(5));
    const kidMean =
      Array.from({ length: 300 }, () => kid.planRound(0).fireAtMs).reduce((a, b) => a + b, 0) / 300;
    const defMean =
      Array.from({ length: 300 }, () => def.planRound(0).fireAtMs).reduce((a, b) => a + b, 0) / 300;
    expect(kidMean).toBeGreaterThan(defMean);
    expect(LIMPING_KID.accuracy).toBeLessThan(DEFAULT_AI.accuracy);
  });

  it('accuracy sampling produces both hits and misses over many rounds', () => {
    const ai = new AiOpponent(DEFAULT_AI, mulberry32(11));
    let hits = 0;
    const N = 1000;
    for (let i = 0; i < N; i++) if (ai.planRound(0).willHit) hits++;
    expect(hits).toBeGreaterThan(N * 0.3);
    expect(hits).toBeLessThan(N * 0.7);
  });
});
