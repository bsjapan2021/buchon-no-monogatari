// 당첨(오아다리/리치) 시 구슬이 투명 플라스틱 박스(받침)에 떨어져 실시간으로 쌓이는 연출.
// 중력 낙하 + 벽 반동 + 컬럼별 파일(pile) 적층으로 리얼하게 차오른다.

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  settled: boolean;
  hue: number;
}

// 지급 속도 — 1,000구(한 박스)를 약 3분에 걸쳐 받는다. 금액에 비례(60구 ≈ 11초, 1,500구 ≈ 4분 30초).
export const SECONDS_PER_1000_BALLS = 180;
const MIN_DURATION = 3; // 소액 당첨도 최소 이 시간은 쌓이는 연출을 보여준다
const BALL_R_RATIO = 0.015; // 박스 폭 대비 구슬 반지름 — 1,000구 박스가 시각적으로 가득 차도록 작게
const FALL_TIME = 0.7; // 박스 상단→바닥 낙하 시간(초) — 마지막 구슬이 이 시간 뒤 안착
const ROLL_REACH = 3; // 안착 시 좌우로 굴러갈 수 있는 최대 칸 수

/** 금액(구슬)에 대한 지급 연출 시간(초). */
export function payoutDuration(amount: number): number {
  return Math.max(MIN_DURATION, (amount / 1000) * SECONDS_PER_1000_BALLS);
}

export class PayoutBox {
  private balls: Ball[] = [];
  private cols: number[] = []; // 컬럼별 적층 개수
  private colW = 1;
  private ballR = 6;
  private total = 0; // 이번 당첨의 시각적 구슬 총수
  private spawned = 0;
  private settledCount = 0;
  private spawnAcc = 0;
  private spawnRate = 0;

  active = false;
  done = true;

  /** 당첨 금액(구슬)만큼 적립 연출 시작. 1,000구 ≈ 3분 속도로 천천히 쏟아진다. */
  start(amount: number, rect: Rect): void {
    this.active = true;
    this.done = false;
    this.spawned = 0;
    this.settledCount = 0;
    this.spawnAcc = 0;
    this.balls = [];
    this.ballR = Math.max(4, rect.w * BALL_R_RATIO);
    const C = Math.max(8, Math.floor(rect.w / (this.ballR * 2.05)));
    this.cols = new Array(C).fill(0);
    this.colW = rect.w / C;
    // 박스 수용량(상단 BONUS 표기 영역 제외) — 1,000구에 박스 한 개가 가득 차도록 시각 구슬 수를 정한다.
    const dia = this.ballR * 2 * 0.86;
    const rows = Math.max(4, Math.floor((rect.h * 0.84) / dia));
    const capacity = C * rows;
    this.total = Math.max(12, Math.min(capacity, Math.round((capacity * amount) / 1000)));
    // 마지막 구슬이 지급 시간 끝에 안착하도록 스폰 간격을 고르게 분배.
    const duration = payoutDuration(amount);
    this.spawnRate = this.total / Math.max(0.5, duration - FALL_TIME);
  }

  /** @returns 이번 프레임에 새로 바닥/파일에 안착한 구슬 수(사운드 트리거용). */
  update(dt: number, rect: Rect): number {
    if (!this.active) return 0;
    // 레이아웃이 바뀌면 컬럼 폭만 갱신.
    this.colW = rect.w / this.cols.length;
    this.ballR = Math.max(4, rect.w * BALL_R_RATIO);

    // 스폰(위에서 쏟아짐).
    this.spawnAcc += dt * this.spawnRate;
    while (this.spawned < this.total && this.spawnAcc >= 1) {
      this.spawnAcc -= 1;
      this.spawned++;
      this.balls.push({
        x: rect.x + rect.w * (0.08 + Math.random() * 0.84), // 박스 폭 전체로 쏟아져 고르게 쌓이게
        y: rect.y - this.ballR - Math.random() * rect.h * 0.15,
        vx: (Math.random() - 0.5) * rect.w * 0.25,
        vy: 0,
        r: this.ballR * (0.92 + Math.random() * 0.16),
        settled: false,
        hue: 42 + Math.random() * 10, // 금속 금색 계열
      });
    }

    const floorBase = rect.y + rect.h;
    const g = rect.h * 4.2; // 중력
    let newly = 0;
    for (const b of this.balls) {
      if (b.settled) continue;
      b.vy += g * dt;
      b.y += b.vy * dt;
      b.x += b.vx * dt;
      b.vx *= 0.985;
      // 측벽 반동.
      if (b.x < rect.x + b.r) {
        b.x = rect.x + b.r;
        b.vx = Math.abs(b.vx) * 0.45;
      }
      if (b.x > rect.x + rect.w - b.r) {
        b.x = rect.x + rect.w - b.r;
        b.vx = -Math.abs(b.vx) * 0.45;
      }
      // 안착 판정 — 해당 컬럼의 현재 파일 높이 위에 얹힌다.
      let col = Math.max(0, Math.min(this.cols.length - 1, Math.floor((b.x - rect.x) / this.colW)));
      const dia = b.r * 2 * 0.86;
      const restY = floorBase - (this.cols[col]! + 0.5) * dia - 2;
      if (b.y >= restY) {
        // 구르기 — 옆 칸이 더 낮으면 굴러 내려가 박스 전체가 고르게 차오른다(가운데만 탑처럼 솟지 않게).
        col = this.rollDown(col);
        b.y = floorBase - (this.cols[col]! + 0.5) * dia - 2;
        b.x = rect.x + (col + 0.5) * this.colW + (Math.random() - 0.5) * this.colW * 0.3;
        b.settled = true;
        this.cols[col]!++;
        this.settledCount++;
        newly++;
      }
    }

    if (this.spawned >= this.total && this.settledCount >= this.total) {
      this.done = true;
      this.active = false;
    }
    return newly;
  }

  /** 굴러간 최종 칸 — 가까운 칸(±ROLL_REACH) 중 가장 낮은 곳으로 굴러 박스가 고르게 차오른다. */
  private rollDown(start: number): number {
    let best = start;
    const dir = Math.random() < 0.5 ? -1 : 1; // 동률일 때 좌우 편향 없이
    for (let d = 1; d <= ROLL_REACH; d++) {
      for (const c of [start + d * dir, start - d * dir]) {
        if (c >= 0 && c < this.cols.length && this.cols[c]! < this.cols[best]!) best = c;
      }
    }
    return best;
  }

  /** 안착 진행도 0..1 (game 에서 보유 구슬 적립 환산용). */
  progress(): number {
    return this.total ? this.settledCount / this.total : 1;
  }

  draw(ctx: CanvasRenderingContext2D, rect: Rect): void {
    const r = rect;
    ctx.save();
    // ---- 박스 뒤 유리 패널(반투명 하늘빛) ----
    ctx.save();
    roundRect(ctx, r.x, r.y, r.w, r.h, 14);
    const bg = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
    bg.addColorStop(0, "rgba(180,225,255,0.10)");
    bg.addColorStop(1, "rgba(120,180,230,0.22)");
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.clip();

    // ---- 쌓인 구슬 + 낙하 중 구슬 ----
    for (const b of this.balls) this.drawBall(ctx, b);

    // ---- 금빛 차오름 글로우(파일 표면 위로 은은하게) ----
    const prog = this.progress();
    if (prog > 0) {
      const fillTop = r.y + r.h * (1 - Math.min(1, prog * 0.95));
      const gl = ctx.createLinearGradient(0, fillTop, 0, r.y + r.h);
      gl.addColorStop(0, "rgba(255,210,90,0.0)");
      gl.addColorStop(1, "rgba(255,190,60,0.18)");
      ctx.fillStyle = gl;
      ctx.fillRect(r.x, fillTop, r.w, r.y + r.h - fillTop);
    }
    ctx.restore(); // clip

    // ---- 박스 전면 테두리(플라스틱 하이라이트) ----
    ctx.lineWidth = 5;
    ctx.strokeStyle = "rgba(230,245,255,0.85)";
    ctx.shadowColor = "rgba(150,210,255,0.8)";
    ctx.shadowBlur = 16;
    roundRect(ctx, r.x, r.y, r.w, r.h, 14);
    ctx.stroke();
    ctx.shadowBlur = 0;
    // 상단 반사 하이라이트.
    ctx.strokeStyle = "rgba(255,255,255,0.5)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(r.x + 14, r.y + 5);
    ctx.lineTo(r.x + r.w - 14, r.y + 5);
    ctx.stroke();

    // ---- 카운터(쌓인 개수 / 반짝) ----
    ctx.fillStyle = "#fff4c2";
    ctx.font = `bold ${Math.round(r.h * 0.11)}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.shadowColor = "#ffcf3a";
    ctx.shadowBlur = 12;
    ctx.fillText("🪙 BONUS", r.x + r.w / 2, r.y + r.h * 0.03);
    ctx.restore();
  }

  // 구슬 스프라이트 캐시 — 박스에 수백 개가 쌓여도 매 프레임 그라디언트를 새로 만들지 않도록.
  private sprites = new Map<string, HTMLCanvasElement>();

  private drawBall(ctx: CanvasRenderingContext2D, b: Ball): void {
    const scale = ctx.getTransform().a || 1; // devicePixelRatio 반영(선명도)
    const hueBucket = Math.round(b.hue / 5) * 5;
    const px = Math.max(2, Math.round(b.r * scale));
    const key = `${px}:${hueBucket}`;
    let sp = this.sprites.get(key);
    if (!sp) {
      sp = document.createElement("canvas");
      sp.width = sp.height = px * 2 + 2;
      const g = sp.getContext("2d");
      if (g) {
        const c = px + 1;
        const grad = g.createRadialGradient(c - px * 0.35, c - px * 0.4, px * 0.1, c, c, px);
        grad.addColorStop(0, `hsl(${hueBucket},95%,86%)`);
        grad.addColorStop(0.5, `hsl(${hueBucket},90%,62%)`);
        grad.addColorStop(1, `hsl(${hueBucket},80%,34%)`);
        g.fillStyle = grad;
        g.beginPath();
        g.arc(c, c, px, 0, Math.PI * 2);
        g.fill();
        // 하이라이트 점.
        g.fillStyle = "rgba(255,255,255,0.85)";
        g.beginPath();
        g.arc(c - px * 0.33, c - px * 0.38, px * 0.28, 0, Math.PI * 2);
        g.fill();
      }
      this.sprites.set(key, sp);
    }
    const size = (px * 2 + 2) / scale;
    ctx.drawImage(sp, b.x - size / 2, b.y - size / 2, size, size);
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}
