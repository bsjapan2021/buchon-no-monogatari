// 당첨 보너스 박스 — 보너스 남은 시간·입상 수·지급 합계를 보여 주고,
// 홀 입상이 생길 때마다 구슬 한 무더기가 투명 박스에 떨어져 쌓인다(연출 전용, 실제 지급은 game 쪽).
// 중력 낙하 + 벽 반동 + 컬럼별 파일(pile) 적층.

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

const ENTRIES_PER_BOX = 10; // 시각 연출: 입상 10개면 박스가 가득 차고 비워진다(실제 지급은 입상 1개 = 1,000개)
const BURST_TIME = 0.35; // 입상 1개분 구슬이 쏟아지는 시간(초)
const ROLL_REACH = 3; // 안착 시 좌우로 굴러갈 수 있는 최대 칸 수

/** 보너스 박스에 표시할 진행 정보. */
export interface BonusInfo {
  left: number; // 남은 시간(초)
  entries: number; // 입상 수
  awarded: number; // 지급 합계
}

/** 박스 안 배치 — 상단 타이머·하단 집계 글자 크기와 구슬이 쌓이는 구간. */
function boxMetrics(r: Rect): { fs: number; top: number; floor: number } {
  const fs = Math.max(10, Math.min(24, r.h * 0.13, r.w * 0.09));
  return { fs, top: r.y + fs * 2.4, floor: r.y + r.h - fs * 1.45 };
}

export class PayoutBox {
  private balls: Ball[] = [];
  private cols: number[] = []; // 컬럼별 적층 개수
  private colW = 1;
  private ballR = 6;
  private capacity = 1; // 박스 한 개에 들어가는 시각 구슬 수
  private perEntry = 1; // 입상 1개당 쏟아지는 시각 구슬 수
  private queued = 0; // 아직 쏟아지지 않은 시각 구슬
  private settledCount = 0;
  private spawnAcc = 0;
  private flash = 0; // 박스가 가득 차서 비워질 때 반짝임
  boxes = 0; // 가득 채운 박스 수(연출)

  /** 보너스 시작 — 빈 박스로 초기화. */
  start(rect: Rect): void {
    this.balls = [];
    this.queued = 0;
    this.settledCount = 0;
    this.spawnAcc = 0;
    this.flash = 0;
    this.boxes = 0;
    this.layout(rect);
    this.cols = new Array(this.cols.length).fill(0);
  }

  private layout(rect: Rect): void {
    const m = boxMetrics(rect);
    this.ballR = Math.max(3, Math.min(rect.w * 0.022, rect.h * 0.035));
    const C = Math.max(6, Math.floor(rect.w / (this.ballR * 2.05)));
    if (this.cols.length !== C) this.cols = new Array(C).fill(0);
    this.colW = rect.w / C;
    // 상단 타이머·하단 집계 표기 영역을 비워 둔 수용량.
    const dia = this.ballR * 2 * 0.86;
    const rows = Math.max(3, Math.floor((m.floor - m.top) / dia));
    this.capacity = C * rows;
    this.perEntry = Math.max(4, Math.round(this.capacity / ENTRIES_PER_BOX));
  }

  /** 홀 입상 n개 — 입상마다 구슬 한 무더기가 쏟아진다(연출 전용, 실제 지급은 game 쪽). */
  add(n: number): void {
    // 입상이 몰려도 화면이 넘치지 않도록 대기열은 박스 한 개 분량까지만.
    this.queued = Math.min(this.capacity, this.queued + n * this.perEntry);
  }

  /** 쏟아지는 중인 구슬이 있는지(효과음용). */
  get pouring(): boolean {
    return this.queued > 0 || this.balls.some((b) => !b.settled);
  }

  /** @returns 이번 프레임에 새로 바닥/파일에 안착한 구슬 수(사운드 트리거용). */
  update(dt: number, rect: Rect): number {
    this.layout(rect);
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 2.5);

    // 스폰 — 대기열이 길수록 빠르게 쏟아진다.
    const rate = Math.max(this.perEntry / BURST_TIME, this.queued * 2);
    this.spawnAcc += dt * rate;
    while (this.queued > 0 && this.spawnAcc >= 1) {
      this.spawnAcc -= 1;
      this.queued--;
      this.balls.push({
        x: rect.x + rect.w * (0.08 + Math.random() * 0.84), // 박스 폭 전체로 쏟아져 고르게 쌓이게
        y: boxMetrics(rect).top + Math.random() * this.ballR * 2,
        vx: (Math.random() - 0.5) * rect.w * 0.25,
        vy: 0,
        r: this.ballR * (0.92 + Math.random() * 0.16),
        settled: false,
        hue: 42 + Math.random() * 10, // 금속 금색 계열
      });
    }
    if (this.queued === 0) this.spawnAcc = 0;

    const floorBase = boxMetrics(rect).floor;
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

    // 박스가 가득 차면 비우고(반짝) 다시 쌓는다.
    if (this.settledCount >= this.capacity) {
      this.balls = this.balls.filter((b) => !b.settled);
      this.cols.fill(0);
      this.settledCount = 0;
      this.boxes++;
      this.flash = 1;
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

  draw(ctx: CanvasRenderingContext2D, rect: Rect, info: BonusInfo): void {
    const r = rect;
    const open = info.left > 0;
    ctx.save();
    // ---- 박스 뒤 유리 패널(반투명 하늘빛) ----
    ctx.save();
    roundRect(ctx, r.x, r.y, r.w, r.h, 14);
    const bg = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
    bg.addColorStop(0, "rgba(10,30,60,0.42)");
    bg.addColorStop(1, "rgba(60,110,170,0.32)");
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.clip();

    // ---- 쌓인 구슬 + 낙하 중 구슬 ----
    for (const b of this.balls) this.drawBall(ctx, b);

    // ---- 박스가 가득 차서 비워질 때 금빛 반짝 ----
    if (this.flash > 0) {
      ctx.fillStyle = `rgba(255,214,90,${0.45 * this.flash})`;
      ctx.fillRect(r.x, r.y, r.w, r.h);
    }
    ctx.restore(); // clip

    // ---- 박스 전면 테두리(플라스틱 하이라이트) — 보너스 중엔 금빛 ----
    ctx.lineWidth = 5;
    ctx.strokeStyle = open ? "rgba(255,226,140,0.95)" : "rgba(230,245,255,0.7)";
    ctx.shadowColor = open ? "rgba(255,200,60,0.9)" : "rgba(150,210,255,0.8)";
    ctx.shadowBlur = 16;
    roundRect(ctx, r.x, r.y, r.w, r.h, 14);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // ---- 상단: 남은 시간 / 하단: 입상 수·지급 합계 ----
    const { fs } = boxMetrics(r);
    const cx = r.x + r.w / 2;
    const maxW = r.w * 0.92;
    const sec = Math.ceil(info.left);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "#ffcf3a";
    ctx.shadowBlur = 12;
    fitText(ctx, open ? `BONUS ${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}` : "BONUS 종료", cx, r.y + fs * 0.85, maxW, fs, "bold", "#fff4c2");
    fitText(ctx, open ? "홀 입상 1개 = +1,000" : "보너스 합계", cx, r.y + fs * 1.8, maxW, fs * 0.6, "", open ? "#ffe9a8" : "#dfeeff");
    fitText(
      ctx,
      `입상 ${info.entries.toLocaleString()}개 · +${info.awarded.toLocaleString()}`,
      cx,
      r.y + r.h - fs * 0.72,
      maxW,
      fs * 0.8,
      "bold",
      info.awarded > 0 ? "#ffd84a" : "#c9d6e6",
    );
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

/** 박스 폭을 넘지 않도록 글자 크기를 줄여 한 줄로 그린다. */
function fitText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxW: number,
  size: number,
  weight: string,
  color: string,
): void {
  let px = Math.round(size);
  ctx.font = `${weight} ${px}px system-ui, sans-serif`;
  const w = ctx.measureText(text).width;
  if (w > maxW) {
    px = Math.max(8, Math.floor((px * maxW) / w));
    ctx.font = `${weight} ${px}px system-ui, sans-serif`;
  }
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}
