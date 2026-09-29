// MouseInput — desktop fallback (doc §3): Space hold = holster, release after
// the signal = draw, pointer-lock aim, left click = fire, wheel = cylinder
// rounds while open, R = toggle the cylinder open/close.

import { tuning } from '../config/tuning.js';
import type { InputSource, InputSourceCallbacks } from './InputSource.js';

const POSE_HOLSTER = -75;
const POSE_AIM = 75;
const RATE = 0;

export class MouseInput implements InputSource {
  readonly mode = 'mouse' as const;

  private cb: InputSourceCallbacks | null = null;
  private spaceDown = false;
  private aim = { x: 0, y: 0 };
  private locked = false;
  private cylinderOpen = false;
  private handlers: Array<{ type: string; fn: EventListener; target: EventTarget }> = [];

  attach(cb: InputSourceCallbacks, el: HTMLElement): void {
    this.detach();
    this.cb = cb;
    const on = (type: string, fn: EventListener, target: EventTarget = window) => {
      target.addEventListener(type, fn);
      this.handlers.push({ type, fn, target });
    };

    on('keydown', ((e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat) return;
      e.preventDefault();
      this.spaceDown = true;
      cb.pose(e.timeStamp, POSE_HOLSTER, RATE);
    }) as EventListener);

    const keyup = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      e.preventDefault();
      if (!this.spaceDown) return;
      this.spaceDown = false;
      cb.pose(e.timeStamp, POSE_AIM, RATE); // release after the signal = draw
    };
    on('keyup', keyup as EventListener);

    // Continuous synthesized pose (like a 10Hz sensor): the holster detector
    // needs a 400ms steadiness window, and draw→aim needs another sample.
    this.poseTimer = setInterval(() => {
      if (!this.cb) return;
      this.cb.pose(performance.now(), this.spaceDown ? POSE_HOLSTER : POSE_AIM, RATE);
    }, 100);

    on('keydown', ((e: KeyboardEvent) => {
      if (e.code === 'KeyR' && !e.repeat) {
        this.cylinderOpen = !this.cylinderOpen;
        if (this.cylinderOpen) cb.reloadOpen(e.timeStamp);
        else cb.reloadClose(e.timeStamp);
      }
    }) as EventListener);

    on('pointerdown', ((e: PointerEvent) => {
      if (e.pointerType === 'touch') return; // touch mode owns touch input
      if ((e.target as HTMLElement).closest('button, .ui-panel')) return;
      // Lock if we can (aim via movement); firing must never depend on it.
      if (!this.locked && el.requestPointerLock) {
        try {
          el.requestPointerLock();
        } catch {
          /* headless/unsupported — still fire */
        }
      }
      if (e.button === 0) cb.fire(e.timeStamp);
    }) as EventListener, el);

    on('pointermove', ((e: PointerEvent) => {
      if (!this.locked || e.pointerType === 'touch') return;
      const dx = e.movementX / 300;
      const dy = e.movementY / 300;
      this.aim.x = clamp(this.aim.x + dx * tuning.sensitivity, -1, 1);
      this.aim.y = clamp(this.aim.y - dy * tuning.sensitivity, -1, 1);
      cb.aim(e.timeStamp, this.aim.x, this.aim.y);
    }) as EventListener, el);

    on('wheel', ((e: WheelEvent) => {
      e.preventDefault();
      if (this.cylinderOpen) cb.reloadRound(e.timeStamp);
    }) as EventListener, el);

    on('pointerlockchange', (() => {
      this.locked = document.pointerLockElement === el;
    }) as EventListener, document);
  }

  detach(): void {
    if (this.poseTimer !== null) {
      clearInterval(this.poseTimer);
      this.poseTimer = null;
    }
    for (const h of this.handlers) h.target.removeEventListener(h.type, h.fn);
    this.handlers = [];
    this.cb = null;
    if (document.pointerLockElement) document.exitPointerLock();
  }

  resetRound(): void {
    this.spaceDown = false;
    this.aim = { x: 0, y: 0 };
    this.cylinderOpen = false;
    this.cb?.aim(performance.now(), 0, 0);
  }

  private poseTimer: ReturnType<typeof setInterval> | null = null;

  getAim(): { x: number; y: number } {
    return this.aim;
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
