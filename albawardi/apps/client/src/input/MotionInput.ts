// MotionInput — the phone IS the gun (design doc §3):
//   tilt: gravity (low-passed) fused with gyro via a complementary filter
//   yaw : integrated rotationRate, reset at the draw crossing
//   aim : offsets from the vertical reference, One Euro filtered
//   reload : wrist roll (rotationRate.alpha integration, quick flicks)
// Never uses alpha/beta/gamma Euler angles for aiming (gimbal lock).

import {
  GyroIntegrator,
  OneEuro2D,
  TiltFusion,
  tiltFromGravity,
} from '@albawardi/shared';
import { tuning } from '../config/tuning.js';
import type { InputSource, InputSourceCallbacks } from './InputSource.js';

export class MotionInput implements InputSource {
  readonly mode = 'motion' as const;

  private cb: InputSourceCallbacks | null = null;
  private fusion = new TiltFusion({ ...tuning.fusion });
  private yaw = new GyroIntegrator();
  private roll = new GyroIntegrator();
  private gLp = new OneEuro2D({ minCutoff: tuning.gravityLp.minCutoff, beta: tuning.gravityLp.beta, dCutoff: 1 });
  private reticle = new OneEuro2D({ ...tuning.oneEuro });
  private lastAim = { x: 0, y: 0 };
  private wasHolstered = false;
  private cylinderOpen = false;
  private eventsSeen = 0;
  private onDevicemotion: ((ev: DeviceMotionEvent) => void) | null = null;

  /** Have we received real sensor events? (fallback decision) */
  get alive(): boolean {
    return this.eventsSeen > 0;
  }

  attach(cb: InputSourceCallbacks, _el: HTMLElement): void {
    this.detach(); // drop any probe listener first
    this.cb = cb;
    this.onDevicemotion = (ev: DeviceMotionEvent) => this.sample(ev);
    window.addEventListener('devicemotion', this.onDevicemotion as EventListener);
  }

  detach(): void {
    if (this.onDevicemotion) window.removeEventListener('devicemotion', this.onDevicemotion as EventListener);
    this.onDevicemotion = null;
    this.cb = null;
  }

  resetRound(): void {
    this.yaw.reset();
    this.roll.reset();
    this.reticle.reset();
    this.wasHolstered = false;
    this.cylinderOpen = false;
    this.fusion.reset();
  }

  /** Start listening without a round (used for the "is it alive?" probe). */
  probe(): void {
    if (!this.onDevicemotion) {
      this.onDevicemotion = () => {
        this.eventsSeen++;
      };
      window.addEventListener('devicemotion', this.onDevicemotion as EventListener);
    }
  }

  private hzTimes: number[] = [];
  get hz(): number {
    const cutoff = performance.now() - 1000;
    while (this.hzTimes.length && this.hzTimes[0] < cutoff) this.hzTimes.shift();
    return this.hzTimes.length;
  }

  private sample(ev: DeviceMotionEvent): void {
    const cb = this.cb;
    if (!cb) return;
    this.eventsSeen++;
    this.hzTimes.push(performance.now());
    const g = ev.accelerationIncludingGravity;
    const r = ev.rotationRate;
    if (!g || g.x === null || g.y === null || g.z === null) return;
    const t = ev.timeStamp;

    // 1. gravity low-pass (x and z filtered; y kept raw for the tilt calc)
    const gf = this.gLp.filter(g.x, g.z, t);
    const gTilt = tiltFromGravity(gf.x, g.y, gf.y, tuning.ySign);
    const pitchRate = r?.beta ?? 0;
    const tilt = this.fusion.step(gTilt, pitchRate, t);

    // 2. yaw + roll integration
    const yawRate = r?.gamma ?? 0;
    const yawDeg = this.yaw.step(yawRate, t);
    const rollRate = r?.alpha ?? 0;
    const rollDeg = this.roll.step(rollRate, t);

    // 3. wrist-roll reload gesture (quick flicks, ±45°)
    this.detectRoll(rollDeg, t);

    // 4. reticle from the aim reference
    const nx = clamp((yawDeg * tuning.sensitivity) / tuning.aimRangeXDeg, -1, 1);
    const ny = clamp(((tilt - 90) * tuning.sensitivity) / tuning.aimRangeYDeg, -1, 1);
    const f = this.reticle.filter(nx, ny, t);
    this.lastAim = f;
    cb.aim(t, f.x, f.y);

    // 5. pose for the state machine
    cb.pose(t, tilt, pitchRate);

    // 6. yaw is relative to the draw moment: reset when the phone settles low
    if (tilt < tuning.holster.enterDeg) {
      if (!this.wasHolstered) {
        this.wasHolstered = true;
        this.yaw.reset(); // reference = holster pose
      }
      this.yaw.calibrate(yawRate, t);
    } else {
      this.wasHolstered = false;
    }
  }

  private detectRoll(rollDeg: number, t: number): void {
    const cb = this.cb;
    if (!cb) return;
    const spec = { open: -45, close: 45 };
    if (!this.cylinderOpen && rollDeg < spec.open) {
      this.cylinderOpen = true;
      this.roll.reset();
      cb.reloadOpen(t);
    } else if (this.cylinderOpen && rollDeg > spec.close) {
      this.cylinderOpen = false;
      this.roll.reset();
      cb.reloadClose(t);
    }
  }

  getAim(): { x: number; y: number } {
    return this.lastAim;
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
