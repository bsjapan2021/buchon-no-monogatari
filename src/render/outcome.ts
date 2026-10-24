// 결과·모드 컨트롤러 — 파친코 확률 스펙(장르 공통 수치).
// 통상(NORMAL) / 確変(KAKUHEN, 電サポ) / 時短(JITAN, 電サポ) + RUSH 루프.
// 당첨 도안: 짝수=파랑(통상 계열), 홀수=빨강(확변 계열).
// 주: 특정 상용기종의 고유 연출명/상표는 사용하지 않는다. 수치만 참조.

// none=꽝, reachlose=리치 연출 후 꽝(ハズレ), reach=짝수 당첨(통상), ooatari=홀수 당첨(확변)
export type SpinKind = "none" | "reachlose" | "reach" | "ooatari";
export type Mode = "NORMAL" | "KAKUHEN" | "JITAN";
export type LineKind = "row" | "col" | "diag";

export interface LineSpec {
  kind: LineKind;
  index: number;
}

export interface Outcome {
  kind: SpinKind;
  number: number;
  line: LineSpec | null;
  round: number; // 10 | 2 | 0
  payout: number; // 구슬
  mode: Mode; // 전이 후 상태
  modeKey: string; // normal | kakuhen | jitan | rush
  special: boolean; // 電サポ(비통상)
  jitanLeft: number; // 時短 잔여
  windowSpin: number;
  continued: boolean;
}

const DENOM = 65536;
// 통상/시단 대당첨(리치·오아다리) 확률 = 30% (사용자 요청). 確變(RUSH)은 그보다 높게 유지.
const P_NORMAL = Math.round(DENOM * 0.3);
const P_KAKUHEN = Math.round(DENOM * 0.5);

interface RoundDef {
  round: number;
  kakuhen: boolean;
  w: number;
}
// ヘ소(상단 입상) 배분: 10R통상 40 / 10R확변 40 / 2R확변 20 → 확변 60%.
const HESO: RoundDef[] = [
  { round: 10, kakuhen: false, w: 40 },
  { round: 10, kakuhen: true, w: 40 },
  { round: 2, kakuhen: true, w: 20 },
];
// 電サポ 중 입상 배분: 10R통상 40 / 10R확변 52 / 2R확변 8 → 확변 60%.
const DENCHU: RoundDef[] = [
  { round: 10, kakuhen: false, w: 40 },
  { round: 10, kakuhen: true, w: 52 },
  { round: 2, kakuhen: true, w: 8 },
];

export class OutcomeController {
  private mode: Mode = "NORMAL";
  private jitanLeft = 0;
  private rush = false; // 時短200 루프 (2R확변 등으로 진입)
  private windowSpin = 0;
  private rng: () => number;

  constructor(rng: () => number = Math.random) {
    this.rng = rng;
  }

  getMode(): Mode {
    return this.mode;
  }
  isDenpo(): boolean {
    return this.mode !== "NORMAL";
  }
  getWindowSpin(): number {
    return this.windowSpin;
  }

  // ---- 상태 저장/복원(재접속 시) ----
  getState(): { mode: Mode; jitanLeft: number; rush: boolean; windowSpin: number } {
    return { mode: this.mode, jitanLeft: this.jitanLeft, rush: this.rush, windowSpin: this.windowSpin };
  }
  setState(s: { mode: Mode; jitanLeft: number; rush: boolean; windowSpin: number }): void {
    this.mode = s.mode;
    this.jitanLeft = s.jitanLeft;
    this.rush = s.rush;
    this.windowSpin = s.windowSpin;
  }
  getModeKey(): string {
    return this.mode === "NORMAL" ? "normal" : this.rush ? "rush" : this.mode === "KAKUHEN" ? "kakuhen" : "jitan";
  }

  next(): Outcome {
    this.windowSpin++;
    const denpo = this.mode !== "NORMAL";
    const p = this.mode === "KAKUHEN" ? P_KAKUHEN : P_NORMAL;
    const hit = this.rng() * DENOM < p;

    if (!hit) {
      if (this.mode === "JITAN") {
        this.jitanLeft--;
        if (this.jitanLeft <= 0) {
          this.mode = "NORMAL";
          this.rush = false;
          this.windowSpin = 0;
        }
      }
      // 리치 꽝(ハズレ) 연출 — 電サポ 중 빈번, 통상 중 드물게.
      const reachloseRate = this.mode !== "NORMAL" ? 0.32 : 0.05;
      if (this.rng() < reachloseRate) {
        return this.make("reachlose", this.pick([1, 2, 3, 4, 5, 6, 7, 8, 9]), this.randomLine(), 0, 0, false);
      }
      return this.make("none", 0, null, 0, 0, false);
    }

    // 대당첨 — 라운드 배분.
    const pick = this.weighted(denpo ? DENCHU : HESO);
    const round = pick.round;
    const payout = round === 10 ? 1500 : 60;
    const kakuhen = pick.kakuhen;
    const continued = denpo;
    if (round === 2 && kakuhen) this.rush = true; // 2R확변 → RUSH 진입

    if (kakuhen) {
      this.mode = "KAKUHEN";
      this.jitanLeft = 0;
    } else {
      this.mode = "JITAN";
      this.jitanLeft = this.rush ? 200 : 100;
    }
    this.windowSpin = 0;

    const kind: SpinKind = kakuhen ? "ooatari" : "reach";
    const number = kakuhen ? this.pick([1, 3, 5, 7, 9]) : this.pick([2, 4, 6, 8]);
    return this.make(kind, number, this.randomLine(), round, payout, continued);
  }

  private make(
    kind: SpinKind,
    number: number,
    line: LineSpec | null,
    round: number,
    payout: number,
    continued: boolean,
  ): Outcome {
    const key =
      this.mode === "NORMAL" ? "normal" : this.rush ? "rush" : this.mode === "KAKUHEN" ? "kakuhen" : "jitan";
    return {
      kind,
      number,
      line,
      round,
      payout,
      mode: this.mode,
      modeKey: key,
      special: this.mode !== "NORMAL",
      jitanLeft: this.jitanLeft,
      windowSpin: this.windowSpin,
      continued,
    };
  }

  private weighted(table: RoundDef[]): RoundDef {
    const total = table.reduce((s, d) => s + d.w, 0);
    let r = this.rng() * total;
    for (const d of table) {
      if (r < d.w) return d;
      r -= d.w;
    }
    return table[table.length - 1]!;
  }

  private pick(arr: number[]): number {
    return arr[(this.rng() * arr.length) | 0]!;
  }

  // 가로(row) 리치/오아다리는 없음 — 세로(col) 및 대각선(diag)만.
  // (릴은 1→2→3행 순차 정지하며, 마지막 3행 셀이 라인을 완성한다.)
  private randomLine(): LineSpec {
    const r = (this.rng() * 5) | 0;
    if (r < 3) return { kind: "col", index: r };
    return { kind: "diag", index: r - 3 };
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
