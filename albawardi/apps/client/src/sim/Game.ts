// Game — the client orchestrator: a fixed-step 60Hz sim loop independent of
// rendering (doc §7), one RoundEngine per round, engine hooks wired to the
// scene/audio/UI, per-round logs, and session stats with JSON export.

import {
  mulberry32,
  REVOLVER,
  RoundEngine,
  type FoulReason,
  type InputState,
  type RoundPhase,
  type RoundLog,
} from '@albawardi/shared';
import { tuning } from '../config/tuning.js';
import type { GameAudio } from '../audio/Audio.js';
import type { DuelScene } from '../render/DuelScene.js';
import type { InputManager } from '../input/InputManager.js';
import { WakeLock } from '../util/wakeLock.js';

export interface GameUiState {
  phase: RoundPhase;
  state: InputState;
  message: string;
  ammo: number;
  capacity: number;
  cylinderOpen: boolean;
  playerHealth: number;
  enemyHealth: number;
  drawTimeMs: number | null;
  roundIndex: number;
  result: RoundLog | null;
}

export type UiListener = (s: GameUiState) => void;

const STEP_MS = 1000 / 60;

export class Game {
  private engine: RoundEngine | null = null;
  private scene: DuelScene;
  private audio: GameAudio;
  private input: InputManager;
  private wakeLock = new WakeLock();

  private raf: number | null = null;
  private lastFrame = 0;
  private acc = 0;
  private simTime = 0;
  private roundIndex = 0;

  private session: RoundLog[] = [];
  private ui: GameUiState = {
    phase: 'waitForHolster',
    state: 'notReady',
    message: '',
    ammo: 6,
    capacity: 6,
    cylinderOpen: false,
    playerHealth: 100,
    enemyHealth: 100,
    drawTimeMs: null,
    roundIndex: 0,
    result: null,
  };
  private listeners: UiListener[] = [];
  private autoNextTimer: number | null = null;

  constructor(scene: DuelScene, audio: GameAudio, input: InputManager) {
    this.scene = scene;
    this.audio = audio;
    this.input = input;
  }

  /** Debug/E2E: the live round engine (null between destroy). */
  get activeEngine(): RoundEngine | null {
    return this.engine;
  }

  onUi(fn: UiListener): void {
    this.listeners.push(fn);
    fn(this.ui);
  }

  private emit(patch: Partial<GameUiState>): void {
    this.ui = { ...this.ui, ...patch };
    for (const l of this.listeners) l(this.ui);
  }

  /** Begin the first round (after the Enter Street tap + permission result). */
  startRound(): void {
    if (this.autoNextTimer !== null) {
      clearTimeout(this.autoNextTimer);
      this.autoNextTimer = null;
    }
    this.roundIndex++;
    this.scene.resetRound();
    this.input.resetRound();

    const engine = new RoundEngine({
      roundIndex: this.roundIndex,
      params: { ...tuning.round },
      machineParams: { ...tuning.machine },
      holsterParams: { ...tuning.holster },
      ai: { ...tuning.ai },
      weapon: {
        ...REVOLVER,
        spreadAimDeg: tuning.weapon.spreadAimDeg,
        spreadHipDeg: tuning.weapon.spreadHipDeg,
      },
      rng: mulberry32((Math.random() * 2 ** 31) | 0),
      hooks: {
        onPhase: (phase, t) => this.onPhase(phase, t),
        onSignalPlanned: (tossAt, landAt) => this.scene.coinToss(tossAt, landAt),
        onState: (state) => this.onState(state),
        onTwitch: () => {
          this.audio.play('twitchWarn');
          this.flashMessage('ثابت… لا تتحرك!', 700);
        },
        onPlayerShot: (_shot, result) => {
          this.audio.play('shot');
          this.scene.playerMuzzle();
          if (navigator.vibrate) navigator.vibrate(30);
          if (result.zone !== 'miss') this.audio.play(result.hatOff ? 'hat' : 'hit');
          const aim = this.input.getAim();
          this.scene.hitMarker(aim.x, aim.y, result.zone);
        },
        onAiShot: (hit) => {
          this.audio.play('enemyShot');
          this.scene.enemyMuzzle();
          if (hit && navigator.vibrate) navigator.vibrate(80);
        },
        onHealth: (player, ai) => {
          this.scene.setHealth(player, ai, tuning.round.initialHealth);
          this.emit({ playerHealth: player, enemyHealth: ai });
        },
        onAmmo: (loaded, capacity, cylinderOpen) => {
          this.emit({ ammo: loaded, capacity, cylinderOpen });
        },
        onHatOff: () => {
          this.audio.play('hat');
          this.scene.hatFlies();
          this.flashMessage('طيّرت القبعة! 🎩', 1200);
        },
        onComposure: (_m, untilMs, pushDeg, t) => {
          this.input.applyComposure(untilMs, pushDeg, t);
        },
        onRoundEnd: (log) => this.onRoundEnd(log),
      },
    });
    this.engine = engine;
    this.input.setEngine(engine);
    engine.start(this.simTimeNow());
    this.audio.startWind();
    void this.wakeLock.acquire();
    this.emit({
      phase: 'waitForHolster',
      state: 'notReady',
      message: 'نزّل سلاحك',
      ammo: engine.loaded,
      capacity: engine.weapon.ammo,
      cylinderOpen: false,
      playerHealth: engine.playerHealth,
      enemyHealth: engine.aiHealth,
      drawTimeMs: null,
      result: null,
    });
    this.runLoop();
  }

  /** The user asked for another round (Revenge / auto-next). */
  nextRound(): void {
    this.startRound();
  }

  stop(): void {
    if (this.raf !== null) cancelAnimationFrame(this.raf);
    this.raf = null;
    this.audio.stopWind();
    this.wakeLock.release();
    this.input.setEngine(null);
  }

  exportSession(): string {
    const payload = {
      exportedAt: new Date().toISOString(),
      tuning: { ...tuning },
      inputMode: this.input.mode,
      rounds: this.session,
    };
    return JSON.stringify(payload, null, 2);
  }

  // ---- internals ----

  private simTimeNow(): number {
    return performance.now();
  }

  private runLoop(): void {
    if (this.raf !== null) cancelAnimationFrame(this.raf);
    this.lastFrame = performance.now();
    this.acc = 0;
    const frame = (now: number) => {
      const engine = this.engine;
      if (!engine) return;
      const dt = now - this.lastFrame;
      this.lastFrame = now;
      this.acc = Math.min(this.acc + dt, 250); // avoid spiral after tab switch
      // Fixed-step pacing: at least one sim tick per accumulated 16.67ms, but
      // always stepped in the EVENT epoch (performance.now) — event.timeStamp
      // values must never wait for a virtual clock to catch up.
      let ticks = 0;
      while (this.acc >= STEP_MS && ticks < 16) {
        this.acc -= STEP_MS;
        this.simTime += STEP_MS;
        ticks++;
      }
      engine.step(now);
      if (engine.phase === 'resolved') {
        this.cancelFrame();
        return;
      }
      // The reticle renders at frame rate from the live aim.
      const aim = this.input.getAim();
      this.scene.setReticle(aim.x, aim.y, engine.machine.state === 'aim' || engine.machine.state === 'draw' || engine.machine.state === 'reload');
      if (this.raf !== null) this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  }

  private onPhase(phase: RoundPhase, t: number): void {
    if (phase === 'tension') {
      this.emit({ phase, message: 'اثبت… وراقب' });
    } else if (phase === 'live') {
      this.audio.stopWind();
      this.audio.play('coin');
      this.scene.showDrawText();
      window.setTimeout(() => this.scene.hideDrawText(), 900);
      if (navigator.vibrate) navigator.vibrate(15);
      this.emit({ phase, message: '' });
      void t;
    } else if (phase === 'resolved') {
      this.emit({ phase });
    }
  }

  private onState(state: InputState): void {
    if (state === 'reload' && !this.ui.cylinderOpen) {
      // dry weapon: prompt the reload gesture
      const hint =
        this.input.mode === 'motion'
          ? 'لفّ المعصم يسار لفتح الأسطوانة، لمسة لكل رصاصة، لفّة يمين للإغلاق'
          : this.input.mode === 'mouse'
            ? 'R لفتح الأسطوانة · عجلة الفأرة للتعمير · R للإغلاق'
            : 'اسحب لأسفل لفتح الأسطوانة · لمسة لكل رصاصة · اسحب لأسفل للإغلاق';
      this.flashMessage(hint, 2500);
    }
    this.emit({ state });
  }

  private onRoundEnd(log: RoundLog): void {
    this.session.push(log);
    const msg = foulMessage(log.foul);
    if (log.winner === 'player') this.scene.enemyDies();
    else if (log.winner === 'ai') this.scene.playerDies();
    this.audio.stopWind();
    this.wakeLock.release();
    this.emit({
      phase: 'resolved',
      state: 'finished',
      message: msg,
      result: log,
      drawTimeMs: log.drawTimeMs,
    });
    // The frame loop self-cancels on resolve (scene slow-mo runs on the Pixi
    // ticker); auto-next restarts everything fresh.
    this.autoNextTimer = window.setTimeout(() => this.nextRound(), tuning.autoNextRoundMs);
  }

  private cancelFrame(): void {
    if (this.raf !== null) cancelAnimationFrame(this.raf);
    this.raf = null;
  }

  private messageTimer: number | null = null;
  private flashMessage(msg: string, ms: number): void {
    this.emit({ message: msg });
    if (this.messageTimer !== null) clearTimeout(this.messageTimer);
    this.messageTimer = window.setTimeout(() => this.emit({ message: '' }), ms);
  }
}

function foulMessage(foul: FoulReason | null): string {
  switch (foul) {
    case 'earlyDraw':
      return 'سحب مبكر — خسرت الجولة!';
    case 'earlyFire':
      return 'أطلقت قبل الإشارة — خسرت الجولة!';
    case 'guessFire':
      return 'أسرع من البشر — خسرت الجولة!';
    default:
      return '';
  }
}
