// 라운드 → 획득 구슬 환산. (PRD §4.2 라운드 구조)
import type { Spec } from "./types.js";

export function payoutForRound(spec: Spec, round: number): number {
  return round * spec.ballsPerRound;
}
