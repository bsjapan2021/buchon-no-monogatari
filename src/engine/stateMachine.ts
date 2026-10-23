// 통상/ST/시단/대당첨 상태 전이. (PRD §4.4)
// 추첨 결과를 먼저 확정하고 상태를 갱신한다. 연출은 이 결과를 "보여줄 뿐".
import type { GameState, Spec, SpinOutcome } from "./types.js";
import type { Rng } from "./rng.js";
import { hitRangesFor, isHit, pickDistribution } from "./lottery.js";
import { payoutForRound } from "./payout.js";

export class GameEngine {
  readonly spec: Spec;
  private rng: Rng;
  private state: GameState = "NORMAL";
  /** ST/시단 잔여 회전수. */
  private remaining = 0;

  constructor(spec: Spec, rng: Rng) {
    this.spec = spec;
    this.rng = rng;
  }

  getState(): GameState {
    return this.state;
  }

  getRemaining(): number {
    return this.remaining;
  }

  /** 테스트/리플레이용 상태 리셋. */
  reset(rng?: Rng): void {
    this.state = "NORMAL";
    this.remaining = 0;
    if (rng) this.rng = rng;
  }

  /**
   * 한 회전 처리. 당첨이면 배분을 뽑아 상태를 전이하고, 꽝이면
   * ST/시단 잔여를 1 감소시킨다(0이 되면 통상 복귀).
   */
  spin(): SpinOutcome {
    const stateBefore = this.state;
    const ranges = hitRangesFor(this.spec, stateBefore);
    const roll = this.rng.nextInt(this.spec.denominator);
    const hit = isHit(roll, ranges);

    if (hit) {
      // 통상 → 헤소(상단) 배분 / ST·시단 → 전동 배분.
      const table =
        stateBefore === "NORMAL" ? this.spec.hesoDistribution : this.spec.dendoDistribution;
      const dist = pickDistribution(this.rng, table);
      this.state = dist.next;
      this.remaining = dist.next === "ST" ? this.spec.stSpins : this.spec.jidanSpins;
      return {
        roll,
        hit: true,
        round: dist.round,
        payout: payoutForRound(this.spec, dist.round),
        stateBefore,
        stateAfter: this.state,
        spinsRemaining: this.remaining,
      };
    }

    // 꽝: ST/시단이면 잔여 소진.
    if (stateBefore !== "NORMAL") {
      this.remaining -= 1;
      if (this.remaining <= 0) {
        this.remaining = 0;
        this.state = "NORMAL";
      }
    }
    return {
      roll,
      hit: false,
      round: 0,
      payout: 0,
      stateBefore,
      stateAfter: this.state,
      spinsRemaining: this.remaining,
    };
  }
}
