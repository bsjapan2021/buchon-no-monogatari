// 보류 관리 — 입상 시점에 추첨값을 즉시 선취득·저장 (실기와 동일). (PRD §4.5)
import type { Rng } from "./rng.js";

export interface HeldDraw {
  /** 선취득된 추첨값. */
  readonly roll: number;
}

export type HoldKind = "heso" | "dendo";

/** 전동 보류 우선 소화 구조의 FIFO 보류 큐. */
export class HoldQueue {
  private readonly maxHeso: number;
  private readonly maxDendo: number;
  private heso: HeldDraw[] = [];
  private dendo: HeldDraw[] = [];

  constructor(maxHeso = 4, maxDendo = 4) {
    this.maxHeso = maxHeso;
    this.maxDendo = maxDendo;
  }

  /** 입상. 꽉 찼으면 false(흘림). 성공 시 즉시 추첨값 선취득. */
  add(kind: HoldKind, rng: Rng, denominator: number): boolean {
    const queue = kind === "heso" ? this.heso : this.dendo;
    const max = kind === "heso" ? this.maxHeso : this.maxDendo;
    if (queue.length >= max) return false;
    queue.push({ roll: rng.nextInt(denominator) });
    return true;
  }

  /** 다음 소화 대상 꺼내기 — 전동 우선. */
  next(): { kind: HoldKind; draw: HeldDraw } | null {
    const d = this.dendo.shift();
    if (d) return { kind: "dendo", draw: d };
    const h = this.heso.shift();
    if (h) return { kind: "heso", draw: h };
    return null;
  }

  counts(): { heso: number; dendo: number } {
    return { heso: this.heso.length, dendo: this.dendo.length };
  }

  /** 선읽기 연출용: 보류 중 당첨이 있는지(범위 기준). */
  peekRolls(): { heso: readonly number[]; dendo: readonly number[] } {
    return {
      heso: this.heso.map((x) => x.roll),
      dendo: this.dendo.map((x) => x.roll),
    };
  }
}
