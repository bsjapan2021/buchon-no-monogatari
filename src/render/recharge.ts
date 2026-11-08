// 구슬 자동 충전 — 보유 구슬이 0개가 되면 필드의 구슬이 모두 정리된 뒤 일정량을 채워 준다.
// (필드에 남은 구슬이 홀에 들어갈 기회는 그대로 보장)

export const RECHARGE_AMOUNT = 300; // 1회 충전량
export const RECHARGE_DELAY = 0.8; // 필드가 빈 뒤 충전까지 대기(초) — '구슬 소진' 안내를 잠깐 보여준다
export const RECHARGE_MAX_WAIT = 6; // 필드에 구슬이 끼어 있어도 이 시간이 지나면 충전

export class AutoRecharge {
  /** 누적 충전 횟수(저장·관리용). */
  count = 0;
  private wait = 0;

  /**
   * @param held 현재 보유 구슬
   * @param ballsInField 필드(레일 포함)에서 아직 움직이는 구슬 수
   * @returns 이번 프레임에 충전할 구슬 수(없으면 0)
   */
  update(dt: number, held: number, ballsInField: number): number {
    if (held > 0) {
      this.wait = 0;
      return 0;
    }
    this.wait += dt;
    const ready = ballsInField > 0 ? this.wait >= RECHARGE_MAX_WAIT : this.wait >= RECHARGE_DELAY;
    if (!ready) return 0;
    this.wait = 0;
    this.count++;
    return RECHARGE_AMOUNT;
  }
}
