// 수평 릴 1행 — 심볼이 오른쪽 → 왼쪽으로 지나간다.
// 정지 시 정위치(offset 0) 또는 조금 지나치거나(+) 미달(-)한 위치에서 멈출 수 있다.
import { drawSymbol } from "./symbols.js";

function easeOutCubic(p: number): number {
  return 1 - (1 - p) ** 3;
}

function hashSymbol(i: number, seed: number): number {
  let h = (Math.imul(i ^ seed, 2654435761) ^ (seed << 5)) >>> 0;
  h = (h ^ (h >>> 15)) >>> 0;
  return 1 + (h % 9);
}

export type ReelPhase = "idle" | "spin" | "stop" | "done";

export class Reel {
  private overrides = new Map<number, number>();
  private scroll = 0;
  private speed = 0;
  private phase: ReelPhase = "idle";
  private from = 0;
  private to = 0;
  private tt = 0;
  private dur = 0.5;
  private landingS = 0;
  private finalOffset = 0; // 정위치 기준 칸 오프셋 (-0.5..0.5)

  constructor(private readonly seed: number) {}

  get stopped(): boolean {
    return this.phase === "done" || this.phase === "idle";
  }

  /** 정위치에서 벗어난 정도(칸). |offset|이 작으면 정위치. */
  get offset(): number {
    return this.finalOffset;
  }

  startSpin(speed: number): void {
    this.overrides.clear();
    this.phase = "spin";
    this.speed = speed;
  }

  setSpeed(speed: number): void {
    this.speed = speed;
  }

  /**
   * 정지 요청.
   * @param offsetCells 정위치 대비 최종 오프셋(0=정위치, ±0.15~0.35=조금 지나침/미달).
   */
  requestStop(
    targets: readonly [number, number, number],
    step: number,
    extraCells: number,
    dur: number,
    offsetCells = 0,
  ): void {
    const cur = this.scroll / step;
    const S = Math.ceil(cur) + Math.max(1, extraCells);
    this.overrides.set(S, targets[0]);
    this.overrides.set(S + 1, targets[1]);
    this.overrides.set(S + 2, targets[2]);
    this.from = this.scroll;
    this.to = (S + offsetCells) * step;
    this.tt = 0;
    this.dur = Math.max(0.03, dur);
    this.landingS = S;
    this.finalOffset = offsetCells;
    this.phase = "stop";
  }

  private symbolAt(i: number): number {
    const o = this.overrides.get(i);
    return o ?? hashSymbol(i, this.seed);
  }

  /** 논리적 안착 심볼 3개 (오프셋 무시, 판정용). */
  visibleSymbols(): [number, number, number] {
    const s = this.landingS;
    return [this.symbolAt(s), this.symbolAt(s + 1), this.symbolAt(s + 2)];
  }

  update(dt: number): void {
    if (this.phase === "spin") {
      this.scroll += this.speed * dt;
    } else if (this.phase === "stop") {
      this.tt += dt;
      const p = Math.min(1, this.tt / this.dur);
      this.scroll = this.from + (this.to - this.from) * easeOutCubic(p);
      if (p >= 1) this.phase = "done";
    }
  }

  draw(ctx: CanvasRenderingContext2D, x: number, y: number, step: number, cellSize: number, t: number, glowBoost = 0): void {
    const base = Math.floor(this.scroll / step);
    const frac = this.scroll - base * step;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x - step * 0.02, y - step / 2, step * 3 + step * 0.04, step);
    ctx.clip();
    for (let k = -1; k <= 3; k++) {
      const sym = this.symbolAt(base + k);
      const cx = x + (k + 0.5) * step - frac;
      drawSymbol(ctx, sym, cx, y, cellSize, t, glowBoost);
    }
    ctx.restore();
  }
}
