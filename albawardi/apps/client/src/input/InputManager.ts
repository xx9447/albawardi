// InputManager — owns the active source and bridges it to the RoundEngine.
// Motion is preferred; touch is the phone fallback; mouse on desktop.
// Every event is timestamped with event.timeStamp and pushed to the engine's
// ordered timeline, so judging is by event time, never frame order.

import type { AimPoint } from '@albawardi/shared';
import type { RoundEngine, RoundInputEvent } from '@albawardi/shared';
import { tuning } from '../config/tuning.js';
import type { InputMode, InputSourceCallbacks } from './InputSource.js';
import { MotionInput } from './MotionInput.js';
import { MouseInput } from './MouseInput.js';
import { TouchInput } from './TouchInput.js';

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export class InputManager {
  motion = new MotionInput();
  touch = new TouchInput();
  mouse = new MouseInput();

  private engine: RoundEngine | null = null;
  private active: 'motion' | 'touch' | 'mouse' = 'motion';
  private lastAim: AimPoint = { x: 0, y: 0 };
  private fallBackReason = '';
  // composure: an arm hit pushes and shakes the reticle (doc §4)
  private composureUntil = 0;
  private composurePush: AimPoint = { x: 0, y: 0 };

  get mode(): InputMode {
    return this.active;
  }

  get fallbackReason(): string {
    return this.fallBackReason;
  }

  get motionHz(): number {
    return this.motion.hz;
  }

  attach(el: HTMLElement): void {
    const cb: InputSourceCallbacks = {
      pose: (t, tiltDeg, rateDeg) => this.pushEngine({ type: 'pose', t, tiltDeg, rateDeg }),
      aim: (_t, x, y) => {
        const now = performance.now();
        if (now < this.composureUntil) {
          // arm-hit: reticle pushed away + 50% extra shake for the duration
          const shake = 0.02 * 1.5;
          x = clamp(x + this.composurePush.x + (Math.random() * 2 - 1) * shake, -1, 1);
          y = clamp(y + this.composurePush.y + (Math.random() * 2 - 1) * shake, -1, 1);
        }
        this.lastAim = { x, y };
        this.onAim?.(x, y);
      },
      fire: (t) => this.pushEngine({ type: 'fire', t, aim: { ...this.lastAim } }),
      reloadOpen: (t) => this.pushEngine({ type: 'reloadOpen', t }),
      reloadRound: (t) => this.pushEngine({ type: 'reloadRound', t }),
      reloadClose: (t) => this.pushEngine({ type: 'reloadClose', t }),
    };
    this.motion.attach(cb, el);
    this.touch.attach(cb, el);
    this.mouse.attach(cb, el);
  }

  /** Engine hook: the player just took a hit — shove the reticle. */
  applyComposure(untilMs: number, pushDeg: number, _t: number): void {
    this.composureUntil = untilMs;
    const dirX = Math.random() < 0.5 ? -1 : 1;
    const dirY = Math.random() < 0.5 ? -1 : 1;
    this.composurePush = {
      x: (pushDeg * dirX) / tuning.aimRangeXDeg,
      y: (pushDeg * dirY) / tuning.aimRangeYDeg,
    };
  }

  /** Called by the UI after the permission result decides the source. */
  chooseMotion(): void {
    this.active = 'motion';
  }

  chooseTouch(reason: string): void {
    if (this.active !== 'touch') {
      this.fallBackReason = reason;
      this.active = 'touch';
    }
  }

  chooseMouse(reason: string): void {
    if (this.active !== 'mouse') {
      this.fallBackReason = reason;
      this.active = 'mouse';
    }
  }

  /**
   * Preferred fallback when motion never delivers: touch on coarse-pointer
   * devices, mouse on desktop. Chosen at boot, used by the no-data timer.
   */
  private preferredFallback: 'touch' | 'mouse' = 'touch';

  /** Auto: no touch capability → mouse; otherwise touch stays ready. */
  autoDetect(): void {
    const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? 'ontouchstart' in window;
    this.preferredFallback = coarse ? 'touch' : 'mouse';
    if (!coarse) this.chooseMouse('جهاز بدون لمس — تحكم الماوس');
  }

  /** Motion didn't deliver events — fall back to the preferred source. */
  fallBackFromMotion(): void {
    if (this.mode === 'motion' && this.motionHz === 0) {
      if (this.preferredFallback === 'mouse') this.chooseMouse('ما وصلت قراءات حركة — تحكم الماوس.');
      else this.chooseTouch('ما وصلت قراءات حركة — التحكم باللمس.');
    }
  }

  setEngine(engine: RoundEngine | null): void {
    this.engine = engine;
  }

  resetRound(): void {
    this.lastAim = { x: 0, y: 0 };
    this.onAim?.(0, 0);
    this.motion.resetRound();
    this.touch.resetRound();
    this.mouse.resetRound();
  }

  private pushEngine(ev: RoundInputEvent): void {
    // Touch sources can't fire while the engine ignores them; push regardless
    // and let the engine judge (foul rules apply).
    this.engine?.push(ev);
  }

  /** Test/E2E hook: force the shared aim (drives fire + HUD). */
  testAim(x: number, y: number): void {
    this.lastAim = { x, y };
    this.onAim?.(x, y);
  }

  onAim: ((x: number, y: number) => void) | null = null;

  getAim(): AimPoint {
    if (this.active === 'motion') return this.motion.getAim();
    if (this.active === 'touch') return this.touch.getAim();
    return this.mouse.getAim();
  }
}

export { tuning };
