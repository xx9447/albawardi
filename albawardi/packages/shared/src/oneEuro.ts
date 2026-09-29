// One Euro Filter (Casiez et al. 2012) — adaptive low-pass that removes jitter
// when the hand moves slowly and lag when it moves fast. Better than a moving
// average for aiming (per the design doc §3 "التنعيم").

export interface OneEuroParams {
  /** Hz — lower = smoother at rest. */
  minCutoff: number;
  /** Speed coefficient — higher = faster reaction to quick motion. */
  beta: number;
  /** Hz — cutoff for the derivative estimate. */
  dCutoff: number;
}

export const DEFAULT_ONE_EURO: OneEuroParams = { minCutoff: 1.2, beta: 0.05, dCutoff: 1.0 };

export class OneEuroFilter {
  private xPrev: number | null = null;
  private dxPrev = 0;
  private tPrev: number | null = null;

  constructor(private params: OneEuroParams = { ...DEFAULT_ONE_EURO }) {}

  setParams(p: Partial<OneEuroParams>): void {
    this.params = { ...this.params, ...p };
  }

  getParams(): OneEuroParams {
    return { ...this.params };
  }

  private alpha(cutoff: number, dt: number): number {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }

  /** @param t timestamp in ms (e.g. event.timeStamp). */
  filter(x: number, t: number): number {
    if (this.xPrev === null || this.tPrev === null) {
      this.xPrev = x;
      this.tPrev = t;
      this.dxPrev = 0;
      return x;
    }
    const dt = Math.max((t - this.tPrev) / 1000, 1e-4);
    const dx = (x - this.xPrev) / dt;
    const edx = this.alpha(this.params.dCutoff, dt) * dx + (1 - this.alpha(this.params.dCutoff, dt)) * this.dxPrev;
    this.dxPrev = edx;
    const cutoff = this.params.minCutoff + this.params.beta * Math.abs(edx);
    const a = this.alpha(cutoff, dt);
    const xHat = a * x + (1 - a) * this.xPrev;
    this.xPrev = xHat;
    this.tPrev = t;
    return xHat;
  }

  reset(): void {
    this.xPrev = null;
    this.tPrev = null;
    this.dxPrev = 0;
  }
}

/** Two independent One Euro filters (reticle x/y). */
export class OneEuro2D {
  private fx: OneEuroFilter;
  private fy: OneEuroFilter;

  constructor(params: OneEuroParams = { ...DEFAULT_ONE_EURO }) {
    this.fx = new OneEuroFilter(params);
    this.fy = new OneEuroFilter(params);
  }

  setParams(p: Partial<OneEuroParams>): void {
    this.fx.setParams(p);
    this.fy.setParams(p);
  }

  filter(x: number, y: number, t: number): { x: number; y: number } {
    return { x: this.fx.filter(x, t), y: this.fy.filter(y, t) };
  }

  reset(): void {
    this.fx.reset();
    this.fy.reset();
  }
}
