// RoundEngine — one duel round, pure logic (no DOM). The client feeds it
// timestamped pose/fire/reload events; it drives the input state machine,
// the signal schedule, the AI opponent, and produces the round log.
//
// Rules implemented (design doc §3/§4):
//   - draw time = first shot − moment the signal is DISPLAYED
//   - < 100ms after the signal = guessed → foul
//   - > 25° pre-signal movement = early-draw foul (from the state machine)
//   - firing before the aim pose is allowed (hip shot) with a big spread
//   - first lethal shot wins; two lethal shots within 10ms = double death
//   - 8s after the signal with both alive → higher health wins; tie = replay

import { AiOpponent, DEFAULT_AI, type AiParams } from './ai.js';
import { resolveShot, type AimPoint, type DamageResult, type HitZone } from './damage.js';
import { DEFAULT_HOLSTER, HolsterDetector, type HolsterParams } from './holster.js';
import { mulberry32, type Rng } from './rng.js';
import {
  DEFAULT_INPUT_MACHINE,
  InputStateMachine,
  type InputMachineParams,
  type InputState,
} from './stateMachine.js';
import { Timeline } from './timeline.js';
import { REVOLVER, type WeaponDef } from './weapons.js';

export interface RoundParams {
  signalMinMs: number;
  signalMaxMs: number;
  /** A shot this soon after the signal is a guess → foul. */
  guessFireMs: number;
  roundTimeoutMs: number;
  /** Lethal shots within this window kill both. */
  doubleDeathMs: number;
  initialHealth: number;
  playRangeXDeg: number;
  playRangeYDeg: number;
  /** Extra spread multiplier when firing from the armed pose. */
  spreadArmedMult: number;
  /** How long the falling-coin animation runs before the signal lands. */
  coinTossMs: number;
}

export const DEFAULT_ROUND: RoundParams = {
  signalMinMs: 2000,
  signalMaxMs: 6000,
  guessFireMs: 100,
  roundTimeoutMs: 8000,
  doubleDeathMs: 10,
  initialHealth: 100,
  playRangeXDeg: 22,
  playRangeYDeg: 14,
  spreadArmedMult: 1.5,
  coinTossMs: 800,
};

export type RoundPhase = 'waitForHolster' | 'tension' | 'live' | 'resolved';

export type RoundInputEvent =
  | { type: 'pose'; t: number; tiltDeg: number; rateDeg: number }
  | { type: 'fire'; t: number; aim: AimPoint }
  | { type: 'reloadOpen'; t: number }
  | { type: 'reloadRound'; t: number }
  | { type: 'reloadClose'; t: number }
  /** Internal: the AI's planned shot, queued at its exact planned time. */
  | { type: 'aiFire'; t: number };

export type FoulReason = 'earlyDraw' | 'earlyFire' | 'guessFire';

export interface ShotRecord {
  t: number;
  zone: HitZone;
  damage: number;
  hit: boolean;
  hip: boolean;
}

export interface RoundLog {
  index: number;
  startedAt: number;
  signalShownAt: number | null;
  drawCrossAt: number | null;
  firstShotAt: number | null;
  drawTimeMs: number | null;
  foul: FoulReason | null;
  shots: ShotRecord[];
  aiShot: { t: number; zone: HitZone; hit: boolean } | null;
  winner: 'player' | 'ai' | 'double' | null;
  playerHealth: number;
  aiHealth: number;
  hatOff: boolean;
}

export interface EngineHooks {
  onPhase?(phase: RoundPhase, t: number): void;
  /** The coin is tossed at tossAt and lands (= signal displayed) at signalAt. */
  onSignalPlanned?(tossAt: number, signalAt: number): void;
  onState?(state: InputState): void;
  onTwitch?(t: number): void;
  onPlayerShot?(shot: ShotRecord, result: DamageResult): void;
  onAiShot?(hit: boolean, zone: HitZone, t: number): void;
  onHealth?(player: number, ai: number): void;
  onAmmo?(loaded: number, capacity: number, cylinderOpen: boolean): void;
  onHatOff?(t: number): void;
  onComposure?(shakeMult: number, untilMs: number, pushDeg: number, t: number): void;
  onRoundEnd?(log: RoundLog): void;
}

export interface RoundEngineOptions {
  roundIndex?: number;
  params?: Partial<RoundParams>;
  machineParams?: Partial<InputMachineParams>;
  holsterParams?: Partial<HolsterParams>;
  ai?: AiParams;
  weapon?: WeaponDef;
  rng?: Rng;
  hooks?: EngineHooks;
}

export class RoundEngine {
  readonly params: RoundParams;
  readonly machine: InputStateMachine;
  readonly holster: HolsterDetector;
  readonly weapon: WeaponDef;
  readonly hooks: EngineHooks;
  private readonly rng: Rng;
  private readonly ai: AiOpponent;
  private readonly timeline = new Timeline<RoundInputEvent>();

  phase: RoundPhase = 'waitForHolster';
  private roundIndex: number;
  private signalAt: number | null = null;
  signalShownAt: number | null = null;
  private aiPlan: { fireAtMs: number; willHit: boolean; zone: HitZone } | null = null;

  playerHealth: number;
  aiHealth: number;
  loaded: number;
  cylinderOpen = false;
  private lastShotAt: number | null = null;
  private lastPoseTilt = -70;

  private playerLethalAt: number | null = null;
  private aiLethalAt: number | null = null;
  private resolveAt: number | null = null;

  private log: RoundLog;
  private prevMachineState: InputState = 'notReady';

  constructor(opts: RoundEngineOptions = {}) {
    this.params = { ...DEFAULT_ROUND, ...(opts.params ?? {}) };
    this.machine = new InputStateMachine({ ...DEFAULT_INPUT_MACHINE, ...(opts.machineParams ?? {}) });
    this.holster = new HolsterDetector({ ...DEFAULT_HOLSTER, ...(opts.holsterParams ?? {}) });
    this.weapon = opts.weapon ?? REVOLVER;
    this.rng = opts.rng ?? mulberry32(42);
    this.ai = new AiOpponent(opts.ai ?? DEFAULT_AI, this.rng);
    this.hooks = opts.hooks ?? {};
    this.roundIndex = opts.roundIndex ?? 0;
    this.playerHealth = this.params.initialHealth;
    this.aiHealth = this.params.initialHealth;
    this.loaded = this.weapon.ammo;
    this.log = {
      index: this.roundIndex,
      startedAt: 0,
      signalShownAt: null,
      drawCrossAt: null,
      firstShotAt: null,
      drawTimeMs: null,
      foul: null,
      shots: [],
      aiShot: null,
      winner: null,
      playerHealth: this.playerHealth,
      aiHealth: this.aiHealth,
      hatOff: false,
    };
  }

  start(t: number): void {
    this.log.startedAt = t;
    this.setPhase('waitForHolster', t);
    this.emitAmmo();
  }

  push(...evs: RoundInputEvent[]): void {
    for (const ev of evs) this.timeline.push(ev);
  }

  /** Advance to `now` (ms), processing every queued event in t order. */
  step(now: number): void {
    if (this.phase === 'resolved') return;
    for (const ev of this.timeline.drain(now)) this.process(ev);

    if (this.phase === 'tension' && this.signalAt !== null && now >= this.signalAt) {
      this.showSignal(now);
    }

    if (this.phase === 'live') {
      if (this.signalShownAt !== null && now >= this.signalShownAt + this.params.roundTimeoutMs) {
        this.resolveTimeout(now);
      }
      if (this.resolveAt !== null && now >= this.resolveAt) {
        this.resolveLethal(now);
      }
    }
  }

  private process(ev: RoundInputEvent): void {
    switch (ev.type) {
      case 'pose': {
        this.lastPoseTilt = ev.tiltDeg;
        const hs = this.holster.update(ev.tiltDeg, ev.rateDeg, ev.t);
        const { twitchWarning } = this.machine.update({ t: ev.t, tiltDeg: ev.tiltDeg, holster: hs });
        if (twitchWarning) this.hooks.onTwitch?.(ev.t);
        this.trackMachine(ev.t);

        if (this.phase === 'waitForHolster' && this.machine.state === 'holstered') {
          const span = this.params.signalMaxMs - this.params.signalMinMs;
          this.signalAt = ev.t + this.params.signalMinMs + this.rng() * span;
          // Let the renderer toss the coin before the landing (= the signal).
          this.hooks.onSignalPlanned?.(this.signalAt - this.params.coinTossMs, this.signalAt);
          this.setPhase('tension', ev.t);
        }
        if (this.machine.state === 'foul' && this.phase !== 'resolved') {
          this.endRound('ai', 'earlyDraw', ev.t);
        }
        break;
      }

      case 'fire':
        this.onFire(ev.t, ev.aim);
        break;

      case 'reloadOpen':
        if (!this.cylinderOpen) {
          this.cylinderOpen = true;
          if (this.phase === 'live') this.machine.enterReload();
          this.emitAmmo();
        }
        break;

      case 'reloadRound':
        if (this.cylinderOpen && this.loaded < this.weapon.ammo) {
          this.loaded++;
          this.emitAmmo();
        }
        break;

      case 'reloadClose':
        if (this.cylinderOpen) {
          this.cylinderOpen = false;
          this.machine.exitReload(this.lastPoseTilt);
          this.emitAmmo();
        }
        break;

      case 'aiFire':
        this.aiFire(ev.t);
        break;
    }
  }

  private onFire(t: number, aim: AimPoint): void {
    if (this.phase === 'resolved') return;

    // Firing before the signal at all = early fire foul.
    if (this.signalShownAt === null) {
      this.endRound('ai', 'earlyFire', t);
      return;
    }
    // Too fast after the signal = a guess.
    if (t - this.signalShownAt < this.params.guessFireMs) {
      this.endRound('ai', 'guessFire', t);
      return;
    }
    // A player already dead (outside the double-death window) cannot shoot.
    if (this.aiLethalAt !== null && t > this.aiLethalAt + this.params.doubleDeathMs) {
      return;
    }

    if (this.cylinderOpen || this.loaded <= 0) {
      return; // dry click — no shot
    }
    if (this.lastShotAt !== null && t - this.lastShotAt < this.weapon.minFireIntervalMs) {
      return; // still cycling
    }

    const state = this.machine.state;
    const hip = state !== 'aim';
    const spread =
      state === 'aim'
        ? this.weapon.spreadAimDeg
        : state === 'draw'
          ? this.weapon.spreadHipDeg
          : this.weapon.spreadHipDeg * this.params.spreadArmedMult;

    const result = resolveShot(
      aim,
      spread,
      this.params.playRangeXDeg,
      this.params.playRangeYDeg,
      this.weapon.damage,
      this.weapon.composure,
      this.rng,
    );

    this.loaded--;
    this.lastShotAt = t;
    const hit = result.zone !== 'miss';
    const shot: ShotRecord = { t, zone: result.zone, damage: result.damage, hit, hip };
    this.log.shots.push(shot);
    if (this.log.firstShotAt === null) {
      this.log.firstShotAt = t;
      this.log.drawTimeMs = t - this.signalShownAt;
    }
    this.hooks.onPlayerShot?.(shot, result);

    if (result.hatOff) {
      this.log.hatOff = true;
      this.hooks.onHatOff?.(t);
    }
    if (hit) {
      this.aiHealth = Math.max(0, this.aiHealth - result.damage);
      this.log.aiHealth = this.aiHealth;
      this.hooks.onHealth?.(this.playerHealth, this.aiHealth);
    }
    if (result.lethal || this.aiHealth <= 0) {
      if (this.playerLethalAt === null) this.playerLethalAt = t;
      this.scheduleResolution(t);
    }
    if (this.loaded === 0) {
      this.machine.enterReload(); // dry → reload state (the gesture still opens the cylinder)
    }
    this.emitAmmo();
  }

  private aiFire(now: number): void {
    if (!this.aiPlan) return;
    const hit = this.aiPlan.willHit;
    const zone = this.aiPlan.zone;
    this.log.aiShot = { t: now, zone, hit };
    this.hooks.onAiShot?.(hit, zone, now);
    if (hit) {
      const dmg = zone === 'head' ? this.weapon.damage.head : this.weapon.damage.torso;
      this.playerHealth = Math.max(0, this.playerHealth - dmg);
      this.log.playerHealth = this.playerHealth;
      this.hooks.onHealth?.(this.playerHealth, this.aiHealth);
      if (zone !== 'head') {
        // A body hit shoves the player's reticle (composure push).
        this.hooks.onComposure?.(1, now, this.weapon.composure.hitPushDeg, now);
      }
      if (this.playerHealth <= 0 && this.aiLethalAt === null) {
        this.aiLethalAt = now;
        this.scheduleResolution(now);
      }
    }
  }

  private scheduleResolution(t: number): void {
    if (this.resolveAt === null) this.resolveAt = t + this.params.doubleDeathMs;
    // else: already waiting — a second lethal shot inside the window counts.
  }

  private resolveLethal(now: number): void {
    const player = this.playerLethalAt !== null;
    const ai = this.aiLethalAt !== null;
    if (player && ai) this.endRound('double', null, now);
    else if (player) this.endRound('player', null, now);
    else if (ai) this.endRound('ai', null, now);
  }

  private resolveTimeout(now: number): void {
    if (this.playerHealth > this.aiHealth) this.endRound('player', null, now);
    else if (this.aiHealth > this.playerHealth) this.endRound('ai', null, now);
    else this.endRound('double', null, now); // tie → replay the round
  }

  private showSignal(t: number): void {
    this.signalShownAt = t;
    this.log.signalShownAt = t;
    this.machine.onEvent({ type: 'signal', t });
    this.trackMachine(t);
    this.aiPlan = this.ai.planRound(t);
    // Queue the AI shot at its exact planned time so every event (player and
    // AI) is judged strictly by timestamp, like the online server will.
    this.timeline.push({ type: 'aiFire', t: this.aiPlan.fireAtMs });
    this.setPhase('live', t);
  }

  private endRound(winner: 'player' | 'ai' | 'double', foul: FoulReason | null, t: number): void {
    this.log.foul = foul;
    this.log.winner = winner;
    this.log.playerHealth = this.playerHealth;
    this.log.aiHealth = this.aiHealth;
    this.machine.onEvent({ type: 'roundEnd', t });
    this.trackMachine(t);
    this.setPhase('resolved', t);
    this.hooks.onRoundEnd?.(this.log);
  }

  private setPhase(phase: RoundPhase, t: number): void {
    this.phase = phase;
    this.hooks.onPhase?.(phase, t);
  }

  private trackMachine(t: number): void {
    if (this.machine.state !== this.prevMachineState) {
      if (this.machine.state === 'draw' && this.log.drawCrossAt === null) {
        this.log.drawCrossAt = t;
      }
      this.prevMachineState = this.machine.state;
      this.hooks.onState?.(this.machine.state);
    }
  }

  private emitAmmo(): void {
    this.hooks.onAmmo?.(this.loaded, this.weapon.ammo, this.cylinderOpen);
  }

  getLog(): RoundLog {
    return { ...this.log, shots: [...this.log.shots] };
  }
}
