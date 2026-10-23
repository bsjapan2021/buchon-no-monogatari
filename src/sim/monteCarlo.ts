// 대량 몬테카를로 — 추첨 엔진만 사용(렌더링 無). (PRD §6.3, 수용기준 §8.1)
import { GameEngine } from "../engine/stateMachine.js";
import { Rng } from "../engine/rng.js";
import type { Spec } from "../engine/types.js";

export interface MonteCarloResult {
  spins: number;
  hits: number;
  normalSpins: number;
  normalHits: number;
  stSpins: number;
  stEntries: number;
  stHits: number;
  totalPayout: number;
  measuredNormalOdds: number;
  measuredStOdds: number;
}

/** 단일 플레이어를 spins 회전 돌려 누적 통계를 반환. */
export function runMonteCarlo(spec: Spec, spins: number, seed: number | bigint): MonteCarloResult {
  const engine = new GameEngine(spec, new Rng(seed));
  let hits = 0;
  let normalSpins = 0;
  let normalHits = 0;
  let stSpins = 0;
  let stHits = 0;
  let stEntries = 0;
  let totalPayout = 0;

  for (let i = 0; i < spins; i++) {
    const before = engine.getState();
    const out = engine.spin();
    if (before === "ST") {
      stSpins++;
      if (out.hit) stHits++;
    } else {
      // 통상 + 시단은 통상 확률을 공유.
      normalSpins++;
      if (out.hit) normalHits++;
    }
    if (out.hit) {
      hits++;
      totalPayout += out.payout;
      if (out.stateAfter === "ST") stEntries++;
    }
  }

  return {
    spins,
    hits,
    normalSpins,
    normalHits,
    stSpins,
    stEntries,
    stHits,
    totalPayout,
    measuredNormalOdds: normalHits === 0 ? Infinity : normalSpins / normalHits,
    measuredStOdds: stHits === 0 ? Infinity : stSpins / stHits,
  };
}
