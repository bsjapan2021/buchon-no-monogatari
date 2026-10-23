// 이론값 계산 — 하드코딩 금지, 스펙 JSON 으로부터 유도. (PRD §4.3, §5.3)
import type { Spec } from "../engine/types.js";
import { REACHES } from "../engine/performance.js";

export interface TheoreticalStats {
  /** 통상 대당첨 확률 (1/x 의 x). */
  normalOdds: number;
  /** ST 중 대당첨 확률. */
  stOdds: number;
  /** ST 계속률 = 1-(1-p_st)^stSpins. */
  stContinueRate: number;
  /** 시단 중 당첨률 = 1-(1-p_normal)^jidanSpins. */
  jidanHitRate: number;
  /** ST 1회 진입 시 평균 추가 당첨 수 = r/(1-r), r=ST 계속률. */
  stAvgExtraHits: number;
}

export function theoreticalStats(spec: Spec): TheoreticalStats {
  const pNormal = spec.normalHitRanges / spec.denominator;
  const pSt = spec.stHitRanges / spec.denominator;
  const stContinueRate = 1 - (1 - pSt) ** spec.stSpins;
  return {
    normalOdds: 1 / pNormal,
    stOdds: 1 / pSt,
    stContinueRate,
    jidanHitRate: 1 - (1 - pNormal) ** spec.jidanSpins,
    // 기하분포 기대 연장 횟수: r/(1-r). (PRD §4.3 ≈2.70)
    stAvgExtraHits: stContinueRate / (1 - stContinueRate),
  };
}

export interface ReachReliability {
  id: string;
  label: string;
  /** 전체 변동 중 이 리치가 당첨으로 끝날 확률비 (신뢰도, 0..1). */
  reliability: number;
}

/**
 * 리치별 신뢰도 = 당첨확률×당첨시선택률 / (당첨확률×당첨시선택률 + 꽝확률×꽝시선택률).
 * 리치가 성립했다는 가정 하의 조건부 당첨확률. (PRD §5.3 주석)
 */
export function reachReliabilities(hitProb: number): ReachReliability[] {
  const miss = 1 - hitProb;
  return REACHES.map((d) => {
    const win = hitProb * (d.onWin / 100);
    const lose = miss * (d.onLose / 100);
    const denom = win + lose;
    return {
      id: d.id,
      label: d.label,
      reliability: denom === 0 ? 0 : win / denom,
    };
  });
}
