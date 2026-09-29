// Holster detection with hysteresis + steadiness (design doc §3):
//   enter holster when tilt < enterDeg (60° below horizon),
//   leave when tilt rises above exitDeg (35° below horizon),
//   and the phone must be steady (low rotation rate) for steadyMs to count.

export interface HolsterParams {
  enterDeg: number; // e.g. -60
  exitDeg: number; // e.g. -35
  steadyMs: number; // e.g. 400
  steadyMaxRateDeg: number; // |pitch rate| below this counts as steady
}

export const DEFAULT_HOLSTER: HolsterParams = {
  enterDeg: -60,
  exitDeg: -35,
  steadyMs: 400,
  steadyMaxRateDeg: 25,
};

export type HolsterState = 'out' | 'entering' | 'in';

export class HolsterDetector {
  private state: HolsterState = 'out';
  private steadySince: number | null = null;

  constructor(private params: HolsterParams = { ...DEFAULT_HOLSTER }) {}

  setParams(p: Partial<HolsterParams>): void {
    this.params = { ...this.params, ...p };
  }

  getParams(): HolsterParams {
    return { ...this.params };
  }

  /** @param tiltDeg fused pitch in degrees. @param rateDeg pitch rate deg/s. */
  update(tiltDeg: number, rateDeg: number, t: number): HolsterState {
    const steady = Math.abs(rateDeg) <= this.params.steadyMaxRateDeg;
    switch (this.state) {
      case 'out':
        if (tiltDeg < this.params.enterDeg) {
          this.state = 'entering';
          this.steadySince = steady ? t : null;
        }
        break;
      case 'entering':
        if (tiltDeg >= this.params.enterDeg) {
          this.state = 'out';
          this.steadySince = null;
        } else if (!steady) {
          this.steadySince = null;
        } else if (this.steadySince === null) {
          this.steadySince = t;
        } else if (t - this.steadySince >= this.params.steadyMs) {
          this.state = 'in';
        }
        break;
      case 'in':
        if (tiltDeg > this.params.exitDeg) {
          this.state = 'out';
          this.steadySince = null;
        }
        break;
    }
    return this.state;
  }

  get holstered(): boolean {
    return this.state === 'in';
  }

  reset(): void {
    this.state = 'out';
    this.steadySince = null;
  }
}
