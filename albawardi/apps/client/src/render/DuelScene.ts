// DuelScene — grey-box Phase 1 rendering in Pixi 8 (doc §9: "boxes and
// shapes, no art"): street layers, a static opponent built from the hit
// zones, the aim reticle, the falling coin, muzzle flashes, hit markers,
// screen shake, and the slow-motion death fall.

import { Application, Container, Graphics, Text } from 'pixi.js';
import type { HitZone } from '@albawardi/shared';
import { OPPONENT_ZONES } from '@albawardi/shared';
import { tuning } from '../config/tuning.js';

interface Marker {
  g: Graphics;
  born: number;
  life: number;
}

export class DuelScene {
  private app: Application | null = null;
  private root = new Container();
  private street = new Container();
  private opponent = new Container();
  private fx = new Container();
  private reticle = new Graphics();
  private coin = new Graphics();
  private coinShadow = new Graphics();
  private muzzle = new Graphics();
  private playerHp = new Graphics();
  private enemyHp = new Graphics();
  private drawText = new Text({ text: '', style: { fill: 0xf2c14e, fontSize: 40, fontFamily: 'sans-serif', fontWeight: '900' } });
  private hat = new Graphics();
  private hatOn = true;

  private markers: Marker[] = [];
  private shake = 0;
  private timeScale = 1;
  private slowMoUntil = 0;
  private coinAnim: { tossAt: number; landAt: number } | null = null;
  private coinGroundY = 0;
  private enemyDead = false;
  private enemyFallT = 0;

  async mount(el: HTMLElement): Promise<void> {
    const app = new Application();
    await app.init({ background: 0x2b2013, resizeTo: el, antialias: true, resolution: Math.min(window.devicePixelRatio, 2) });
    el.appendChild(app.canvas);
    app.stage.addChild(this.root);
    this.root.addChild(this.street, this.opponent, this.fx, this.coinShadow, this.coin, this.reticle, this.muzzle);
    this.app = app;
    this.layout();
    app.ticker.add((ticker) => this.tick(ticker.deltaTime / 60));
  }

  get canvas(): HTMLCanvasElement | undefined {
    return this.app?.canvas;
  }

  private layout(): void {
    const w = this.app!.renderer.width;
    const h = this.app!.renderer.height;

    // --- street (grey-box layers) ---
    const g = new Graphics();
    g.rect(0, 0, w, h * 0.62).fill(0x8fc6c9); // sky
    g.rect(0, h * 0.28, w, h * 0.06).fill(0x6a5a42); // distant facades
    for (let i = 0; i < 5; i++) {
      const bw = w / 7;
      const bx = i * bw * 1.35 + w * 0.06;
      g.rect(bx, h * 0.3, bw, h * 0.13).fill(0x7b4f2e);
      g.rect(bx + bw * 0.2, h * 0.33, bw * 0.2, h * 0.05).fill(0x3a2a18);
      g.rect(bx + bw * 0.6, h * 0.33, bw * 0.2, h * 0.05).fill(0x3a2a18);
    }
    g.rect(0, h * 0.42, w, h * 0.05).fill(0xcbb48a); // boardwalk
    g.rect(0, h * 0.47, w, h).fill(0xb59a6d); // ground
    g.moveTo(0, h * 0.47).lineTo(w, h * 0.47).stroke({ width: 2, color: 0x8a6f4d });
    this.street.addChild(g);

    // --- opponent built from the normalized zones ---
    const z = OPPONENT_ZONES;
    const toPx = (nx: number) => w / 2 + nx * (w / 2);
    const toPy = (ny: number) => h * 0.78 - (ny + 1) * (h * 0.3); // map y∈[-1,1] to street height
    const body = new Graphics();
    // legs
    body.rect(toPx(z.legL.x0), toPy(z.legL.y1), (z.legL.x1 - z.legL.x0) * (w / 2), (z.legL.y1 - z.legL.y0) * h * 0.3).fill(0x4a3826);
    body.rect(toPx(z.legR.x0), toPy(z.legR.y1), (z.legR.x1 - z.legR.x0) * (w / 2), (z.legR.y1 - z.legR.y0) * h * 0.3).fill(0x4a3826);
    // torso
    body.rect(toPx(z.torso.x0), toPy(z.torso.y1), (z.torso.x1 - z.torso.x0) * (w / 2), (z.torso.y1 - z.torso.y0) * h * 0.3).fill(0x5c4325);
    // arms
    body.rect(toPx(z.armL.x0), toPy(z.armL.y1), (z.armL.x1 - z.armL.x0) * (w / 2), (z.armL.y1 - z.armL.y0) * h * 0.3).fill(0x6b5232);
    body.rect(toPx(z.armR.x0), toPy(z.armR.y1), (z.armR.x1 - z.armR.x0) * (w / 2), (z.armR.y1 - z.armR.y0) * h * 0.3).fill(0x6b5232);
    // head
    body.circle(toPx(z.head.cx), toPy(z.head.cy), z.head.r * (w / 2)).fill(0xe8c9a0);
    // hat
    this.hat.clear();
    this.hat.circle(toPx(z.hat.cx), toPy(z.hat.cy), z.hat.r * (w / 2)).fill(0x2d2118);
    this.hat.rect(toPx(z.hat.cx) - z.hat.r * (w / 2) * 1.4, toPy(z.hat.cy) + z.hat.r * (w / 2) * 0.6, z.hat.r * (w / 2) * 2.8, 5).fill(0x241a10);
    this.opponent.addChild(body, this.hat);
    this.opponent.pivot.set(0, 0);

    // --- coin ---
    this.coin.circle(0, 0, Math.max(6, w * 0.012)).fill(0xf2c14e);
    this.coin.visible = false;
    this.coinShadow.ellipse(0, 0, Math.max(6, w * 0.012), Math.max(2, w * 0.004)).fill(0x00000066);
    this.coinShadow.visible = false;
    this.coinGroundY = h * 0.55;

    // --- reticle ---
    this.reticle.visible = false;

    // --- HUD bars (thin, top) ---
    this.drawText.anchor.set(0.5);
    this.drawText.position.set(this.app!.renderer.width / 2, this.app!.renderer.height * 0.18);
    this.root.addChild(this.playerHp, this.enemyHp, this.drawText);
  }

  resize(): void {
    // Pixi resizeTo handles it; re-layout is heavy — fine for v1.
  }

  // ---- per-frame ----

  private tick(dtFrame: number): void {
    const now = performance.now();
    // slow motion window
    if (now < this.slowMoUntil) this.timeScale = tuning.slowMoFactor;
    else this.timeScale = 1;
    const dt = dtFrame * this.timeScale;

    // coin animation
    if (this.coinAnim) {
      const { tossAt, landAt } = this.coinAnim;
      const p = (now - tossAt) / (landAt - tossAt);
      if (p >= 1) {
        this.coin.visible = false;
        this.coinShadow.visible = false;
        this.coinAnim = null;
      } else if (p >= 0) {
        this.coin.visible = true;
        this.coinShadow.visible = true;
        const w = this.app!.renderer.width;
        const x = w / 2;
        const arcH = this.app!.renderer.height * 0.22;
        const y = this.coinGroundY - Math.sin(p * Math.PI) * arcH;
        this.coin.position.set(x, y);
        this.coin.scale.set(Math.cos(p * Math.PI * 6) * 0.6 + 0.7); // spin
        this.coinShadow.position.set(x, this.coinGroundY + 4);
        this.coinShadow.alpha = 0.3 + p * 0.4;
      }
    }

    // markers fade
    this.markers = this.markers.filter((m) => {
      const age = (now - m.born) / m.life;
      if (age >= 1) {
        this.fx.removeChild(m.g);
        m.g.destroy();
        return false;
      }
      m.g.alpha = 1 - age;
      return true;
    });

    // shake decay
    if (this.shake > 0.1) {
      this.root.position.set((Math.random() * 2 - 1) * this.shake, (Math.random() * 2 - 1) * this.shake);
      this.shake *= Math.pow(0.001, dt);
    } else {
      this.root.position.set(0, 0);
    }

    // enemy death fall
    if (this.enemyDead) {
      this.enemyFallT = Math.min(1, this.enemyFallT + dt * 2.2);
      this.opponent.rotation = this.enemyFallT * (Math.PI / 2);
      this.opponent.position.y = this.enemyFallT * this.app!.renderer.height * 0.06;
      this.opponent.alpha = 1 - this.enemyFallT * 0.25;
    }

    // hat fly-off
    if (!this.hatOn) {
      this.hat.rotation += dt * 9;
      this.hat.position.x -= dt * 40;
      this.hat.position.y -= dt * 60;
    }
  }

  // ---- public API driven by Game/engine hooks ----

  setReticle(x: number, y: number, visible: boolean): void {
    const app = this.app;
    if (!app) return;
    this.reticle.visible = visible;
    const w = app.renderer.width;
    const h = app.renderer.height;
    // play-area box (leave the top 14% for health bars / pause)
    const px = w / 2 + x * (w / 2 - 30);
    const py = h * 0.57 - y * (h * 0.36);
    this.reticle.clear();
    this.reticle.circle(px, py, 14).stroke({ width: 2, color: 0xf2c14e });
    this.reticle.circle(px, py, 2).fill(0xf2c14e);
    this.reticle.moveTo(px - 20, py).lineTo(px - 26, py).stroke({ width: 2, color: 0xf2c14e });
    this.reticle.moveTo(px + 20, py).lineTo(px + 26, py).stroke({ width: 2, color: 0xf2c14e });
  }

  showDrawText(): void {
    this.drawText.text = 'اسحب!';
    this.drawText.alpha = 1;
    this.drawText.scale.set(1.6);
  }

  hideDrawText(): void {
    this.drawText.text = '';
  }

  coinToss(tossAt: number, landAt: number): void {
    this.coinAnim = { tossAt, landAt };
  }

  playerMuzzle(): void {
    const w = this.app!.renderer.width;
    const h = this.app!.renderer.height;
    const m = new Graphics();
    m.star(w / 2, h * 0.92, 6, 26, 10).fill(0xffe9b0);
    this.fx.addChild(m);
    this.markers.push({ g: m, born: performance.now(), life: 90 });
    this.shake = tuning.recoilShakePx;
  }

  enemyMuzzle(): void {
    const w = this.app!.renderer.width;
    const h = this.app!.renderer.height;
    const m = new Graphics();
    const z = OPPONENT_ZONES.armR;
    const gx = w / 2 + z.x1 * (w / 2);
    const gy = h * 0.78 - (0.3 + 1) * h * 0.3;
    m.star(gx, gy, 6, 22, 9).fill(0xffe9b0);
    this.fx.addChild(m);
    this.markers.push({ g: m, born: performance.now(), life: 120 });
    this.shake = Math.max(this.shake, 3);
  }

  hitMarker(aimX: number, aimY: number, zone: HitZone): void {
    const w = this.app!.renderer.width;
    const h = this.app!.renderer.height;
    const px = w / 2 + aimX * (w / 2 - 30);
    const py = h * 0.57 - aimY * (h * 0.36);
    const m = new Graphics();
    const color = zone === 'hat' ? 0xf2c14e : zone === 'miss' ? 0x777777 : 0xe06c5a;
    const r = zone === 'hat' ? 16 : 11;
    m.circle(px, py, r).stroke({ width: 3, color });
    if (zone !== 'miss' && zone !== 'hat') {
      m.moveTo(px - r, py).lineTo(px + r, py).stroke({ width: 2, color });
      m.moveTo(px, py - r).lineTo(px, py + r).stroke({ width: 2, color });
    }
    this.fx.addChild(m);
    this.markers.push({ g: m, born: performance.now(), life: 450 });
  }

  setHealth(player: number, enemy: number, max = 100): void {
    const w = this.app!.renderer.width;
    const barW = w * 0.36;
    const draw = (g: Graphics, ratio: number, x: number) => {
      g.clear();
      g.rect(x, 10, barW, 8).fill(0x241a10);
      g.rect(x, 10, barW * ratio, 8).fill(ratio > 0.35 ? 0x6ec06e : 0xe06c5a);
    };
    draw(this.playerHp, Math.max(0, player / max), w - 10 - barW); // player right (RTL)
    draw(this.enemyHp, Math.max(0, enemy / max), 10);
  }

  hatFlies(): void {
    this.hatOn = false;
  }

  enemyDies(): void {
    this.enemyDead = true;
    this.enemyFallT = 0;
    this.slowMoUntil = performance.now() + tuning.slowMoMs;
  }

  playerDies(): void {
    this.slowMoUntil = performance.now() + tuning.slowMoMs;
    this.shake = 10;
  }

  resetRound(): void {
    this.enemyDead = false;
    this.enemyFallT = 0;
    this.opponent.rotation = 0;
    this.opponent.position.set(0, 0);
    this.opponent.alpha = 1;
    this.hatOn = true;
    this.hat.rotation = 0;
    this.hat.position.set(0, 0);
    this.coinAnim = null;
    this.coin.visible = false;
    this.coinShadow.visible = false;
    this.reticle.visible = false;
    this.hideDrawText();
    this.timeScale = 1;
    for (const m of this.markers) {
      this.fx.removeChild(m.g);
      m.g.destroy();
    }
    this.markers = [];
    this.setHealth(1, 1);
  }

  destroy(): void {
    this.app?.destroy(true, { children: true });
  }

  /** Map an aim point to canvas px for logging/testing. */
  aimToPx(x: number, y: number): { x: number; y: number } {
    const app = this.app!;
    return {
      x: app.renderer.width / 2 + x * (app.renderer.width / 2 - 30),
      y: app.renderer.height * 0.57 - y * (app.renderer.height * 0.36),
    };
  }
}
