// Sensor fusion for aiming (design doc §3):
//  - Vertical tilt (pitch) comes from the gravity vector (stable, no drift),
//    fused with the gyro pitch rate via a complementary filter.
//  - Horizontal rotation (yaw) is integrated from the gyro rate, relative to
//    the moment of the draw (short duels make the tiny drift irrelevant).
//  - alpha/beta/gamma Euler angles are NEVER used for aiming (gimbal lock at
//    the vertical aiming pose).

export interface FusionParams {
  /** Weight on the gyro between gravity corrections (per step, 0..1). */
  gyroWeight: number;
}

export const DEFAULT_FUSION: FusionParams = { gyroWeight: 0.94 };

/**
 * Pitch (tilt) fusion. `gravityPitchDeg` is the pitch angle in degrees derived
 * from the low-pass-filtered gravity vector (e.g. via tiltFromGravity);
 * `pitchRateDeg` is rotationRate around the phone x-axis (deg/s).
 */
export class TiltFusion {
  private angle: number | null = null;
  private tPrev: number | null = null;
  private readonly w: number;

  constructor(params: FusionParams = { ...DEFAULT_FUSION }) {
    this.w = params.gyroWeight;
  }

  reset(gravityPitchDeg: number | null = null): void {
    this.angle = gravityPitchDeg;
    this.tPrev = null;
  }

  /** @param t timestamp in ms. Returns the fused pitch in degrees. */
  step(gravityPitchDeg: number, pitchRateDeg: number, t: number): number {
    if (this.angle === null) {
      this.angle = gravityPitchDeg;
      this.tPrev = t;
      return gravityPitchDeg;
    }
    const dt = this.tPrev === null ? 1 / 60 : Math.max((t - this.tPrev) / 1000, 1e-4);
    this.tPrev = t;
    const predicted = this.angle + pitchRateDeg * dt;
    this.angle = this.w * predicted + (1 - this.w) * gravityPitchDeg;
    return this.angle;
  }

  get value(): number | null {
    return this.angle;
  }
}

/**
 * Gyro integrator with an optional running bias estimate (collected while the
 * phone is holstered/steady) — cheap drift compensation for yaw and wrist roll.
 */
export class GyroIntegrator {
  private angle = 0;
  private tPrev: number | null = null;
  private bias = 0;
  private biasSum = 0;
  private biasCount = 0;

  constructor(private params: { biasWindowMs?: number } = {}) {}

  /** Feed samples while the device is steady to estimate sensor bias. */
  calibrate(rateDeg: number, t: number): void {
    const win = this.params.biasWindowMs ?? 400;
    if (this.tPrev !== null && t - this.tPrev > 10 * win) return; // stale gap
    this.biasSum += rateDeg;
    this.biasCount++;
    this.bias = this.biasSum / this.biasCount;
  }

  step(rateDeg: number, t: number): number {
    if (this.tPrev === null) {
      this.tPrev = t;
      return this.angle;
    }
    const dt = Math.max((t - this.tPrev) / 1000, 1e-4);
    this.tPrev = t;
    this.angle += (rateDeg - this.bias) * dt;
    return this.angle;
  }

  /** Angle in degrees since the last reset (positive = the configured sign). */
  get value(): number {
    return this.angle;
  }

  reset(): void {
    this.angle = 0;
    this.tPrev = null;
    this.biasSum = 0;
    this.biasCount = 0;
    this.bias = 0;
  }
}

/**
 * Tilt (pitch) in degrees from a gravity reading, sign-normalized so that:
 *   phone vertical, top up, screen facing the player  ≈ +90
 *   phone flat on a table, screen up                  ≈ 0
 *   phone hanging top-down (holster)                  ≈ -90
 * `ySign` (+1/-1) calibrates the browser's gravity-axis convention
 * (Android/Chrome reports +g on the axis, older iOS the opposite).
 */
export function tiltFromGravity(ax: number, ay: number, az: number, ySign: number, gravity = 9.81): number {
  const g = Math.hypot(ax, ay, az);
  const gRef = g > 1 ? g : gravity;
  const y = (ay * ySign) / gRef;
  // asin of the normalized up-axis component: vertical top-up → +90°,
  // flat on a table → 0°, hanging top-down (holster) → -90°.
  return (Math.asin(Math.max(-1, Math.min(1, y))) * 180) / Math.PI;
}
