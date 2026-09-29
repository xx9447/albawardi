// Hidden tuning panel (task Phase 1): 3 taps on the screen corner open it.
// Every knob writes straight into the single tuning object; filter/machine
// values apply on the next round (engine params are snapshotted per round).

import { useState } from 'preact/hooks';
import { tuning } from '../config/tuning.js';

interface Slider {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  get(): number;
  set(v: number): void;
}

export function TuningPanel({ onClose, motionHz }: { onClose(): void; motionHz: number }) {
  const [, force] = useState(0);

  const sliders: Slider[] = [
    num('sensitivity', 'الحساسية', 0.5, 2, 0.1, () => tuning.sensitivity, (v) => (tuning.sensitivity = v)),
    num('oneEuroMin', 'One Euro minCutoff', 0.1, 5, 0.1, () => tuning.oneEuro.minCutoff, (v) => (tuning.oneEuro.minCutoff = v)),
    num('oneEuroBeta', 'One Euro beta', 0.001, 0.5, 0.001, () => tuning.oneEuro.beta, (v) => (tuning.oneEuro.beta = v)),
    num('enterDeg', 'دخول الجراب (°)', 40, 90, 1, () => -tuning.holster.enterDeg, (v) => (tuning.holster.enterDeg = -v)),
    num('exitDeg', 'خروج الجراب (°)', 15, 55, 1, () => -tuning.holster.exitDeg, (v) => (tuning.holster.exitDeg = -v)),
    num('steadyMs', 'ثبات الجراب (ms)', 100, 1000, 50, () => tuning.holster.steadyMs, (v) => (tuning.holster.steadyMs = v)),
    num('foulDeg', 'فاول السحب المبكر (°)', 10, 40, 1, () => tuning.machine.foulDeg, (v) => (tuning.machine.foulDeg = v)),
    num('twitchDeg', 'منطقة الارتجاف (°)', 5, 25, 1, () => tuning.machine.twitchEnterDeg, (v) => (tuning.machine.twitchEnterDeg = v)),
    num('guessMs', 'حد التخمين (ms)', 80, 300, 10, () => tuning.round.guessFireMs, (v) => (tuning.round.guessFireMs = v)),
    num('aiMean', 'رد فعل الخصم (ms)', 250, 900, 10, () => tuning.ai.reactionMeanMs, (v) => (tuning.ai.reactionMeanMs = v)),
    num('aiSd', 'تباين الخصم (ms)', 20, 300, 10, () => tuning.ai.reactionSdMs, (v) => (tuning.ai.reactionSdMs = v)),
    num('aiAcc', 'دقة الخصم (0-1)', 0, 1, 0.05, () => tuning.ai.accuracy, (v) => (tuning.ai.accuracy = v)),
    num('signalMin', 'أقل ترقب (ms)', 500, 4000, 100, () => tuning.round.signalMinMs, (v) => (tuning.round.signalMinMs = v)),
    num('signalMax', 'أقصى ترقب (ms)', 1500, 8000, 100, () => tuning.round.signalMaxMs, (v) => (tuning.round.signalMaxMs = v)),
  ];

  return (
    <div class="ui-panel" dir="rtl">
      <div class="panel-head">
        <h2>لوحة الضبط المخفية</h2>
        <button class="close" onClick={onClose}>✕</button>
      </div>
      <div class="panel-body">
        {sliders.map((s) => (
          <div class="sl" key={s.key}>
            <label>
              <span>{s.label}</span>
              <b>{s.get().toFixed(s.step < 0.1 ? 3 : s.step < 1 ? 1 : 0)}</b>
            </label>
            <input
              type="range"
              min={s.min}
              max={s.max}
              step={s.step}
              value={s.get()}
              onInput={(e: Event) => {
                s.set(parseFloat((e.target as HTMLInputElement).value));
                force((x) => x + 1);
              }}
            />
          </div>
        ))}
        <div class="hz">معدل الحساسات: {motionHz}Hz</div>
        <p class="hint">التغييرات على فلاتر الماكينة تُطبّق من الجولة القادمة. الحساسية والفلاتر الحية فوراً.</p>
      </div>
    </div>
  );
}

function num(
  key: string,
  label: string,
  min: number,
  max: number,
  step: number,
  get: () => number,
  set: (v: number) => void,
): Slider {
  return { key, label, min, max, step, get, set };
}
