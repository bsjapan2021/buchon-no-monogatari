// 수평 릴 1행 — 심볼이 오른쪽 → 왼쪽으로 지나간다.
// 정지 시 정위치(offset 0) 또는 조금 지나치거나(+) 미달(-)한 위치에서 멈출 수 있다.
// 슬라이딩/정지 패턴을 12종 지원해 상황·이벤트에 맞는 긴장감을 준다.
import { drawSymbol } from "./symbols.js";

// ---- 정지 이징 함수들 (모두 p=1 에서 1 로 수렴) ----
function easeOutCubic(p: number): number {
  return 1 - (1 - p) ** 3;
}
function easeOutQuint(p: number): number {
  return 1 - (1 - p) ** 5;
}
// 살짝 지나쳤다가 되돌아오는 오버슈트(스프링백).
function easeOutBack(p: number): number {
  const c1 = 2.2;
  const c3 = c1 + 1;
  return 1 + c3 * (p - 1) ** 3 + c1 * (p - 1) ** 2;
}
// 탄성 진동(여러 번 출렁이며 정착).
function easeOutElastic(p: number): number {
  if (p <= 0) return 0;
  if (p >= 1) return 1;
  const c4 = (2 * Math.PI) / 3;
  return 2 ** (-10 * p) * Math.sin((p * 10 - 0.75) * c4) + 1;
}
// 바운스(바닥에 튕기듯 여러 번).
function easeOutBounce(p: number): number {
  const n1 = 7.5625;
  const d1 = 2.75;
  if (p < 1 / d1) return n1 * p * p;
  if (p < 2 / d1) return n1 * (p -= 1.5 / d1) * p + 0.75;
  if (p < 2.5 / d1) return n1 * (p -= 2.25 / d1) * p + 0.9375;
  return n1 * (p -= 2.625 / d1) * p + 0.984375;
}
// 끊기듯 단계적으로(칸 단위로 뚝뚝) 멈춤 — 긴장감.
function easeStutter(p: number): number {
  const steps = 6;
  const q = Math.ceil(p * steps) / steps; // 계단식
  return easeOutCubic(q);
}
// 거의 멈췄다가 마지막에 한 칸 더 미끄러짐(すべり/스베리) — 리치 기대감.
function easeSlip(p: number): number {
  if (p < 0.78) return easeOutCubic(p / 0.78) * 0.9;
  return 0.9 + 0.1 * easeOutCubic((p - 0.78) / 0.22);
}
// 극도로 느린 서스펜스 정지(마지막 행 — 오아다리 확정 직전 크리프).
function easeSuspense(p: number): number {
  if (p < 0.55) return easeOutCubic(p / 0.55) * 0.93;
  return 0.93 + 0.07 * ((p - 0.55) / 0.45); // 마지막 7% 를 아주 천천히 선형 크리프
}

export type SpinPattern =
  | "normal" // 표준
  | "slow" // 느릿하게
  | "fast" // 빠르게 탁
  | "accel" // 점점 빨라졌다 정지
  | "pulse" // 속도가 맥동(출렁)
  | "hyper" // 초고속 블러(확변/RUSH)
  | "elastic" // 탄성 되튕김
  | "bounce" // 바운스
  | "stutter" // 끊기듯 단계적
  | "slip" // 스베리(미끄러짐)
  | "rewind" // 지나쳤다 되감김
  | "suspense"; // 초저속 서스펜스

function easeFor(p: SpinPattern): (x: number) => number {
  switch (p) {
    case "fast":
    case "hyper":
      return easeOutQuint;
    case "elastic":
      return easeOutElastic;
    case "bounce":
      return easeOutBounce;
    case "stutter":
      return easeStutter;
    case "slip":
      return easeSlip;
    case "rewind":
      return easeOutBack;
    case "suspense":
      return easeSuspense;
    case "normal":
    case "slow":
    case "accel":
    case "pulse":
    default:
      return easeOutCubic;
  }
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
  private patt: SpinPattern = "normal";
  private spinT = 0; // 회전(스핀) 경과 — 속도 변조용
  private ease: (x: number) => number = easeOutCubic;

  constructor(private readonly seed: number) {}

  get stopped(): boolean {
    return this.phase === "done" || this.phase === "idle";
  }

  /** 정위치에서 벗어난 정도(칸). |offset|이 작으면 정위치. */
  get offset(): number {
    return this.finalOffset;
  }

  startSpin(speed: number, pattern: SpinPattern = "normal"): void {
    this.overrides.clear();
    this.phase = "spin";
    this.speed = speed;
    this.patt = pattern;
    this.spinT = 0;
  }

  setSpeed(speed: number): void {
    this.speed = speed;
  }

  /**
   * 정지 요청.
   * @param offsetCells 정위치 대비 최종 오프셋(0=정위치, ±0.15~0.35=조금 지나침/미달).
   * @param pattern 정지 슬라이딩 패턴(긴장감 연출). 미지정 시 스핀 패턴 유지.
   */
  requestStop(
    targets: readonly [number, number, number],
    step: number,
    extraCells: number,
    dur: number,
    offsetCells = 0,
    pattern?: SpinPattern,
  ): void {
    const cur = this.scroll / step;
    const S = Math.ceil(cur) + Math.max(1, extraCells);
    this.overrides.set(S, targets[0]);
    this.overrides.set(S + 1, targets[1]);
    this.overrides.set(S + 2, targets[2]);
    // 오버슈트 패턴은 정착 지점 바로 앞/뒤 칸도 심볼을 채워 되튕김 중 빈칸이 안 보이게.
    this.overrides.set(S + 3, targets[0]);
    this.overrides.set(S - 1, targets[2]);
    this.from = this.scroll;
    this.to = (S + offsetCells) * step;
    this.tt = 0;
    this.dur = Math.max(0.03, dur);
    this.landingS = S;
    this.finalOffset = offsetCells;
    if (pattern) this.patt = pattern;
    this.ease = easeFor(this.patt);
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

  // 스핀(회전) 중 패턴별 순간 속도.
  private spinSpeed(): number {
    switch (this.patt) {
      case "accel":
        return this.speed * (0.55 + Math.min(1.25, this.spinT * 1.5));
      case "pulse":
        return this.speed * (1 + 0.34 * Math.sin(this.spinT * 15));
      case "hyper":
        return this.speed * 2.15;
      case "slow":
      case "suspense":
        return this.speed * 0.72;
      default:
        return this.speed;
    }
  }

  update(dt: number): void {
    if (this.phase === "spin") {
      this.spinT += dt;
      this.scroll += this.spinSpeed() * dt;
    } else if (this.phase === "stop") {
      this.tt += dt;
      const p = Math.min(1, this.tt / this.dur);
      this.scroll = this.from + (this.to - this.from) * this.ease(p);
      if (p >= 1) {
        this.scroll = this.to;
        this.phase = "done";
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D, x: number, y: number, step: number, cellSize: number, t: number, glowBoost = 0): void {
    const base = Math.floor(this.scroll / step);
    const frac = this.scroll - base * step;
    ctx.save();
    ctx.beginPath();
    // 가로폭은 step 기준, 세로는 셀 높이(cellSize) 기준으로 클리핑.
    ctx.rect(x - step * 0.02, y - cellSize * 0.66, step * 3 + step * 0.04, cellSize * 1.32);
    ctx.clip();
    for (let k = -1; k <= 3; k++) {
      const sym = this.symbolAt(base + k);
      const cx = x + (k + 0.5) * step - frac;
      drawSymbol(ctx, sym, cx, y, cellSize, t, glowBoost);
    }
    ctx.restore();
  }
}

function hashSymbol(i: number, seed: number): number {
  let h = (Math.imul(i ^ seed, 2654435761) ^ (seed << 5)) >>> 0;
  h = (h ^ (h >>> 15)) >>> 0;
  return 1 + (h % 9);
}
