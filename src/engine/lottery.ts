// 대당첨 추첨 + 배분 선택 — 결과를 "먼저" 확정한다. (PRD §4.1, §5.1)
import type { Distribution, GameState, Spec } from "./types.js";
import type { Rng } from "./rng.js";

/** 상태에 따른 당첨 범위 수. */
export function hitRangesFor(spec: Spec, state: GameState): number {
  return state === "ST" ? spec.stHitRanges : spec.normalHitRanges;
}

/** 추첨값 하나로 당첨 여부 판정. roll < hitRanges 이면 당첨. */
export function isHit(roll: number, hitRanges: number): boolean {
  return roll < hitRanges;
}

/** 가중치 기반 배분 선택. */
export function pickDistribution(rng: Rng, table: readonly Distribution[]): Distribution {
  const total = table.reduce((sum, d) => sum + d.weight, 0);
  let r = rng.nextInt(total);
  for (const d of table) {
    if (r < d.weight) return d;
    r -= d.weight;
  }
  // 가중치 합이 양수면 도달 불가. 방어적으로 마지막 반환.
  return table[table.length - 1]!;
}
