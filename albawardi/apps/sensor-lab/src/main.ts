// Sensor Lab main (Phase 0): permission flow, live readings + Hz, an aim
// reticle driven by gravity+gyro (never Euler angles), holster detection,
// One Euro sliders, screen-orientation watch, and JSON log export.

import {
  DEFAULT_FUSION,
  DEFAULT_HOLSTER,
  DEFAULT_ONE_EURO,
  GyroIntegrator,
  HolsterDetector,
  OneEuro2D,
  TiltFusion,
  tiltFromGravity,
  type HolsterState,
} from '@albawardi/shared';
import { detectBrowser, deviceInfo } from './detect.js';
import { SensorHub, type Reading } from './sensors.js';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const hub = new SensorHub();
const browser = detectBrowser();

// ---- Aim pipeline (same math the game will use) ----
const fusion = new TiltFusion({ ...DEFAULT_FUSION });
const yawInt = new GyroIntegrator();
const reticleFilter = new OneEuro2D({ ...DEFAULT_ONE_EURO });
const holster = new HolsterDetector({ ...DEFAULT_HOLSTER });

const lab = {
  sensitivity: 1.0,
  ySign: 1,
  aimRefTilt: 90, // reference "aim pose" tilt
  aimRefYaw: 0,
  oneEuro: { ...DEFAULT_ONE_EURO },
};

const AIM_RANGE_X = 22; // ±22° horizontal play range (doc §3)
const AIM_RANGE_Y = 14;

function resetAim(gravityTilt: number | null): void {
  if (gravityTilt !== null) fusion.reset(gravityTilt);
  else fusion.reset();
  yawInt.reset();
  lab.aimRefYaw = 0;
}

let reticleEl: HTMLElement;
let holsterBadge: HTMLElement;

function onSample(r: Reading): void {
  if (r.accY === null || r.accX === null || r.accZ === null) return;

  // 1. gravity low-pass → tilt
  const g = reticlePair(r);
  const gTilt = tiltFromGravity(g.x, g.y, g.z, lab.ySign);
  const pitchRate = r.rotB ?? 0;
  const tilt = fusion.step(gTilt, pitchRate, r.t);

  // 2. yaw from gyro integration (bias learned while holstered)
  const yawRate = r.rotG ?? 0;
  if (holster.holstered) yawInt.calibrate(yawRate, r.t);
  const yaw = yawInt.step(yawRate, r.t);

  // 3. reticle: offsets from the aim reference, clamped to the play range
  const dxDeg = (yaw - lab.aimRefYaw) * lab.sensitivity;
  const dyDeg = (tilt - lab.aimRefTilt) * lab.sensitivity;
  const nx = clamp(dxDeg / AIM_RANGE_X, -1, 1);
  const ny = clamp(dyDeg / AIM_RANGE_Y, -1, 1);
  const f = reticleFilter.filter(nx, ny, r.t);

  reticleEl.style.left = `${50 + f.x * 46}%`;
  reticleEl.style.top = `${50 - f.y * 46}%`;

  // 4. holster detection on the fused tilt
  const hs: HolsterState = holster.update(tilt, pitchRate, r.t);
  holsterBadge.textContent = `الجراب: ${hs === 'in' ? 'داخل ✓' : hs === 'entering' ? 'يثبت…' : 'خارج'}`;

  $('tiltVal').textContent = `${tilt.toFixed(1)}°`;
  $('yawVal').textContent = `${yaw.toFixed(1)}°`;
  $('holsterState').textContent = hs;
}

/** Filtered gravity vector (one low-pass per axis). */
const gFilter = new OneEuro2D({ minCutoff: 0.15, beta: 0.005, dCutoff: 1 });
let lastG = { x: 0, y: 0, z: 0 };
function reticlePair(r: Reading): { x: number; y: number; z: number } {
  if (r.accX === null || r.accY === null || r.accZ === null) return lastG;
  const g = gFilter.filter(r.accX, r.accZ, r.t); // x-axis, z-axis low-pass
  lastG = { x: g.x, y: r.accY, z: g.y };
  return lastG;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

// ---- UI wiring ----
function init(): void {
  $('browserName').textContent = browser.name;
  $('inApp').textContent = browser.inApp ? `نعم — ${browser.inApp}` : 'لا';
  $('isHttps').textContent = location.protocol === 'https:' ? '✓' : '✗ (الحساسات تحتاج HTTPS)';

  const startBtn = $('startBtn') as HTMLButtonElement;
  // The tap handler must call requestPermission() synchronously — no awaits first.
  startBtn.addEventListener('pointerdown', () => {
    void hub.requestAndStart().then(() => {
      updatePermUI();
      if (hub.status === 'granted' || hub.status === 'no-data' || hub.status === 'requesting') {
        $('liveCard').hidden = false;
        $('aimCard').hidden = false;
        $('logCard').hidden = false;
      }
    });
  });

  hub.onSample = onSample;

  // pointer sanity: does the browser deliver consistent pointer events?
  let lastPt = -1;
  const stage = $('stage');
  stage.addEventListener('pointerdown', (e) => {
    if (lastPt >= 0) {
      const gap = Math.abs(e.timeStamp - lastPt);
      $('pointerOk').textContent = gap > 10 && gap < 2000 ? '✓' : 'غريب';
    }
    lastPt = e.timeStamp;
  });

  // screen orientation
  const updateOrient = () => {
    const so = (screen as { orientation?: { type: string } }).orientation?.type ?? 'غير معروف';
    $('screenOrient').textContent = so;
  };
  updateOrient();
  window.addEventListener('orientationchange', updateOrient);
  if ((screen as { orientation?: { addEventListener?: Function } }).orientation?.addEventListener) {
    (screen.orientation as unknown as EventTarget).addEventListener('change', updateOrient);
  }

  // sliders
  bind('sMin', 'vMin', (v) => {
    lab.oneEuro.minCutoff = v;
    reticleFilter.setParams({ minCutoff: v });
  });
  bind('sBeta', 'vBeta', (v) => {
    lab.oneEuro.beta = v;
    reticleFilter.setParams({ beta: v });
  });
  bind('sSens', 'vSens', (v) => (lab.sensitivity = v));
  bind('sEnter', 'vEnter', (v) => holster.setParams({ enterDeg: -v }));
  bind('sExit', 'vExit', (v) => holster.setParams({ exitDeg: -v }));

  $('recenterBtn').addEventListener('click', () => {
    resetAim(null);
    reticleFilter.reset();
  });

  $('exportBtn').addEventListener('click', exportLog);

  reticleEl = $('reticle');
  holsterBadge = $('holsterBadge');

  requestAnimationFrame(tick);
}

function bind(id: string, labelId: string, apply: (v: number) => void): void {
  const el = $(id) as HTMLInputElement;
  const label = $(labelId);
  const update = () => {
    const v = parseFloat(el.value);
    label.textContent = String(v);
    apply(v);
  };
  el.addEventListener('input', update);
  update();
}

function updatePermUI(): void {
  const note = $('permNote');
  const btn = $('startBtn') as HTMLButtonElement;
  if (hub.status === 'granted') {
    note.innerHTML = `<span class="ok">✓ الصلاحية مقبولة والقراءات وصلت.</span>`;
    btn.textContent = 'تعمل الآن ✓';
    btn.disabled = true;
  } else if (hub.status === 'denied' || hub.status === 'unsupported') {
    note.innerHTML = `<span class="warn">${hub.statusReason}</span>`;
    btn.textContent = 'أعد المحاولة';
  } else if (hub.status === 'no-data') {
    note.innerHTML = `<span class="warn">${hub.statusReason}</span>`;
  }
}

function tick(): void {
  $('hzMotion').textContent = `${hub.motionHz.hz()} Hz`;
  $('hzOrient').textContent = `${hub.orientHz.hz()} Hz`;
  $('readCount').textContent = String(hub.readings.length);
  const r = hub.readings[hub.readings.length - 1];
  if (r) {
    $('accVal').textContent =
      r.accX === null ? '—' : `${r.accX.toFixed(2)}, ${r.accY?.toFixed(2)}, ${r.accZ?.toFixed(2)}`;
    $('rotVal').textContent =
      r.rotA === null ? '—' : `${r.rotA.toFixed(1)}, ${r.rotB?.toFixed(1)}, ${r.rotG?.toFixed(1)}`;
    $('eulerVal').textContent =
      r.alpha === null ? '— (ما نستخدمها للتصويب)' : `${r.alpha.toFixed(0)}, ${r.beta?.toFixed(0)}, ${r.gamma?.toFixed(0)}`;
  }
  requestAnimationFrame(tick);
}

function exportLog(): void {
  const payload = {
    exportedAt: new Date().toISOString(),
    device: deviceInfo(),
    browser,
    labSettings: {
      oneEuro: lab.oneEuro,
      sensitivity: lab.sensitivity,
      ySign: lab.ySign,
      holster: holster.getParams(),
      aimRangeDeg: { x: AIM_RANGE_X, y: AIM_RANGE_Y },
    },
    sensorsStatus: hub.status,
    readingCount: hub.readings.length,
    readings: hub.readings,
  };
  const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `albawardi-sensor-log-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

init();
