// Bootstrap: build the scene/audio/input/game, wire the Preact UI, and run
// the first-journey flow (title → explainer → permission → duel).

import { render } from 'preact';
import { App } from './ui/App.js';
import { GameAudio } from './audio/Audio.js';
import { DuelScene } from './render/DuelScene.js';
import { InputManager } from './input/InputManager.js';
import { Game, type GameUiState } from './sim/Game.js';
import { requestMotionPermission } from './input/InputSource.js';
import { tuning } from './config/tuning.js';

async function boot() {
  const stage = document.getElementById('stage') as HTMLElement;
  const uiRoot = document.getElementById('ui') as HTMLElement;

  const audio = new GameAudio();
  const scene = new DuelScene();
  const input = new InputManager();
  const game = new Game(scene, audio, input);

  await scene.mount(stage);
  input.attach(stage);
  input.autoDetect();

  let controlNote = '';
  const refreshNote = () => {
    controlNote =
      input.mode === 'motion'
        ? 'التحكم: حركة الجوال · اللمس = زناد'
        : input.mode === 'touch'
          ? `التحكم باللمس${input.fallbackReason ? ` (${input.fallbackReason})` : ''} · الإبهام على الشريط السفلي = الجراب`
          : 'التحكم بالماوس · Space = جراب · إفلات = سحب · نقرة = إطلاق · R = تعمير · عجلة = رصاصة';
  };
  refreshNote();

  let uiState: GameUiState = {
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
  let hz = 0;
  setInterval(() => {
    hz = input.motionHz;
    rerender();
  }, 500);

  const rerender = () => {
    render(
      <App
        ui={uiState}
        controlMode={controlNote}
        motionHz={hz}
        enter={onEnter}
        startDuel={onStartDuel}
        onRestart={() => game.nextRound()}
        exportSession={() => game.exportSession()}
      />,
      uiRoot,
    );
  };

  game.onUi((s) => {
    uiState = s;
    rerender();
  });

  // Title tap: unlock audio AND (on iOS) fire the permission request from
  // inside the gesture. The explainer's continue tap then starts the duel.
  async function onEnter() {
    // Audio unlock must happen in-gesture; the permission call below also
    // stays inside this handler chain (no awaits before it).
    void audio.unlock();
    const result = await requestMotionPermission();
    if (result === 'granted') {
      input.chooseMotion();
    } else if (result === 'denied') {
      input.chooseTouch('رفضت صلاحية الحركة — التحكم باللمس. ترجع بإعادة تحميل الصفحة.');
    } else {
      input.chooseTouch('ما في حساسات — التحكم باللمس.');
    }
    // If no motion events arrive within 1.2s, switch to the preferred fallback.
    setTimeout(() => {
      input.fallBackFromMotion();
      refreshNote();
      rerender();
    }, 1200);
    refreshNote();
  }

  function onStartDuel(_note: string) {
    refreshNote();
    game.startRound();
  }

  rerender();

  // Debug/E2E handle (grey-box Phase 1 testing).
  (window as unknown as { __bawardi?: unknown }).__bawardi = { game, input, audio, scene, tuning };
}

void boot();
