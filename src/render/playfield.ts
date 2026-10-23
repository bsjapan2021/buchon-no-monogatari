// 파친코 물리 필드 — 못(釘) + 구슬 낙하/충돌/반동 + 중앙 패널 하단 입상 구멍.
// 구슬은 왼쪽 아래에서 발사되어 레일을 타고 올라간 뒤 중력으로 떨어지고,
// 못에 부딪혀 확률적으로 튕기다 구멍에 들어가면 입상(入賞)으로 처리한다.
// (유도는 못으로만 — 매끄러운 벽은 사용하지 않는다.)

export interface Pin {
  x: number;
  y: number;
  r: number;
}

interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  sink: number; // >0 이면 구멍에 빨려드는 중
  rail: number; // 레일 위 이동거리(>=0), -1이면 자유낙하
  relArc: number; // 릴리스(레일 이탈) 지점 arc
}

export interface PanelRect {
  x: number;
  y: number;
  w: number;
  h: number;
  r: number;
}

const REST = 0.5; // 반발계수
const JITTER = 50; // 못 충돌 시 접선 난수 (px/s)

export class Playfield {
  pins: Pin[] = [];
  private balls: Ball[] = [];
  private w = 0;
  private h = 0;
  private panel: PanelRect = { x: 0, y: 0, w: 0, h: 0, r: 0 };
  private hole = { x: 0, y: 0, halfW: 0 };
  private ballR = 8;
  private pinR = 3;
  private g = 1400;
  // 발사 레일.
  private railMargin = 16;
  private railTopY = 16;
  private railBottomY = 0;
  private railL1 = 0;
  private railSpeed = 0;

  get ballCount(): number {
    return this.balls.length;
  }

  layout(w: number, h: number, panel: PanelRect, holeMouthY: number): void {
    this.w = w;
    this.h = h;
    this.panel = panel;
    this.ballR = Math.max(5, Math.min(w, h) * 0.011);
    this.pinR = Math.max(2.5, this.ballR * 0.42);
    this.g = h * 2.1;
    this.hole = { x: w / 2, y: holeMouthY, halfW: this.ballR * 5 };
    this.railMargin = this.ballR * 1.8;
    this.railTopY = h * 0.025;
    this.railBottomY = h - this.ballR * 1.8;
    this.railL1 = this.railBottomY - this.railTopY;
    this.railSpeed = h * 1.8;
    this.buildPins();
  }

  private insidePanel(x: number, y: number): boolean {
    const p = this.panel;
    const m = this.ballR + this.pinR;
    return x > p.x - m && x < p.x + p.w + m && y > p.y - m && y < p.y + p.h + m;
  }

  private nearHole(x: number, y: number): boolean {
    return Math.abs(x - this.hole.x) < this.hole.halfW * 1.6 && Math.abs(y - this.hole.y) < this.ballR * 3;
  }

  private fill(x0: number, y0: number, x1: number, y1: number, sp: number): void {
    let row = 0;
    for (let y = y0; y <= y1; y += sp * 0.87) {
      const offx = row % 2 ? sp / 2 : 0;
      for (let x = x0 + offx; x <= x1; x += sp) {
        if (this.insidePanel(x, y) || this.nearHole(x, y)) continue;
        this.pins.push({ x, y, r: this.pinR });
      }
      row++;
    }
  }

  private buildPins(): void {
    this.pins = [];
    const p = this.panel;
    // 못 간격을 넓혀 정체(구슬 끼임)를 줄인다.
    const sp = this.ballR * 5.4;
    const margin = this.ballR * 3;
    const panelBottom = p.y + p.h;
    const cx = this.hole.x; // 중앙
    // 상단 밴드 (패널 위) — 중앙 스플리터 영역은 비워둔다.
    this.fill(margin, this.h * 0.1, this.w - margin, p.y - sp * 0.6, sp);
    // 좌/우 채널.
    this.fill(margin, p.y, p.x - sp * 0.4, this.hole.y - sp * 0.4, sp);
    this.fill(p.x + p.w + sp * 0.4, p.y, this.w - margin, this.hole.y - sp * 0.4, sp);
    // 하단 밴드 (패널 아래).
    this.fill(margin, panelBottom + sp * 0.5, this.w - margin, this.hole.y - sp * 0.4, sp);

    // 중앙 스플리터(▲): 중앙으로 떨어진 구슬을 좌우로 가른다.
    const apexY = p.y - sp * 1.6;
    const arm = p.w * 0.34;
    const steps = 5;
    this.pins.push({ x: cx, y: apexY, r: this.pinR });
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const y = apexY + sp * 1.1 * t;
      this.pins.push({ x: cx - arm * t, y, r: this.pinR });
      this.pins.push({ x: cx + arm * t, y, r: this.pinR });
    }

    // 유도 못(道釘): 중앙 구멍으로 완만히 모으는 대칭 V형 못줄.
    const gy0 = panelBottom + sp * 0.6;
    const gy1 = this.hole.y - this.ballR * 1.2;
    const guide = (fromX: number, toX: number): void => {
      const n = 6;
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const x = fromX + (toX - fromX) * t;
        const y = gy0 + (gy1 - gy0) * t;
        if (!this.nearHole(x, y)) this.pins.push({ x, y, r: this.pinR });
      }
    };
    guide(this.w * 0.3, cx - this.hole.halfW * 1.1);
    guide(this.w * 0.7, cx + this.hole.halfW * 1.1);
    // 명釘(게이트): 구멍 입구 양옆.
    this.pins.push({ x: cx - this.hole.halfW - this.pinR * 1.4, y: this.hole.y - this.ballR * 0.3, r: this.pinR });
    this.pins.push({ x: cx + this.hole.halfW + this.pinR * 1.4, y: this.hole.y - this.ballR * 0.3, r: this.pinR });
  }

  /** 왼쪽 아래에서 구슬 1개 발사 (레일 → 상단 → 중앙 낙하). */
  launch(): void {
    if (this.balls.length > 150) return;
    // 중앙 근처로 떨어뜨려 좌우로 갈라지게 한다(한쪽 치우침 방지).
    const releaseX = this.w * (0.46 + Math.random() * 0.08);
    const relArc = this.railL1 + (releaseX - this.railMargin);
    this.balls.push({
      x: this.railMargin,
      y: this.railBottomY,
      vx: 0,
      vy: 0,
      r: this.ballR,
      sink: 0,
      rail: 0,
      relArc,
    });
  }

  update(dt: number): number {
    const sub = Math.min(5, Math.max(1, Math.ceil(dt / 0.006)));
    const hdt = dt / sub;
    let scored = 0;
    for (let s = 0; s < sub; s++) {
      for (const b of this.balls) {
        if (b.sink > 0) {
          b.sink += hdt;
          b.x += (this.hole.x - b.x) * 0.3;
          continue;
        }
        if (b.rail >= 0) {
          this.rideRail(b, hdt);
          continue;
        }
        b.vy += this.g * hdt;
        // 하단(패널 아래)은 가운데 구멍으로 강하게 유도 — 기울어진 필드 효과.
        // 갈라진 구슬이 중앙 구멍으로 다시 모이도록 아래로 갈수록 강해진다.
        if (b.y > this.panel.y + this.panel.h) {
          const depth = Math.min(1, (b.y - (this.panel.y + this.panel.h)) / Math.max(1, this.hole.y - (this.panel.y + this.panel.h)));
          b.vx += (this.hole.x - b.x) * (8 + 14 * depth) * hdt;
        }
        b.x += b.vx * hdt;
        b.y += b.vy * hdt;
        this.collidePins(b);
        this.collidePanel(b);
        if (b.x < b.r) {
          b.x = b.r;
          b.vx = Math.abs(b.vx) * REST;
        } else if (b.x > this.w - b.r) {
          b.x = this.w - b.r;
          b.vx = -Math.abs(b.vx) * REST;
        }
        if (b.vy > 0 && b.y + b.r >= this.hole.y && Math.abs(b.x - this.hole.x) <= this.hole.halfW) {
          b.sink = 0.0001;
          scored++;
        }
      }
    }
    // 끼임 방지: 매우 느린 구슬은 수평 난수로 흔들어 떨군다.
    for (const b of this.balls) {
      if (b.sink > 0 || b.rail >= 0) continue;
      if (b.vx * b.vx + b.vy * b.vy < 450) b.vx += (Math.random() - 0.5) * 110;
    }
    this.balls = this.balls.filter((b) => b.sink <= 0.18 && b.y <= this.h + b.r * 3);
    return scored;
  }

  private rideRail(b: Ball, hdt: number): void {
    b.rail += this.railSpeed * hdt;
    if (b.rail >= b.relArc) {
      // 레일 이탈 → 거의 수직 낙하(좌우 미세 난수만). 오른쪽 치우침 제거.
      b.rail = -1;
      b.x = this.railMargin + (b.relArc - this.railL1);
      b.y = this.railTopY;
      b.vx = (Math.random() - 0.5) * 40;
      b.vy = 20;
    } else if (b.rail < this.railL1) {
      b.x = this.railMargin;
      b.y = this.railBottomY - b.rail;
    } else {
      b.x = this.railMargin + (b.rail - this.railL1);
      b.y = this.railTopY;
    }
  }

  private collidePins(b: Ball): void {
    for (const pin of this.pins) {
      const dx = b.x - pin.x;
      const dy = b.y - pin.y;
      const rr = b.r + pin.r;
      const d2 = dx * dx + dy * dy;
      if (d2 >= rr * rr || d2 === 0) continue;
      const d = Math.sqrt(d2);
      const nx = dx / d;
      const ny = dy / d;
      const push = rr - d;
      b.x += nx * push;
      b.y += ny * push;
      const vn = b.vx * nx + b.vy * ny;
      if (vn < 0) {
        b.vx -= (1 + REST) * vn * nx;
        b.vy -= (1 + REST) * vn * ny;
        b.vx += (Math.random() - 0.5) * JITTER;
      }
    }
  }

  private collidePanel(b: Ball): void {
    const p = this.panel;
    const nx = Math.max(p.x, Math.min(b.x, p.x + p.w));
    const ny = Math.max(p.y, Math.min(b.y, p.y + p.h));
    const dx = b.x - nx;
    const dy = b.y - ny;
    const d2 = dx * dx + dy * dy;
    if (d2 >= b.r * b.r) return;
    if (d2 > 0.0001) {
      const d = Math.sqrt(d2);
      const ux = dx / d;
      const uy = dy / d;
      b.x = nx + ux * b.r;
      b.y = ny + uy * b.r;
      const vn = b.vx * ux + b.vy * uy;
      if (vn < 0) {
        b.vx -= (1 + REST) * vn * ux;
        b.vy -= (1 + REST) * vn * uy;
      }
      // 패널 윗면에 얹히면 가까운 쪽으로 흘려보낸다(쌓임 방지).
      if (uy < -0.6 && Math.abs(b.vx) < 70) {
        b.vx += (b.x < p.x + p.w / 2 ? -1 : 1) * 130;
      }
    } else {
      b.y = p.y - b.r;
      b.vy = -Math.abs(b.vy) * REST;
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    // 발사 레일 (좌측 세로 + 상단 가로).
    ctx.save();
    ctx.strokeStyle = "rgba(170,205,230,0.85)";
    ctx.lineWidth = this.pinR * 1.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.shadowColor = "rgba(170,205,230,0.5)";
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.moveTo(this.railMargin, this.railBottomY);
    ctx.lineTo(this.railMargin, this.railTopY);
    ctx.lineTo(this.w * 0.9, this.railTopY);
    ctx.stroke();
    ctx.restore();

    // 입상 구멍 (포켓).
    const ho = this.hole;
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.strokeStyle = "#ffcf3a";
    ctx.lineWidth = 3;
    ctx.shadowColor = "#ffcf3a";
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.ellipse(ho.x, ho.y + this.ballR * 0.6, ho.halfW, this.ballR * 1.1, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // 못(釘) — 금속 샤프트 + 둥근 머리.
    ctx.save();
    for (const pin of this.pins) {
      ctx.strokeStyle = "rgba(190,210,225,0.8)";
      ctx.lineWidth = pin.r * 0.9;
      ctx.beginPath();
      ctx.moveTo(pin.x, pin.y);
      ctx.lineTo(pin.x, pin.y + pin.r * 2.2);
      ctx.stroke();
      ctx.fillStyle = "#e8f2ff";
      ctx.beginPath();
      ctx.arc(pin.x, pin.y, pin.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // 구슬 — 금속 질감.
    ctx.save();
    for (const b of this.balls) {
      const scale = b.sink > 0 ? Math.max(0.1, 1 - b.sink / 0.18) : 1;
      const r = b.r * scale;
      const grad = ctx.createRadialGradient(b.x - r * 0.35, b.y - r * 0.35, r * 0.1, b.x, b.y, r);
      grad.addColorStop(0, "#ffffff");
      grad.addColorStop(0.4, "#c8d4e0");
      grad.addColorStop(1, "#5c6b7a");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}
