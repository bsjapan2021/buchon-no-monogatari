import { describe, it, expect } from "vitest";
import { BonusWindow, BONUS_SECONDS, BONUS_PER_ENTRY } from "../src/render/bonus.js";
import { AutoRecharge, RECHARGE_AMOUNT, RECHARGE_DELAY, RECHARGE_MAX_WAIT } from "../src/render/recharge.js";

describe("BonusWindow (당첨 후 3분, 입상 1개 = +1,000)", () => {
  it("기본 보너스 시간은 3분, 입상 1개당 1,000개", () => {
    expect(BONUS_SECONDS).toBe(180);
    expect(BONUS_PER_ENTRY).toBe(1000);
  });

  it("보너스가 열리기 전에는 입상해도 지급 없음", () => {
    const b = new BonusWindow();
    expect(b.active).toBe(false);
    expect(b.enter(3)).toBe(0);
    expect(b.awarded).toBe(0);
  });

  it("보너스 중 입상 개수 × 1,000 지급", () => {
    const b = new BonusWindow();
    b.start();
    expect(b.enter(1)).toBe(1000);
    expect(b.enter(2)).toBe(2000);
    expect(b.entries).toBe(3);
    expect(b.awarded).toBe(3000);
  });

  it("입상이 하나도 없으면 3분이 지나도 보너스 0", () => {
    const b = new BonusWindow();
    b.start();
    let closed = false;
    for (let t = 0; t < 200 && !closed; t += 0.05) closed = b.tick(0.05);
    expect(closed).toBe(true);
    expect(b.active).toBe(false);
    expect(b.awarded).toBe(0);
  });

  it("3분이 지나면 닫히고 그 뒤 입상은 지급하지 않음", () => {
    const b = new BonusWindow();
    b.start();
    expect(b.tick(179.9)).toBe(false);
    expect(b.enter(1)).toBe(1000);
    expect(b.tick(0.2)).toBe(true);
    expect(b.enter(5)).toBe(0);
    expect(b.awarded).toBe(1000);
  });

  it("닫힌 뒤 tick은 다시 종료를 알리지 않음", () => {
    const b = new BonusWindow();
    b.start(1);
    expect(b.tick(2)).toBe(true);
    expect(b.tick(2)).toBe(false);
  });

  it("새 당첨이면 집계가 초기화됨", () => {
    const b = new BonusWindow();
    b.start();
    b.enter(4);
    b.start();
    expect(b.entries).toBe(0);
    expect(b.awarded).toBe(0);
    expect(b.left).toBe(180);
  });

  it("재접속 시 남은 시간과 집계를 이어감(최대 3분)", () => {
    const b = new BonusWindow();
    b.resume(95, 7, 7000);
    expect(b.active).toBe(true);
    expect(b.enter(1)).toBe(1000);
    expect(b.entries).toBe(8);
    expect(b.awarded).toBe(8000);
    b.resume(9999);
    expect(b.left).toBe(180);
  });
});

describe("AutoRecharge (구슬 소진 시 300개)", () => {
  it("보유 구슬이 있으면 충전하지 않음", () => {
    const r = new AutoRecharge();
    expect(r.update(10, 5, 0)).toBe(0);
    expect(r.count).toBe(0);
  });

  it("보유 0 + 필드가 비면 잠깐 뒤 300개 충전", () => {
    const r = new AutoRecharge();
    expect(r.update(RECHARGE_DELAY / 2, 0, 0)).toBe(0);
    expect(r.update(RECHARGE_DELAY / 2 + 0.01, 0, 0)).toBe(RECHARGE_AMOUNT);
    expect(RECHARGE_AMOUNT).toBe(300);
    expect(r.count).toBe(1);
  });

  it("필드에 구슬이 남아 있으면 정리될 때까지 기다림", () => {
    const r = new AutoRecharge();
    expect(r.update(2, 0, 4)).toBe(0);
    expect(r.update(0.5, 0, 0)).toBe(RECHARGE_AMOUNT);
  });

  it("구슬이 끼어 필드가 안 비어도 최대 대기 후 충전", () => {
    const r = new AutoRecharge();
    expect(r.update(RECHARGE_MAX_WAIT - 0.1, 0, 1)).toBe(0);
    expect(r.update(0.2, 0, 1)).toBe(RECHARGE_AMOUNT);
  });

  it("충전 후 보유가 생기면 대기 초기화, 다시 0이 되면 또 충전", () => {
    const r = new AutoRecharge();
    expect(r.update(1, 0, 0)).toBe(RECHARGE_AMOUNT);
    expect(r.update(1, 300, 0)).toBe(0);
    expect(r.update(0.5, 0, 0)).toBe(0);
    expect(r.update(0.5, 0, 0)).toBe(RECHARGE_AMOUNT);
    expect(r.count).toBe(2);
  });
});
