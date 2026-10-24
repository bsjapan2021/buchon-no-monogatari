// 오아다리 3연속 이상 — 화면 중앙 원자폭탄급 폭발(섬광·파이어볼·충격파·버섯구름·잔해).
// 캔버스로 그리는 오리지널 연출. 최상단 레이어.

interface Ember {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  life: number;
  maxLife: number;
}

function rgba(r: number, g: number, b: number, a: number): string {
  return `rgba(${r | 0},${g | 0},${b | 0},${a})`;
}

export class Nuke {
  private w = 0;
  private h = 0;
  private t = 0;
  private readonly dur = 3.8;
  private cx = 0;
  private cy = 0;
  private rings: { delay: number; life: number }[] = [];
  private embers: Ember[] = [];

  resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
  }

  isActive(): boolean {
    return this.t > 0;
  }

  start(w: number, h: number): void {
    this.w = w;
    this.h = h;
    this.t = this.dur;
    this.cx = w / 2;
    this.cy = h * 0.5;
    this.rings = [
      { delay: 0, life: 0 },
      { delay: 0.12, life: 0 },
      { delay: 0.26, life: 0 },
      { delay: 0.42, life: 0 },
    ];
    this.embers = [];
    const R = Math.min(w, h);
    for (let i = 0; i < 70; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = R * (0.5 + Math.random() * 1.6);
      this.embers.push({
        x: this.cx,
        y: this.cy,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - R * 0.35,
        r: R * 0.004 * (1 + Math.random() * 2.2),
        life: 0,
        maxLife: 1.2 + Math.random() * 1.8,
      });
    }
  }

  update(dt: number): void {
    if (this.t <= 0) return;
    this.t -= dt;
    const el = this.dur - this.t;
    for (const r of this.rings) if (el >= r.delay) r.life += dt;
    for (const e of this.embers) {
      e.life += dt;
      e.vy += this.h * 0.7 * dt;
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      e.vx *= 0.98;
    }
    this.embers = this.embers.filter((e) => e.life < e.maxLife);
  }

  draw(ctx: CanvasRenderingContext2D): void {
    if (this.t <= 0) return;
    const el = this.dur - this.t;
    const R = Math.min(this.w, this.h);
    ctx.save();

    // 1) 초기 눈부신 섬광(화면 전체).
    if (el < 0.55) {
      ctx.globalAlpha = Math.max(0, 1 - el / 0.55);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, this.w, this.h);
      ctx.globalAlpha = 1;
    }

    // 2) 버섯구름(상승 연기) — 뒤에.
    this.drawMushroom(ctx, el, R);

    // 3) 파이어볼(열구) — 불투명(source-over)으로 영상을 덮어 지배적으로.
    const fp = Math.min(1, el / 0.45);
    const fr = R * 0.62 * (1 - (1 - fp) ** 3);
    const cool = Math.min(1, el / 1.6);
    const fade = el < 1.5 ? 1 : Math.max(0, 1 - (el - 1.5) / 1.4);
    if (fade > 0) {
      ctx.globalCompositeOperation = "source-over";
      const g = ctx.createRadialGradient(this.cx, this.cy, fr * 0.06, this.cx, this.cy, fr);
      g.addColorStop(0, rgba(255, 255, 255, 1 * fade));
      g.addColorStop(0.26, rgba(255, 240 - cool * 90, 150 - cool * 80, 0.98 * fade));
      g.addColorStop(0.55, rgba(255, 140 - cool * 80, 30, 0.9 * fade));
      g.addColorStop(0.82, rgba(170, 45, 0, 0.6 * fade));
      g.addColorStop(1, rgba(90, 20, 0, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(this.cx, this.cy, fr, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalCompositeOperation = "lighter";

    // 4) 충격파 링.
    for (const r of this.rings) {
      if (r.life <= 0) continue;
      const p = Math.min(1, r.life / 1.1);
      const rad = R * 1.4 * (1 - (1 - p) ** 2);
      ctx.globalAlpha = Math.max(0, 1 - p) * 0.85;
      ctx.strokeStyle = "#fff4c2";
      ctx.lineWidth = Math.max(2, R * 0.035 * (1 - p));
      ctx.shadowColor = "#ffcf3a";
      ctx.shadowBlur = 24;
      ctx.beginPath();
      ctx.arc(this.cx, this.cy, rad, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;

    // 5) 잔해 엠버.
    for (const e of this.embers) {
      const a = Math.max(0, 1 - e.life / e.maxLife);
      ctx.globalAlpha = a;
      ctx.fillStyle = rgba(255, 150 * a + 40, 20, 1);
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  private drawMushroom(ctx: CanvasRenderingContext2D, el: number, R: number): void {
    const rise = Math.min(this.cy * 0.92, el * this.h * 0.26);
    const capY = this.cy - rise;
    const grow = Math.min(1, el / 2.2);
    const hot = el < 1.3;
    ctx.save();
    // 기둥(스템).
    const stemW = R * 0.07 * (0.6 + grow);
    const sg = ctx.createLinearGradient(0, this.cy, 0, capY);
    sg.addColorStop(0, rgba(90, 60, 40, 0));
    sg.addColorStop(0.35, rgba(130, 85, 55, 0.5));
    sg.addColorStop(1, rgba(160, 115, 75, 0.6));
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.moveTo(this.cx - stemW * 0.5, this.cy);
    ctx.lineTo(this.cx - stemW, capY);
    ctx.lineTo(this.cx + stemW, capY);
    ctx.lineTo(this.cx + stemW * 0.5, this.cy);
    ctx.closePath();
    ctx.fill();
    // 갓(cap) — 뭉게뭉게 레이어드.
    const capR = R * 0.32 * grow;
    const puffs: [number, number, number][] = [
      [0, 0, 1],
      [-0.62, 0.12, 0.7],
      [0.62, 0.12, 0.7],
      [-0.34, -0.26, 0.62],
      [0.34, -0.26, 0.62],
      [0, -0.36, 0.72],
      [-0.9, 0.28, 0.5],
      [0.9, 0.28, 0.5],
    ];
    for (const [dx, dy, s] of puffs) {
      const px = this.cx + dx * capR;
      const py = capY + dy * capR;
      const pr = capR * 0.6 * s;
      const cg = ctx.createRadialGradient(px, py, pr * 0.2, px, py, pr);
      cg.addColorStop(0, hot ? rgba(255, 180, 80, 0.5) : rgba(150, 120, 92, 0.55));
      cg.addColorStop(1, rgba(70, 52, 40, 0));
      ctx.fillStyle = cg;
      ctx.beginPath();
      ctx.arc(px, py, pr, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}
