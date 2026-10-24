// 오아다리 연출 — 누끼 딴 멧돼지 개별 스프라이트가 "한 마리씩" 오른쪽→왼쪽으로 질주.
// 크기는 작게(이전 밴드의 ~1/3), 갤럽 바운스 + 발밑 소량 먼지로 달리는 느낌.
import a1 from "../assets/boars/wh_a1.png";
import a2 from "../assets/boars/wh_a2.png";
import b1 from "../assets/boars/wh_b1.png";
import pairImg from "../assets/boars/wh_pair.png";

const SRCS = [a1, a2, b1, pairImg];
const IMGS: HTMLImageElement[] = SRCS.map((s) => {
  const im = new Image();
  im.src = s;
  return im;
});
// 0,1 = 어른, 2 = 새끼, 3 = 어미+새끼. 등장 비중(어른·새끼 위주).
const PICK = [0, 1, 0, 1, 2, 2, 2, 3];

interface Boar {
  img: HTMLImageElement;
  ar: number; // w/h
  x: number; // 좌측
  ground: number; // 발 위치 y
  h: number;
  vx: number;
  phase: number;
  phaseV: number;
  dustT: number;
}
interface Dust {
  x: number;
  y: number;
  r: number;
  grow: number;
  life: number;
  maxLife: number;
  alpha: number;
}

export class Stampede {
  private boars: Boar[] = [];
  private dust: Dust[] = [];
  private w = 0;
  private h = 0;
  private t = 0;
  private spawnT = 0;
  private readonly dur = 2.8;

  resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
  }

  isActive(): boolean {
    return this.t > 0 || this.boars.length > 0;
  }

  /** 멧돼지 떼 질주 시작. 질주 중이면 재시작하지 않음. */
  start(w: number, h: number): void {
    this.w = w;
    this.h = h;
    if (this.t > 0) return;
    this.t = this.dur;
    this.spawnT = 0;
    for (let i = 0; i < 8; i++) this.spawnBoar(Math.random() * this.w * 0.5);
  }

  private spawnBoar(extra = 0): void {
    const kind = PICK[(Math.random() * PICK.length) | 0]!;
    const img = IMGS[kind]!;
    const ar = img.naturalWidth > 0 ? img.naturalWidth / img.naturalHeight : 1.3;
    const baby = kind === 2;
    const depth = Math.random(); // 0=먼(작고 위), 1=가까운(크고 아래)
    const hh = baby ? this.h * (0.05 + depth * 0.025) : this.h * (0.075 + depth * 0.035);
    const ground = this.h * (0.82 + depth * 0.14); // 바닥 쪽에서 질주
    const cross = 1.5 + Math.random() * 0.8; // 화면 통과 시간(초)
    const w = hh * ar;
    this.boars.push({
      img,
      ar,
      x: this.w + extra,
      ground,
      h: hh,
      vx: -(this.w + w + 40) / cross,
      phase: Math.random() * Math.PI * 2,
      phaseV: 15 + Math.random() * 7,
      dustT: 0,
    });
  }

  update(dt: number): void {
    if (this.t > 0) {
      this.t -= dt;
      this.spawnT -= dt;
      if (this.spawnT <= 0 && this.t > 0.5) {
        this.spawnT = 0.07 + Math.random() * 0.1;
        this.spawnBoar();
        this.spawnBoar();
        if (Math.random() < 0.5) this.spawnBoar();
      }
    }
    for (const b of this.boars) {
      b.x += b.vx * dt;
      b.phase += b.phaseV * dt;
      b.dustT -= dt;
      if (b.dustT <= 0) {
        b.dustT = 0.06;
        this.dust.push({
          x: b.x + b.h * b.ar * (0.3 + Math.random() * 0.4),
          y: b.ground,
          r: b.h * (0.1 + Math.random() * 0.12),
          grow: b.h * 0.5,
          life: 0,
          maxLife: 0.5 + Math.random() * 0.5,
          alpha: 0.22 + Math.random() * 0.16,
        });
      }
    }
    this.boars = this.boars.filter((b) => b.x > -b.h * b.ar - 20);
    for (const d of this.dust) {
      d.life += dt;
      d.r += d.grow * dt;
      d.x -= this.w * 0.08 * dt;
      d.y -= this.h * 0.02 * dt;
    }
    this.dust = this.dust.filter((d) => d.life < d.maxLife);
  }

  draw(ctx: CanvasRenderingContext2D): void {
    if (!this.isActive()) return;
    ctx.save();
    // 발밑 소량 먼지(멧돼지 뒤에).
    for (const d of this.dust) {
      const k = d.life / d.maxLife;
      const a = d.alpha * Math.sin(Math.min(1, k) * Math.PI);
      ctx.fillStyle = `rgba(200,178,130,${a})`;
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
      ctx.fill();
    }
    // 멧돼지(뒤→앞: 위에 있는=먼 것 먼저).
    const order = [...this.boars].sort((a, b) => a.ground - b.ground);
    for (const b of order) {
      const w = b.h * b.ar;
      const bob = Math.abs(Math.sin(b.phase)) * b.h * 0.13; // 갤럽 바운스
      const yTop = b.ground - b.h - bob;
      // 지면 그림자.
      ctx.fillStyle = `rgba(20,14,6,${0.28 * (1 - bob / (b.h * 0.2))})`;
      ctx.beginPath();
      ctx.ellipse(b.x + w * 0.5, b.ground, w * 0.42, b.h * 0.07, 0, 0, Math.PI * 2);
      ctx.fill();
      if (b.img.complete && b.img.naturalWidth > 0) {
        ctx.drawImage(b.img, b.x, yTop, w, b.h);
      }
    }
    ctx.restore();
  }
}
