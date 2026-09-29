// SensorHub — wraps devicemotion/deviceorientation with:
//  - iOS 13+ permission request (MUST run inside a user gesture, before any await)
//  - Android arrival check (events within 500ms)
//  - per-event Hz counters + a ring buffer of raw readings for export

export interface Reading {
  t: number; // event.timeStamp
  accX: number | null;
  accY: number | null;
  accZ: number | null;
  rotA: number | null;
  rotB: number | null;
  rotG: number | null;
  alpha: number | null;
  beta: number | null;
  gamma: number | null;
}

export type SensorsStatus =
  | 'idle'
  | 'requesting'
  | 'granted'
  | 'denied'
  | 'no-data' // permission fine but no events arrive
  | 'unsupported';

interface HzCounter {
  times: number[];
  hz(): number;
}

function makeHz(): HzCounter {
  const times: number[] = [];
  return {
    times,
    hz() {
      const cutoff = performance.now() - 1000;
      while (times.length && times[0] < cutoff) times.shift();
      return times.length;
    },
  };
}

export class SensorHub {
  status: SensorsStatus = 'idle';
  statusReason = '';
  readings: Reading[] = [];
  readonly motionHz = makeHz();
  readonly orientHz = makeHz();
  onSample: ((r: Reading) => void) | null = null;

  private listening = false;
  private noDataTimer: number | null = null;

  /** iOS: must be called directly in the tap handler, before any other await. */
  static needsPermission(): boolean {
    return (
      typeof (DeviceMotionEvent as { requestPermission?: unknown }).requestPermission === 'function' ||
      typeof (DeviceOrientationEvent as { requestPermission?: unknown }).requestPermission === 'function'
    );
  }

  async requestAndStart(): Promise<void> {
    this.status = 'requesting';
    try {
      if (SensorHub.needsPermission()) {
        // Call both requestPermission() synchronously inside the gesture.
        const dm = (DeviceMotionEvent as unknown as { requestPermission: () => Promise<string> }).requestPermission;
        const do_ = (
          DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> }
        ).requestPermission;
        const results = await Promise.all([
          dm.call(DeviceMotionEvent),
          do_ ? do_.call(DeviceOrientationEvent) : Promise.resolve('granted'),
        ]);
        if (results.some((r) => r !== 'granted')) {
          this.status = 'denied';
          this.statusReason = 'رفضت صلاحية الحركة. على الآيفون ترجع الصلاحية بإعادة تحميل الصفحة فقط.';
          return;
        }
      }
      if (typeof DeviceMotionEvent === 'undefined') {
        this.status = 'unsupported';
        this.statusReason = 'المتصفح ما يدعم DeviceMotion إطلاقاً — استخدم متصفح ثاني.';
        return;
      }
      this.startListening();
      // Android path: verify events actually arrive within 500ms.
      this.noDataTimer = window.setTimeout(() => {
        if (this.status === 'requesting' || (this.status === 'granted' && this.readings.length === 0)) {
          this.status = 'no-data';
          this.statusReason = 'الصلاحية موجودة لكن ما وصلت أي قراءة خلال 500ms — غالباً متصفح داخلي أو جوال بدون حساسات.';
        }
      }, 600);
    } catch (e) {
      this.status = 'denied';
      this.statusReason = `فشل طلب الصلاحية: ${String(e)} — جرّب خارج المتصفح المدمج (iframe يرفضها على Safari).`;
    }
  }

  private startListening(): void {
    if (this.listening) return;
    this.listening = true;
    window.addEventListener('devicemotion', this.onMotion as EventListener);
    window.addEventListener('deviceorientation', this.onOrientation as EventListener);
  }

  stop(): void {
    window.removeEventListener('devicemotion', this.onMotion as EventListener);
    window.removeEventListener('deviceorientation', this.onOrientation as EventListener);
    if (this.noDataTimer !== null) clearTimeout(this.noDataTimer);
    this.listening = false;
  }

  private onMotion = (ev: DeviceMotionEvent) => {
    if (this.noDataTimer !== null) {
      clearTimeout(this.noDataTimer);
      this.noDataTimer = null;
    }
    if (this.status !== 'granted') this.status = 'granted';
    this.motionHz.times.push(performance.now());
    const g = ev.accelerationIncludingGravity;
    const r = ev.rotationRate;
    const reading: Reading = {
      t: ev.timeStamp,
      accX: g?.x ?? null,
      accY: g?.y ?? null,
      accZ: g?.z ?? null,
      rotA: r?.alpha ?? null,
      rotB: r?.beta ?? null,
      rotG: r?.gamma ?? null,
      alpha: null,
      beta: null,
      gamma: null,
    };
    this.readings.push(reading);
    if (this.readings.length > 60000) this.readings.splice(0, 20000); // cap ~10 min
    this.onSample?.(reading);
  };

  private onOrientation = (ev: DeviceOrientationEvent) => {
    this.orientHz.times.push(performance.now());
    const last = this.readings[this.readings.length - 1];
    if (last && last.alpha === null && Math.abs(last.t - ev.timeStamp) < 5) {
      last.alpha = ev.alpha;
      last.beta = ev.beta;
      last.gamma = ev.gamma;
    }
  };
}
