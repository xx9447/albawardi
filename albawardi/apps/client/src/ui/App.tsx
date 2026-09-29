// App — Preact DOM shell over the Pixi canvas (doc §7: Arabic text belongs
// in the DOM, not inside the renderer). Screens: title → permission explainer
// → duel → result, plus the hidden tuning panel (3 taps on the corner).

import { useEffect, useRef, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import type { GameUiState } from '../sim/Game.js';
import { TuningPanel } from './TuningPanel.js';

export type Screen = 'title' | 'explain' | 'duel';

export interface AppProps {
  enter(): void; // title tap → unlock audio, request motion permission (in-gesture)
  startDuel(controlNote: string): void; // begin the first round
  ui: GameUiState;
  controlMode: string;
  motionHz: number;
  onRestart(): void;
  exportSession(): string;
  children?: ComponentChildren;
}

export function App(props: AppProps) {
  const [screen, setScreen] = useState<Screen>('title');
  const [showResult, setShowResult] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const cornerTaps = useRef<number[]>([]);

  useEffect(() => {
    setShowResult(props.ui.phase === 'resolved');
  }, [props.ui.phase]);

  // hidden tuning panel: 3 taps within 1s on the top-left (RTL: top-right visual? keep top-left) corner
  const cornerTap = () => {
    const now = performance.now();
    cornerTaps.current = [...cornerTaps.current.filter((t) => now - t < 1000), now];
    if (cornerTaps.current.length >= 3) {
      setPanelOpen(true);
      cornerTaps.current = [];
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none' }}>
      {screen === 'duel' && (
        <>
          <div
            data-testid="corner"
            onClick={cornerTap}
            style={{ position: 'absolute', top: 0, insetInlineEnd: 0, width: 64, height: 64, zIndex: 30, pointerEvents: 'auto' }}
          />
          <Hud ui={props.ui} controlMode={props.controlMode} motionHz={props.motionHz} />
          {showResult && <ResultCard ui={props.ui} onRestart={props.onRestart} exportSession={props.exportSession} />}
        </>
      )}

      {screen === 'title' && <TitleScreen onEnter={() => { props.enter(); setScreen('explain'); }} />}
      {screen === 'explain' && (
        <ExplainCard
          onContinue={() => {
            props.startDuel(''); // startDuel handles the control note internally
            setScreen('duel');
          }}
        />
      )}

      {panelOpen && <TuningPanel onClose={() => setPanelOpen(false)} motionHz={props.motionHz} />}
    </div>
  );
}

function TitleScreen({ onEnter }: { onEnter(): void }) {
  return (
    <div class="screen center" dir="rtl">
      <div class="logo">البواردي</div>
      <div class="tagline">مبارزة كاوبوي · جوالك هو المسدس</div>
      <button class="big" onClick={onEnter}>
        ادخل الشارع
      </button>
      <div class="fineprint">اللمسة هذي تفتح الصوت وطلب صلاحية الحركة</div>
    </div>
  );
}

function ExplainCard({ onContinue }: { onContinue(): void }) {
  return (
    <div class="screen center" dir="rtl">
      <div class="card">
        <div class="hand-anim">📱</div>
        <h2>اللعبة تحتاج حركة جوالك عشان تصوّب</h2>
        <p>
          امسك الجوال قدامك مثل منظار التصويب. نزّله جنبك للجراب، وارفعه بسرعة عند الإشارة، ولمس الشاشة =
          الزناد. تعمير المسدس بلفّة معصم.
        </p>
        <p class="fineprint">ما في حساسات أو رُفضت الصلاحية؟ تقدر تلعب باللمس أو الماوس تلقائياً.</p>
        <button class="big" onClick={onContinue}>
          فهمت — يلا نبارز
        </button>
      </div>
    </div>
  );
}

function Hud({ ui, controlMode, motionHz }: { ui: GameUiState; controlMode: string; motionHz: number }) {
  const ammoDots = Array.from({ length: ui.capacity }, (_, i) => (i < ui.ammo ? '●' : '○')).join(' ');
  return (
    <div dir="rtl" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 20 }}>
      <div class="msg">{ui.message}</div>
      {ui.state === 'reload' && <div class="reload-hint">التعمير مفتوح — {ui.ammo}/{ui.capacity}</div>}
      <div class="ammo">
        {ammoDots} {ui.cylinderOpen ? '🔓' : ''}
      </div>
      <div class="controls-note">{controlMode}</div>
      <div class="debug">{motionHz > 0 ? `${motionHz}Hz` : ''}</div>
    </div>
  );
}

function ResultCard({
  ui,
  onRestart,
  exportSession,
}: {
  ui: GameUiState;
  onRestart(): void;
  exportSession(): string;
}) {
  const r = ui.result;
  const win = r?.winner === 'player';
  const title = r?.winner === 'double' ? 'موت مزدوج — إعادة الجولة' : win ? 'فوز!' : 'خسرت';
  return (
    <div class="screen center result" dir="rtl">
      <div class="card">
        <h1 class={win ? 'win' : 'lose'}>{title}</h1>
        <div class="stats">
          <Row k="زمن السحب" v={r?.drawTimeMs != null ? `${Math.round(r.drawTimeMs)}ms` : '—'} />
          <Row k="طلقات" v={String(r?.shots.length ?? 0)} />
          <Row k="إصابات" v={String(r?.shots.filter((s) => s.hit).length ?? 0)} />
          <Row k="صحتك" v={`${Math.round(ui.playerHealth)}`} />
          <Row k="صحة الخصم" v={`${Math.round(ui.enemyHealth)}`} />
          {r?.hatOff && <Row k="تذكار" v=" flying hat 🎩" />}
        </div>
        <button class="big" onClick={onRestart}>
          مبارزة جديدة
        </button>
        <button
          class="secondary"
          onClick={() => {
            const json = exportSession();
            const blob = new Blob([json], { type: 'application/json' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `albawardi-session-${Date.now()}.json`;
            a.click();
            URL.revokeObjectURL(a.href);
          }}
        >
          تصدير سجل الجلسة
        </button>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div class="row">
      <span>{k}</span>
      <b>{v}</b>
    </div>
  );
}
