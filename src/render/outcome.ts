// 결과·모드 컨트롤러 — ST식 보너스 모드.
// 당첨 판정: 가로·세로·대각선 3개 같은 수가 정위치 정렬 → 짝수=리치, 홀수=오아다리(슈퍼리치).
// 모드: 일반(NORMAL) / 슈퍼(SUPER). 100회 윈도우로 보장·반복·복귀.

export type SpinKind = "none" | "reach" | "ooatari"; // 리치(짝수) / 오아다리(홀수)
export type Mode = "NORMAL" | "SUPER";
export type LineKind = "row" | "col" | "diag";

export interface LineSpec {
  kind: LineKind;
  index: number; // row:0~2, col:0~2, diag:0(\) 1(/)
}

export interface Outcome {
  kind: SpinKind;
  number: number; // 정렬 숫자 (리치=짝수 / 오아다리=홀수), none이면 0
  line: LineSpec | null;
  mode: Mode;
  windowSpin: number;
  continued: boolean; // 오아다리 후 연장 여부
}

const WINDOW = 100;
const CONTINUE_RATE = 0.8; // 슈퍼 연장 확률(ST 계속률)

export class OutcomeController {
  private mode: Mode = "NORMAL";
  private windowSpin = 0;
  private windowHit = false; // 이 윈도우에서 리치/오아다리 발생
  private rng: () => number;

  constructor(rng: () => number = Math.random) {
    this.rng = rng;
  }

  getMode(): Mode {
    return this.mode;
  }
  getWindowSpin(): number {
    return this.windowSpin;
  }

  next(): Outcome {
    this.windowSpin++;
    const atLimit = this.windowSpin >= WINDOW;
    let kind: SpinKind = "none";

    if (this.mode === "SUPER") {
      // 오아다리 고확률 + 윈도우 말미로 갈수록 급상승(100회 내 보장).
      const p = Math.min(1, 0.3 + (this.windowSpin / WINDOW) * 0.7);
      if (this.rng() < p) kind = "ooatari";
      else if (this.rng() < 0.12) kind = "reach";
    } else {
      // 일반: 피처(리치/오아다리) 저확률. 피처 발생 시 오아다리 비중 높게.
      const feature = this.rng() < 0.06 || (atLimit && !this.windowHit);
      if (feature) kind = this.rng() < 0.45 ? "ooatari" : "reach";
    }

    let number = 0;
    let line: LineSpec | null = null;
    if (kind !== "none") {
      number = kind === "ooatari" ? this.pick([1, 3, 5, 7, 9]) : this.pick([2, 4, 6, 8]);
      line = this.randomLine();
      this.windowHit = true;
    }

    let continued = false;
    // 모드 전이.
    if (kind === "ooatari") {
      if (this.mode === "NORMAL") {
        this.mode = "SUPER";
        this.resetWindow();
      } else {
        continued = this.rng() < CONTINUE_RATE;
        if (continued) this.resetWindow();
        else {
          this.mode = "NORMAL";
          this.resetWindow();
        }
      }
    } else if (kind === "reach") {
      this.resetWindow(); // 반복(윈도우 갱신)
    } else if (atLimit) {
      // 빈 윈도우 — 슈퍼면 일반 복귀.
      if (this.mode === "SUPER") this.mode = "NORMAL";
      this.resetWindow();
    }

    return { kind, number, line, mode: this.mode, windowSpin: this.windowSpin, continued };
  }

  private resetWindow(): void {
    this.windowSpin = 0;
    this.windowHit = false;
  }

  private pick(arr: number[]): number {
    return arr[(this.rng() * arr.length) | 0]!;
  }

  private randomLine(): LineSpec {
    const r = (this.rng() * 8) | 0;
    if (r < 3) return { kind: "row", index: r };
    if (r < 6) return { kind: "col", index: r - 3 };
    return { kind: "diag", index: r - 6 };
  }
}

/** 라인에 포함된 셀 좌표 [row,col] 목록. */
export function lineCells(line: LineSpec): [number, number][] {
  if (line.kind === "row") return [0, 1, 2].map((c) => [line.index, c] as [number, number]);
  if (line.kind === "col") return [0, 1, 2].map((r) => [r, line.index] as [number, number]);
  return line.index === 0
    ? [
        [0, 0],
        [1, 1],
        [2, 2],
      ]
    : [
        [0, 2],
        [1, 1],
        [2, 0],
      ];
}
