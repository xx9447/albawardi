// Sound — all synthesized in Web Audio at boot (task rule 6: no borrowed
// assets). Buffers are preloaded so playback is instant (<16ms from the tap).
// The context is unlocked on the first user gesture; iOS silent-mode is
// mitigated with navigator.audioSession.type = "playback" when available.

export type SoundName =
  | 'shot'
  | 'enemyShot'
  | 'hit'
  | 'hat'
  | 'coin'
  | 'dryClick'
  | 'cylOpen'
  | 'cylClose'
  | 'roundLoad'
  | 'twitchWarn'
  | 'wind';

export class GameAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private buffers = new Map<SoundName, AudioBuffer>();
  private windSource: AudioBufferSourceNode | null = null;
  private unlocked = false;

  get ready(): boolean {
    return this.unlocked && this.ctx !== null;
  }

  /** MUST be called from a user gesture (the Enter Street tap). */
  async unlock(): Promise<void> {
    if (this.unlocked) return;
    const Ctor = window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    this.ctx = new Ctor();
    await this.ctx.resume();
    // Ask iOS to keep playing in silent mode when the API exists.
    const session = (navigator as unknown as { audioSession?: { type?: string } }).audioSession;
    if (session) {
      try {
        (session as { type: string }).type = 'playback';
      } catch {
        /* older Safari: ignore */
      }
    }
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(this.ctx.destination);
    this.synthesizeAll();
    this.unlocked = true;
  }

  play(name: SoundName, gain = 1): void {
    const ctx = this.ctx;
    const buf = this.buffers.get(name);
    if (!ctx || !buf || !this.master) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(g).connect(this.master);
    src.start();
  }

  startWind(): void {
    const ctx = this.ctx;
    const buf = this.buffers.get('wind');
    if (!ctx || !buf || !this.master || this.windSource) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const g = ctx.createGain();
    g.gain.value = 0.08;
    src.connect(g).connect(this.master);
    src.start();
    this.windSource = src;
  }

  stopWind(): void {
    this.windSource?.stop();
    this.windSource = null;
  }

  // ---- synthesis (procedural, hand-made "sharp temporary sounds") ----

  private synthesizeAll(): void {
    const ctx = this.ctx!;
    const sr = ctx.sampleRate;
    const mk = (lenSec: number) => ctx.createBuffer(1, Math.floor(sr * lenSec), sr);

    // gunshot: sharp crack + body + street echo
    this.buffers.set('shot', this.renderNoise(mk(0.5), (i, n) => {
      const t = i / sr;
      const crack = Math.exp(-t * 900) * 1.2;
      const body = Math.exp(-t * 60) * 0.5 * Math.sin(2 * Math.PI * 140 * t);
      const echo = Math.exp(-t * 9) * 0.12 * Math.sin(2 * Math.PI * 0.3) * (t > 0.06 ? 1 : 0);
      return (crack + body + echo) * (i / n > 0.99 ? (1 - (i / n - 0.99) * 100) : 1);
    }));
    this.buffers.set('enemyShot', this.renderNoise(mk(0.4), (i) => {
      const t = i / sr;
      return (Math.exp(-t * 500) * 0.8 + Math.exp(-t * 40) * 0.3 * Math.sin(2 * Math.PI * 110 * t)) * 0.7;
    }));

    // body hit: muffled thump
    this.buffers.set('hit', this.renderNoise(mk(0.25), (i) => {
      const t = i / sr;
      return Math.exp(-t * 45) * Math.sin(2 * Math.PI * 85 * t) * 0.9 + Math.exp(-t * 300) * 0.2;
    }));

    // hat ring: metallic jingle
    this.buffers.set('hat', this.renderNoise(mk(0.4), (i) => {
      const t = i / sr;
      const ring =
        Math.sin(2 * Math.PI * 3200 * t) * 0.5 + Math.sin(2 * Math.PI * 4700 * t) * 0.35 + Math.sin(2 * Math.PI * 5900 * t) * 0.25;
      return ring * Math.exp(-t * 18) * 0.5;
    }));

    // coin "tink": short, sharp, clear — the signal
    this.buffers.set('coin', this.renderNoise(mk(0.35), (i) => {
      const t = i / sr;
      const ring =
        Math.sin(2 * Math.PI * 2500 * t) * 0.6 + Math.sin(2 * Math.PI * 3800 * t) * 0.4 + Math.sin(2 * Math.PI * 6100 * t) * 0.3;
      return ring * Math.exp(-t * 40) * 0.8 + Math.exp(-t * 500) * 0.3 * (Math.random() * 2 - 1);
    }));

    // dry click
    this.buffers.set('dryClick', this.renderNoise(mk(0.06), (i) => {
      const t = i / sr;
      return Math.exp(-t * 700) * 0.5 * (Math.random() * 0.5 + 0.5);
    }));

    // cylinder open: ratchet clicks
    this.buffers.set('cylOpen', this.renderNoise(mk(0.22), (i) => {
      const t = i / sr;
      const clicks = [0.0, 0.05, 0.1, 0.16].some((c) => t > c && t < c + 0.012) ? 0.8 : 0;
      return clicks * Math.exp(-(t % 0.05) * 200) * (Math.random() * 0.6 + 0.4);
    }));
    this.buffers.set('cylClose', this.renderNoise(mk(0.12), (i) => {
      const t = i / sr;
      return Math.exp(-t * 250) * 0.9 * (Math.random() * 0.4 + 0.6) + Math.sin(2 * Math.PI * 180 * t) * Math.exp(-t * 120) * 0.4;
    }));

    // loading one round
    this.buffers.set('roundLoad', this.renderNoise(mk(0.08), (i) => {
      const t = i / sr;
      return Math.exp(-t * 450) * 0.6 * Math.sin(2 * Math.PI * 900 * t);
    }));

    // twitch warning buzz
    this.buffers.set('twitchWarn', this.renderNoise(mk(0.12), (i) => {
      const t = i / sr;
      return Math.sin(2 * Math.PI * 220 * t) * Math.exp(-t * 25) * 0.25;
    }));

    // wind loop: filtered noise
    this.buffers.set('wind', this.renderNoise(mk(2), () => 0));
    {
      const buf = this.buffers.get('wind')!;
      const d = buf.getChannelData(0);
      let lp = 0;
      for (let i = 0; i < d.length; i++) {
        const white = Math.random() * 2 - 1;
        lp = lp * 0.97 + white * 0.03;
        d[i] = lp * 3;
      }
      // smooth loop seam
      const fade = Math.floor(sr * 0.05);
      for (let i = 0; i < fade; i++) {
        const w = i / fade;
        d[i] = d[i] * w + d[d.length - fade + i] * (1 - w);
      }
    }
  }

  private renderNoise(buf: AudioBuffer, fn: (i: number, n: number) => number): AudioBuffer {
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = fn(i, d.length);
    return buf;
  }
}
