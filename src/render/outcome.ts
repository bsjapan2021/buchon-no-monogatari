// 결과·모드 컨트롤러 — 파친코 확률 스펙(장르 공통 수치).
// 통상(NORMAL) / 確変(KAKUHEN, 電サポ) / 時短(JITAN, 電サポ) + RUSH 루프.
// 당첨 도안: 짝수=파랑(통상 계열), 홀수=빨강(확변 계열).
// 주: 특정 상용기종의 고유 연출명/상표는 사용하지 않는다. 수치만 참조.

export type SpinKind = "none" | "reach" | "ooatari"; // reach=짝수(통상), ooatari=홀수(확변)
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
// 통상/시단 대당첨 확률 — 데모 플레이성을 위해 상향(실기 스펙 1/319.6). 확변은 실기 근사.
const P_NORMAL = Math.round(DENOM / 90);
const P_KAKUHEN = Math.round(DENOM / 31.9);

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
