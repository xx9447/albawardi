// Deterministic seedable RNG (mulberry32) + gaussian sampling — used by tests
// and by the AI opponent so rounds are reproducible from a seed.

export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard normal via Box–Muller. */
export function gaussian(rng: Rng): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Sample from N(mean, sd), clamped to [min, max]. */
export function sampleNormal(
  rng: Rng,
  mean: number,
  sd: number,
  min = -Infinity,
  max = Infinity,
): number {
  const x = mean + gaussian(rng) * sd;
  return Math.min(max, Math.max(min, x));
}
