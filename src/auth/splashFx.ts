// 스플래시 배경 — 캐릭터들이 파친코 구슬처럼 떠다니고 튀며, 구슬이 쏟아지는 다이나믹 연출.
import { getCharImage, getPremiumImage } from "../render/symbols.js";

interface Floater {
  id: number;
  prem: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  spin: number;
  vspin: number;
  hue: number;
}
interface Ball {
  x: number;
  y: number;
  vy: number;
  r: number;
}

const GLOW = ["#2ee6c6", "#ffcf3a", "#ff5fa2", "#9b6cff", "#8fe9ff", "#6cff9b"];

export class SplashFx {
  private ctx: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;
  private dpr = 1;
  private floaters: Floater[] = [];
  private balls: Ball[] = [];
  private t = 0;
  private raf = 0;
  private last = 0;
  private running = false;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext("2d")!;
    this.resize();
    window.addEventListener("resize", () => this.resize());
  }

  private resize(): void {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    const rect = this.canvas.getBoundingClientRect();
    this.w = rect.width || window.innerWidth;
    this.h = rect.height || window.innerHeight;
    this.canvas.width = Math.floor(this.w * this.dpr);
    this.canvas.height = Math.floor(this.h * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (this.floaters.length === 0) this.spawn();
  }

  private spawn(): void {
    const n = Math.max(10, Math.floor(this.w / 130));
    for (let i = 0; i < n; i++) {
      const prem = Math.random() < 0.18;
      const r = (prem ? 70 : 46) + Math.random() * 34;
      this.floaters.push({
        id: 1 + ((Math.random() * 11) | 0),
        prem,
        x: Math.random() * this.w,
        y: Math.random() * this.h,
        vx: (Math.random() - 0.5) * 90,
        vy: (Math.random() - 0.5) * 90,
        r,
        spin: Math.random() * Math.PI * 2,
        vspin: (Math.random() - 0.5) * 1.2,
        hue: (Math.random() * GLOW.length) | 0,
      });
    }
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const loop = (now: number): void => {
      if (!this.running) return;
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.update(dt);
      this.draw();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  private update(dt: number): void {
    this.t += dt;
    for (const f of this.floaters) {
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      f.spin += f.vspin * dt;
      if (f.x < f.r) {
        f.x = f.r;
        f.vx = Math.abs(f.vx);
      } else if (f.x > this.w - f.r) {
        f.x = this.w - f.r;
        f.vx = -Math.abs(f.vx);
      }
      if (f.y < f.r) {
        f.y = f.r;
        f.vy = Math.abs(f.vy);
      } else if (f.y > this.h - f.r) {
        f.y = this.h - f.r;
        f.vy = -Math.abs(f.vy);
      }
    }
    // 구슬 쏟아짐.
    if (Math.random() < dt * 14) {
      this.balls.push({ x: Math.random() * this.w, y: -10, vy: 160 + Math.random() * 260, r: 3 + Math.random() * 4 });
    }
    for (const b of this.balls) {
      b.vy += 600 * dt;
      b.y += b.vy * dt;
    }
    this.balls = this.balls.filter((b) => b.y < this.h + 20);
  }

  private draw(): void {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.w, this.h);
    // 빛줄기.
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < 4; i++) {
      const a = this.t * 0.3 + (i * Math.PI) / 2;
      const g = ctx.createLinearGradient(this.w / 2, this.h / 2, this.w / 2 + Math.cos(a) * this.w, this.h / 2 + Math.sin(a) * this.h);
      g.addColorStop(0, "rgba(120,220,255,0.10)");
      g.addColorStop(1, "rgba(120,220,255,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(this.w / 2, this.h / 2);
      ctx.arc(this.w / 2, this.h / 2, this.w, a - 0.12, a + 0.12);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    // 쏟아지는 구슬.
    ctx.save();
    for (const b of this.balls) {
      const grad = ctx.createRadialGradient(b.x - b.r * 0.3, b.y - b.r * 0.3, b.r * 0.1, b.x, b.y, b.r);
      grad.addColorStop(0, "#ffffff");
      grad.addColorStop(1, "#5c6b7a");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // 캐릭터 플로터.
    for (const f of this.floaters) {
      const img = f.prem ? getPremiumImage(f.id) : getCharImage(f.id);
      const glow = GLOW[f.hue]!;
      const pulse = 0.6 + 0.4 * Math.sin(this.t * 2 + f.id);
      ctx.save();
      ctx.translate(f.x, f.y);
      ctx.rotate(Math.sin(f.spin) * 0.18);
      ctx.globalAlpha = 0.9;
      // 발광 배경.
      const bg = ctx.createRadialGradient(0, 0, f.r * 0.1, 0, 0, f.r);
      bg.addColorStop(0, hexA(glow, 0.5 * pulse));
      bg.addColorStop(1, hexA(glow, 0));
      ctx.fillStyle = bg;
      ctx.beginPath();
      ctx.arc(0, 0, f.r, 0, Math.PI * 2);
      ctx.fill();
      if (img && img.complete && img.naturalWidth > 0) {
        const ar = img.naturalWidth / img.naturalHeight;
        let dw = f.r * 1.8;
        let dh = dw / ar;
        if (dh > f.r * 1.8) {
          dh = f.r * 1.8;
          dw = dh * ar;
        }
        ctx.shadowColor = glow;
        ctx.shadowBlur = 24 * pulse;
        if (f.prem) {
          roundClip(ctx, -dw / 2, -dh / 2, dw, dh, 12);
        }
        ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
      }
      ctx.restore();
    }
  }
}

function hexA(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
function roundClip(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.clip();
}
