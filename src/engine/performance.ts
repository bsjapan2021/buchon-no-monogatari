// 연출 추첨 — 결과 확정 "후" 신뢰도 테이블로 리치/예고를 선택한다. (PRD §5.1, §5.3, §5.4)
// 이 모듈은 결과(hit)를 입력으로만 받으며, 어떤 값도 추첨 결과에 되먹이지 않는다.
import type { Rng } from "./rng.js";

export type ReachId = "none" | "normal" | "current" | "abyss" | "leviathan" | "lumina";

export interface ReachDef {
  readonly id: ReachId;
  readonly label: string;
  /** 당첨 시 선택 가중(%). */
  readonly onWin: number;
  /** 꽝 시 선택 가중(%). */
  readonly onLose: number;
  /** 화면 진동 세기 0..1 (연출 전용). */
  readonly shake: number;
  /** 프리미엄(황금) 연출 여부. */
  readonly premium: boolean;
}

/** PRD §5.3 리치 테이블 (오리지널 정의). */
export const REACHES: readonly ReachDef[] = [
  { id: "normal", label: "노멀 리치", onWin: 5, onLose: 70, shake: 0.1, premium: false },
  { id: "current", label: "해류 리치", onWin: 15, onLose: 20, shake: 0.25, premium: false },
  { id: "abyss", label: "심연 강하 리치", onWin: 30, onLose: 8, shake: 0.45, premium: false },
  { id: "leviathan", label: "리바이어선 리치", onWin: 40, onLose: 1.9, shake: 0.75, premium: false },
  { id: "lumina", label: "루미나 각성", onWin: 10, onLose: 0.1, shake: 1.0, premium: true },
];

export type TeaserId = "none" | "bubble_blue" | "bubble_green" | "bubble_red" | "bubble_gold" | "lumi_cutin" | "pressure_alarm";

/** PRD §5.4 예고. 당첨일수록 상위 예고 비중↑ (오리지널 정의). */
const TEASERS_WIN: readonly { id: TeaserId; w: number }[] = [
  { id: "none", w: 10 },
  { id: "bubble_blue", w: 10 },
  { id: "bubble_green", w: 20 },
  { id: "bubble_red", w: 25 },
  { id: "bubble_gold", w: 15 },
  { id: "lumi_cutin", w: 12 },
  { id: "pressure_alarm", w: 8 },
];
const TEASERS_LOSE: readonly { id: TeaserId; w: number }[] = [
  { id: "none", w: 55 },
  { id: "bubble_blue", w: 25 },
  { id: "bubble_green", w: 12 },
  { id: "bubble_red", w: 5 },
  { id: "bubble_gold", w: 1.5 },
  { id: "lumi_cutin", w: 1 },
  { id: "pressure_alarm", w: 0.5 },
];

function weightedPick<T extends { w: number }>(rng: Rng, table: readonly T[]): T {
  const total = table.reduce((s, t) => s + t.w, 0);
  // 소수 가중치 지원을 위해 1000배 정수화.
  let r = rng.nextInt(Math.round(total * 1000));
  for (const t of table) {
    const w = Math.round(t.w * 1000);
    if (r < w) return t;
    r -= w;
  }
  return table[table.length - 1]!;
}

/** 리치 선택 — 리치가 걸렸을 때만 호출. */
export function pickReach(rng: Rng, win: boolean): ReachDef {
  const total = REACHES.reduce((s, d) => s + (win ? d.onWin : d.onLose), 0);
  let r = rng.nextInt(Math.round(total * 1000));
  for (const d of REACHES) {
    const w = Math.round((win ? d.onWin : d.onLose) * 1000);
    if (r < w) return d;
    r -= w;
  }
  return REACHES[0]!;
}

/** 예고 선택. */
export function pickTeaser(rng: Rng, win: boolean): TeaserId {
  return weightedPick(rng, win ? TEASERS_WIN : TEASERS_LOSE).id;
}
