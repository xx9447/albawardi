// Input state machine (design doc §3 "حالات التحكم"):
//   notReady → holstered → (foul | twitch) → armed → draw → aim → reload → finished
// Tilt convention: holster ≈ -70°, draw crossing -30°, aim ≥ +55° (vertical ≈ 90°).

import type { HolsterState } from './holster.js';

export interface InputMachineParams {
  /** Upward movement (deg) from the holster baseline that triggers a twitch warning. */
  twitchEnterDeg: number;
  /** Upward movement (deg) from the holster baseline that is an early-draw foul. */
  foulDeg: number;
  /** Tilt crossing this (upward, deg) after the signal starts the draw. */
  drawCrossDeg: number;
  /** Tilt at/above this (deg) = aiming pose (within 35° of vertical). */
  aimEnterDeg: number;
}

export const DEFAULT_INPUT_MACHINE: InputMachineParams = {
  twitchEnterDeg: 10,
  foulDeg: 25,
  drawCrossDeg: -30,
  aimEnterDeg: 55,
};

export type InputState =
  | 'notReady'
  | 'holstered'
  | 'twitch'
  | 'armed' // signal shown, phone still low — waiting for the draw crossing
  | 'draw'
  | 'aim'
  | 'reload'
  | 'foul'
  | 'finished';

/** Discrete events pushed into the machine. */
export type MachineEvent =
  | { type: 'signal'; t: number }
  | { type: 'roundEnd'; t: number }
  | { type: 'forceFoul'; t: number; reason?: string };

export interface PoseSample {
  t: number;
  tiltDeg: number;
  holster: HolsterState; // from HolsterDetector
}

export class InputStateMachine {
  state: InputState = 'notReady';
  /** Tilt captured when the phone settled in the holster. */
  holsterBaselineTilt: number | null = null;
  lastUpwardDelta = 0;

  constructor(public params: InputMachineParams = { ...DEFAULT_INPUT_MACHINE }) {}
  reset(): void {
    this.state = 'notReady';
    this.holsterBaselineTilt = null;
    this.lastUpwardDelta = 0;
  }

  /** Continuous pose update (sensor rate). Returns emitted warnings, if any. */
  update(sample: PoseSample): { twitchWarning: boolean } {
    const p = this.params;
    let twitchWarning = false;

    switch (this.state) {
      case 'notReady':
        if (sample.holster === 'in') {
          this.state = 'holstered';
          this.holsterBaselineTilt = sample.tiltDeg;
        }
        break;

      case 'holstered':
      case 'twitch': {
        // Pre-signal movement handling (foul / twitch zones).
        const base = this.holsterBaselineTilt ?? sample.tiltDeg;
        const up = sample.tiltDeg - base; // positive = raising toward aim
        this.lastUpwardDelta = up;
        if (up > p.foulDeg) {
          this.state = 'foul';
        } else if (up > p.twitchEnterDeg) {
          if (this.state !== 'twitch') twitchWarning = true;
          this.state = 'twitch';
        } else if (up <= p.twitchEnterDeg) {
          this.state = 'holstered';
        }
        break;
      }

      case 'armed':
        if (sample.tiltDeg > p.drawCrossDeg) {
          this.state = 'draw';
        }
        break;

      case 'draw':
        if (sample.tiltDeg >= p.aimEnterDeg) {
          this.state = 'aim';
        }
        break;

      case 'aim':
        if (sample.tiltDeg < p.aimEnterDeg) {
          this.state = 'draw';
        }
        break;
      // reload / foul / finished are handled via events
    }
    return { twitchWarning };
  }

  /** Enter reload (gesture or dry weapon) and close it. */
  enterReload(): void {
    if (this.state === 'aim' || this.state === 'draw' || this.state === 'armed') this.state = 'reload';
  }

  exitReload(tiltDeg: number): void {
    if (this.state !== 'reload') return;
    this.state = tiltDeg >= this.params.aimEnterDeg ? 'aim' : 'draw';
  }

  onEvent(ev: MachineEvent): void {
    switch (ev.type) {
      case 'signal':
        if (this.state === 'holstered' || this.state === 'twitch' || this.state === 'notReady') {
          this.state = 'armed';
        }
        break;
      case 'roundEnd':
        this.state = 'finished';
        break;
      case 'forceFoul':
        this.state = 'foul';
        break;
    }
  }
}
