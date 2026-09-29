// TouchInput — the fallback when sensors are unavailable (doc §3):
//   thumb on the holster button = holstered (synthesized pose)
//   lift after the signal = draw (pose jumps to the aim angle)
//   drag = relative reticle movement
//   second-finger tap = fire (chosen default; open decision #3)
//   swipe down = open cylinder · tap while open = load round · swipe up = close

import { tuning } from '../config/tuning.js';
import type { InputSource, InputSourceCallbacks } from './InputSource.js';

const POSE_HOLSTER = -75; // synthesized tilt while the thumb rests on the button
const POSE_AIM = 75; // synthesized tilt once the thumb lifts
const RATE = 0;

export class TouchInput implements InputSource {
  readonly mode = 'touch' as const;

  private cb: InputSourceCallbacks | null = null;
  private thumbDown = false;
  private drawn = false; // thumb lifted after the signal
  private aim = { x: 0, y: 0 };
  private dragId: number | null = null;
  private lastDrag: { x: number; y: number } | null = null;
  private swipeStart: { x: number; y: number; t: number } | null = null;
  private cylinderOpen = false;
  private handlers: Array<{ type: string; fn: EventListener; target: HTMLElement }> = [];

  attach(cb: InputSourceCallbacks, el: HTMLElement): void {
    this.detach();
    this.cb = cb;
    const on = (type: string, fn: EventListener) => {
      el.addEventListener(type, fn, { passive: false } as AddEventListenerOptions);
      this.handlers.push({ type, fn, target: el });
    };
    // Continuous synthesized pose (10Hz): steadiness window + draw→aim.
    this.ticker = setInterval(() => {
      if (!this.cb) return;
      if (this.thumbDown && !this.drawn) this.cb.pose(performance.now(), POSE_HOLSTER, RATE);
      else if (this.drawn) this.cb.pose(performance.now(), POSE_AIM, RATE);
    }, 100);
    const po = (e: PointerEvent) => this.onPointer(e);
    on('pointerdown', po as EventListener);
    on('pointermove', po as EventListener);
    on('pointerup', po as EventListener);
    on('pointercancel', po as EventListener);
  }

  detach(): void {
    if (this.ticker !== null) {
      clearInterval(this.ticker);
      this.ticker = null;
    }
    for (const h of this.handlers) h.target.removeEventListener(h.type, h.fn);
    this.handlers = [];
    this.cb = null;
  }

  resetRound(): void {
    this.thumbDown = false;
    this.drawn = false;
    this.dragId = null;
    this.lastDrag = null;
    this.swipeStart = null;
    this.cylinderOpen = false;
    this.aim = { x: 0, y: 0 };
  }

  /** The UI asks: is the thumb on the holster button? (bottom 18% strip) */
  private inHolsterZone(y: number): boolean {
    return y > window.innerHeight * 0.82;
  }

  private onPointer(e: PointerEvent): void {
    const cb = this.cb;
    if (!cb) return;
    const t = e.timeStamp;
    e.preventDefault();

    // Palm rejection (doc §3): ignore giant or simultaneous palm touches.
    const touch = e as PointerEvent & { width?: number; height?: number };
    if ((touch.width ?? 0) > window.innerWidth * 0.5 || (touch.height ?? 0) > window.innerHeight * 0.5) {
      return;
    }

    if (e.type === 'pointerdown') {
      if (!this.drawn && this.inHolsterZone(e.clientY)) {
        // thumb settles into the holster (ticker keeps the pose flowing)
        if (!this.thumbDown) {
          this.thumbDown = true;
          this.emitHolsterPose(t);
        }
        return;
      }
      if (this.thumbDown && !this.drawn) {
        // thumb lifted? No — a second finger while still holstered = nothing (touch disabled)
        return;
      }
      if (this.drawn) {
        if (this.cylinderOpen) {
          // tap while cylinder open = load one round
          cb.reloadRound(t);
          return;
        }
        if (this.dragId === null) {
          // second finger (or first after draw) = fire
          cb.fire(t);
          return;
        }
      }
      // start a drag (aim movement)
      if (this.dragId === null && !this.cylinderOpen) {
        this.dragId = e.pointerId;
        this.lastDrag = { x: e.clientX, y: e.clientY };
        this.swipeStart = { x: e.clientX, y: e.clientY, t };
      }
      return;
    }

    if (e.type === 'pointermove') {
      if (this.dragId === e.pointerId && this.lastDrag) {
        const dx = (e.clientX - this.lastDrag.x) / window.innerWidth;
        const dy = (e.clientY - this.lastDrag.y) / window.innerHeight;
        this.lastDrag = { x: e.clientX, y: e.clientY };
        this.aim.x = clamp(this.aim.x + dx * 2.5 * tuning.sensitivity, -1, 1);
        this.aim.y = clamp(this.aim.y - dy * 2.5 * tuning.sensitivity, -1, 1);
        cb.aim(t, this.aim.x, this.aim.y);
      }
      return;
    }

    if (e.type === 'pointerup' || e.type === 'pointercancel') {
      if (this.dragId === e.pointerId) {
        this.dragId = null;
        this.lastDrag = null;
        // swipe detection (reload gestures)
        if (this.swipeStart) {
          const dt = t - this.swipeStart.t;
          const dy = e.clientY - this.swipeStart.y;
          if (dt < 300 && Math.abs(dy) > 70) {
            if (dy > 0 && !this.cylinderOpen) {
              this.cylinderOpen = true;
              cb.reloadOpen(t);
            } else if (dy < 0 && this.cylinderOpen) {
              this.cylinderOpen = false;
              cb.reloadClose(t);
            }
          }
          this.swipeStart = null;
        }
        return;
      }
      if (this.thumbDown && !this.drawn && this.inHolsterZone(e.clientY)) {
        // thumb lifted = draw
        this.thumbDown = false;
        this.drawn = true;
        cb.pose(t, POSE_AIM, RATE);
        cb.aim(t, this.aim.x, this.aim.y);
        return;
      }
    }
  }

  /** Continuous pose ticker (set in attach, cleared in detach). */
  private ticker: ReturnType<typeof setInterval> | null = null;

  private emitHolsterPose(t: number): void {
    this.cb?.pose(t, POSE_HOLSTER, RATE);
  }

  getAim(): { x: number; y: number } {
    return this.aim;
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
