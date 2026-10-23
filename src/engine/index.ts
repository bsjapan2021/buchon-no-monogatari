// engine 공개 표면. 렌더링/브라우저 의존성 없음 — Node 단독 실행 가능.
export * from "./types.js";
export { Rng } from "./rng.js";
export { SPECS, DEFAULT_SPEC_ID, getSpec, oddsOf } from "./spec.js";
export { hitRangesFor, isHit, pickDistribution } from "./lottery.js";
export { payoutForRound } from "./payout.js";
export { HoldQueue } from "./hold.js";
export type { HeldDraw, HoldKind } from "./hold.js";
export { GameEngine } from "./stateMachine.js";
export {
  REACHES,
  pickReach,
  pickTeaser,
} from "./performance.js";
export type { ReachId, ReachDef, TeaserId } from "./performance.js";
