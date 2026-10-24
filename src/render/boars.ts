// 오아다리 연출 — 멧돼지(아프리카 멧돼지) 떼가 오른쪽→왼쪽으로 질주 + 흙먼지.
// 캔버스로 그리는 오리지널 애니메이션(어두운 실루엣 + 다리 질주 모션 + 모션블러 + 먼지 구름).

interface Boar {
  x: number;
  y: number; // 지면(발 위치)
  s: number; // 크기(원근)
  vx: number; // 좌로 이동(음수)
  phase: number; // 다리 사이클
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
  tone: number; // 흙색 밝기
}

export class Stampede {
  private boars: Boar[] = [];
  private dust: Dust[] = [];
  private w = 0;
  private h = 0;
  private t = 0; // 남은 연출 시간
  private spawnT = 0;

  resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
  }

  isActive(): boolean {
    return this.t > 0 || this.boars.length > 0 || this.dust.length > 0;
  }

  /** 멧돼지 떼 질주 시작. */
  start(w: number, h: number): void {
    this.w = w;
    this.h = h;
    this.t = 3.4; // 멧돼지 떼가 쏟아지는 시간
    this.spawnT = 0;
    // 선두 무리 즉시 몇 마리.
    for (let i = 0; i < 6; i++) this.spawnBoar(true);
    // 뒤편 먼지 벽.
    for (let i = 0; i < 26; i++) {
      this.dust.push({
        x: this.w + Math.random() * this.w * 0.5,
        y: this.groundY() - Math.random() * this.h * 0.35,
        r: this.h * (0.08 + Math.random() * 0.14),
        grow: this.h * 0.05,
        life: 0,
        maxLife: 1.6 + Math.random() * 1.4,
        alpha: 0.28 + Math.random() * 0.25,
        tone: 180 + ((Math.random() * 40) | 0),
      });
    }
  }

  private groundY(): number {
    return this.h * 0.9;
  }

  private spawnBoar(front: boolean): void {
    const s = this.h * (0.16 + Math.random() * 0.14);
    const speed = this.w * (0.42 + Math.random() * 0.24);
    this.boars.push({
      x: this.w + s * 1.4 + (front ? Math.random() * this.w * 0.4 : 0),
      y: this.groundY() - Math.random() * this.h * 0.18,
      s,
      vx: -speed * (0.85 + s / (this.h * 0.3)), // 큰(가까운) 놈이 빠르게
      phase: Math.random() * Math.PI * 2,
      phaseV: 15 + Math.random() * 6,
      dustT: 0,
    });
  }

  update(dt: number): void {
    if (this.t > 0) {
      this.t -= dt;
      this.spawnT -= dt;
      if (this.spawnT <= 0 && this.t > 0.4) {
        this.spawnT = 0.09 + Math.random() * 0.12;
        this.spawnBoar(false);
        if (Math.random() < 0.5) this.spawnBoar(false);
      }
    }
    for (const b of this.boars) {
      b.x += b.vx * dt;
      b.phase += b.phaseV * dt;
      b.dustT -= dt;
      if (b.dustT <= 0) {
        b.dustT = 0.04;
        // 발굽 먼지.
        this.dust.push({
          x: b.x + b.s * (0.6 + Math.random() * 0.4),
          y: b.y - b.s * 0.02,
          r: b.s * (0.18 + Math.random() * 0.18),
          grow: b.s * 0.9,
          life: 0,
          maxLife: 0.7 + Math.random() * 0.7,
          alpha: 0.3 + Math.random() * 0.25,
          tone: 185 + ((Math.random() * 45) | 0),
        });
      }
    }
    this.boars = this.boars.filter((b) => b.x > -b.s * 2);
    for (const d of this.dust) {
      d.life += dt;
      const k = d.life / d.maxLife;
      d.r += d.grow * dt;
      d.x -= this.w * 0.12 * dt; // 먼지도 살짝 좌로 흐름
      d.y -= this.h * 0.03 * dt * (1 - k); // 위로 피어오름
    }
    this.dust = this.dust.filter((d) => d.life < d.maxLife);
  }

  draw(ctx: CanvasRenderingContext2D): void {
    if (!this.isActive()) return;
    ctx.save();
    // 흙먼지 분위기(따뜻한 베이지 비네트).
    const amb = this.t > 0 ? Math.min(1, this.t / 1.2) : Math.min(1, this.boars.length / 6);
    if (amb > 0) {
      const g = ctx.createLinearGradient(0, this.h * 0.4, 0, this.h);
      g.addColorStop(0, `rgba(120,95,60,0)`);
      g.addColorStop(1, `rgba(150,120,75,${0.28 * amb})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, this.w, this.h);
    }
    // 뒤쪽 먼지(멧돼지 뒤).
    this.drawDust(ctx, true);
    // 멧돼지(뒤→앞: 작은 것 먼저).
    const order = [...this.boars].sort((a, b) => a.s - b.s);
    for (const b of order) this.drawBoar(ctx, b);
    // 앞쪽 먼지(발밑).
    this.drawDust(ctx, false);
    ctx.restore();
  }

  private drawDust(ctx: CanvasRenderingContext2D, back: boolean): void {
    for (const d of this.dust) {
      // back=큰 먼지(벽), front=작은 발굽 먼지 대략 분리.
      const isBack = d.grow > this.h * 0.2;
      if (isBack !== back) continue;
      const k = d.life / d.maxLife;
      const a = d.alpha * Math.sin(Math.min(1, k) * Math.PI);
      ctx.fillStyle = `rgba(${d.tone},${d.tone - 25},${d.tone - 70},${a})`;
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawBoar(ctx: CanvasRenderingContext2D, b: Boar): void {
    const s = b.s;
    const cy = b.y - s * 0.6; // 몸통 중심
    ctx.save();
    ctx.translate(b.x, cy);

    // 지면 그림자.
    ctx.save();
    ctx.translate(0, s * 0.6);
    ctx.fillStyle = "rgba(20,12,5,0.4)";
    ctx.beginPath();
    ctx.ellipse(0, 0, s * 1.15, s * 0.16, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 모션블러(뒤쪽으로 반투명 잔상).
    for (let i = 3; i >= 1; i--) {
      ctx.save();
      ctx.globalAlpha = 0.1 * i;
      ctx.translate(s * 0.22 * i, 0);
      this.boarBody(ctx, s, b.phase, true);
      ctx.restore();
    }

    // 다리(질주).
    this.boarLegs(ctx, s, b.phase);
    // 몸통.
    this.boarBody(ctx, s, b.phase, false);
    ctx.restore();
  }

  private boarLegs(ctx: CanvasRenderingContext2D, s: number, phase: number): void {
    const legs: [number, number][] = [
      [-0.55, 0], // 앞 왼
      [-0.45, Math.PI], // 앞 오
      [0.5, Math.PI * 0.5], // 뒤 왼
      [0.6, Math.PI * 1.5], // 뒤 오
    ];
    ctx.strokeStyle = "#1a1109";
    ctx.lineCap = "round";
    for (const [hx, off] of legs) {
      const sw = Math.sin(phase + off);
      const knee = sw * 0.5;
      const footX = hx * s + knee * s * 0.5;
      const footY = s * 0.55 + Math.max(0, -sw) * s * 0.18; // 들릴 땐 위로
      ctx.lineWidth = s * 0.16;
      ctx.beginPath();
      ctx.moveTo(hx * s, s * 0.1);
      ctx.quadraticCurveTo(hx * s + knee * s * 0.4, s * 0.35, footX, footY);
      ctx.stroke();
    }
  }

  private boarBody(ctx: CanvasRenderingContext2D, s: number, phase: number, flat: boolean): void {
    const bob = Math.sin(phase * 2) * s * 0.04;
    ctx.save();
    ctx.translate(0, bob);
    // 몸통 실루엣(머리는 왼쪽).
    ctx.beginPath();
    ctx.moveTo(-1.35 * s, 0.12 * s); // 주둥이 끝
    ctx.lineTo(-1.1 * s, -0.12 * s);
    ctx.quadraticCurveTo(-0.9 * s, -0.42 * s, -0.55 * s, -0.46 * s); // 이마
    ctx.quadraticCurveTo(-0.1 * s, -0.6 * s, 0.35 * s, -0.46 * s); // 등(갈기)
    ctx.quadraticCurveTo(0.8 * s, -0.4 * s, 1.0 * s, -0.22 * s); // 엉덩이
    ctx.lineTo(1.05 * s, 0.05 * s);
    ctx.quadraticCurveTo(0.9 * s, 0.3 * s, 0.4 * s, 0.34 * s); // 배 뒤
    ctx.quadraticCurveTo(-0.2 * s, 0.4 * s, -0.7 * s, 0.3 * s); // 배 앞
    ctx.lineTo(-1.2 * s, 0.26 * s); // 턱
    ctx.closePath();
    if (flat) {
      ctx.fillStyle = "#000";
      ctx.fill();
      ctx.restore();
      return;
    }
    const grad = ctx.createLinearGradient(0, -0.6 * s, 0, 0.4 * s);
    grad.addColorStop(0, "#4a3827");
    grad.addColorStop(0.5, "#2c2015");
    grad.addColorStop(1, "#15100a");
    ctx.fillStyle = grad;
    ctx.fill();
    // 등 갈기(뻣뻣한 털).
    ctx.strokeStyle = "#5a4630";
    ctx.lineWidth = s * 0.03;
    for (let i = 0; i <= 8; i++) {
      const tx = (-0.5 + i * 0.1) * s;
      const ty = -0.46 * s - Math.sin(i) * 0.02 * s;
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(tx + 0.02 * s, ty - 0.16 * s);
      ctx.stroke();
    }
    // 귀.
    ctx.fillStyle = "#2c2015";
    ctx.beginPath();
    ctx.moveTo(-0.55 * s, -0.4 * s);
    ctx.lineTo(-0.42 * s, -0.62 * s);
    ctx.lineTo(-0.32 * s, -0.42 * s);
    ctx.closePath();
    ctx.fill();
    // 엄니(흰 송곳니).
    ctx.strokeStyle = "#e8e0cf";
    ctx.lineWidth = s * 0.05;
    ctx.beginPath();
    ctx.moveTo(-1.15 * s, 0.14 * s);
    ctx.quadraticCurveTo(-1.3 * s, 0.05 * s, -1.22 * s, -0.08 * s);
    ctx.stroke();
    // 눈.
    ctx.fillStyle = "#ffcf3a";
    ctx.beginPath();
    ctx.arc(-0.78 * s, -0.22 * s, s * 0.05, 0, Math.PI * 2);
    ctx.fill();
    // 꼬리.
    ctx.strokeStyle = "#2c2015";
    ctx.lineWidth = s * 0.05;
    ctx.beginPath();
    ctx.moveTo(1.02 * s, -0.15 * s);
    ctx.quadraticCurveTo(1.25 * s, -0.25 * s, 1.2 * s, 0.05 * s);
    ctx.stroke();
    ctx.restore();
  }
}
