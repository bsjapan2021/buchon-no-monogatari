// 순수 타입 정의 — 브라우저/렌더링 의존성 없음.

/** 게임 상태 머신의 상태. */
export type GameState = "NORMAL" | "ST" | "JIDAN";

/** 당첨 배분 1건 (헤소/전동 공통). */
export interface Distribution {
  readonly round: number;
  readonly weight: number;
  readonly next: Exclude<GameState, "NORMAL">;
}

/** 기종 스펙 (specs/*.json 과 1:1 대응). */
export interface Spec {
  readonly id: string;
  readonly name: string;
  /** 추첨 분모 (65536). */
  readonly denominator: number;
  /** 통상/시단 중 대당첨 당첨 범위 수. */
  readonly normalHitRanges: number;
  /** ST 중 대당첨 당첨 범위 수. */
  readonly stHitRanges: number;
  readonly stSpins: number;
  readonly jidanSpins: number;
  readonly ballsPerRound: number;
  readonly hesoDistribution: readonly Distribution[];
  readonly dendoDistribution: readonly Distribution[];
}

/** 한 번의 추첨(변동) 결과 — 연출 이전에 확정되는 "진실". */
export interface SpinOutcome {
  /** 추첨값 0..denominator-1. */
  readonly roll: number;
  /** 대당첨 여부. */
  readonly hit: boolean;
  /** 당첨 시 라운드 수 (꽝이면 0). */
  readonly round: number;
  /** 당첨 시 획득 구슬 (꽝이면 0). */
  readonly payout: number;
  /** 추첨 직전 상태. */
  readonly stateBefore: GameState;
  /** 추첨 직후 상태. */
  readonly stateAfter: GameState;
  /** 소화 후 남은 ST/시단 회전수 (통상이면 0). */
  readonly spinsRemaining: number;
}
