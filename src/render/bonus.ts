// 당첨 보너스(어태커 개방) — 시단(時短)·확변(確変) 당첨 후 일정 시간 동안
// 홀에 들어간 구슬 1개마다 고정 수량을 지급한다. 입상이 없으면 보너스도 없다.
// 순수 로직(DOM/캔버스 없음)이라 단위 테스트로 검증한다.

export const BONUS_SECONDS = 180; // 보너스 시간(3분)
export const BONUS_PER_ENTRY = 1000; // 입상 1개당 지급 구슬

export class BonusWindow {
  /** 남은 시간(초). 0이면 닫힘. */
  left = 0;
  /** 이번 보너스 동안 홀에 들어간 구슬 수. */
  entries = 0;
  /** 이번 보너스로 지급된 구슬 합계. */
  awarded = 0;

  get active(): boolean {
    return this.left > 0;
  }

  /** 보너스 개방(새 당첨). 이전 집계는 초기화. */
  start(seconds: number = BONUS_SECONDS): void {
    this.left = Math.max(0, seconds);
    this.entries = 0;
    this.awarded = 0;
  }

  /** 재접속 시 남은 보너스 이어서 진행. */
  resume(left: number, entries = 0, awarded = 0): void {
    this.left = Math.max(0, Math.min(BONUS_SECONDS, left));
    this.entries = Math.max(0, entries);
    this.awarded = Math.max(0, awarded);
  }

  /** 홀 입상 n개 처리. @returns 지급할 구슬 수(보너스가 닫혀 있으면 0). */
  enter(n: number): number {
    if (!this.active || n <= 0) return 0;
    const won = n * BONUS_PER_ENTRY;
    this.entries += n;
    this.awarded += won;
    return won;
  }

  /** 시간 경과. @returns 이번 호출로 보너스가 닫혔으면 true. */
  tick(dt: number): boolean {
    if (!this.active) return false;
    this.left = Math.max(0, this.left - dt);
    return this.left === 0;
  }
}
