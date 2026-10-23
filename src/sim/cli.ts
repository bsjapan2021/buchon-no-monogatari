// CLI 시뮬레이터 — `npm run sim [specId] [spins] [seed]`. (PRD P2)
import { getSpec, DEFAULT_SPEC_ID } from "../engine/spec.js";
import { theoreticalStats, reachReliabilities } from "./stats.js";
import { runMonteCarlo } from "./monteCarlo.js";

const specId = process.argv[2] ?? DEFAULT_SPEC_ID;
const spins = Number(process.argv[3] ?? 10_000_000);
const seed = BigInt(process.argv[4] ?? 20261023);

const spec = getSpec(specId);
const th = theoreticalStats(spec);

console.log(`\n=== ${spec.name} (${spec.id}) ===`);
console.log(`회전수: ${spins.toLocaleString()}  시드: ${seed}\n`);

console.log("[이론값]");
console.log(`  통상 대당첨   1/${th.normalOdds.toFixed(2)}`);
console.log(`  ST 대당첨     1/${th.stOdds.toFixed(2)}`);
console.log(`  ST 계속률     ${(th.stContinueRate * 100).toFixed(2)}%`);
console.log(`  시단 당첨률   ${(th.jidanHitRate * 100).toFixed(2)}%`);
console.log(`  ST 평균 추가  ${th.stAvgExtraHits.toFixed(3)}회\n`);

const t0 = Date.now();
const r = runMonteCarlo(spec, spins, seed);
const ms = Date.now() - t0;

console.log("[실측 (몬테카를로)]");
console.log(`  통상 대당첨   1/${r.measuredNormalOdds.toFixed(2)}  (${r.normalHits.toLocaleString()}/${r.normalSpins.toLocaleString()})`);
console.log(`  ST 대당첨     1/${r.measuredStOdds.toFixed(2)}  (${r.stHits.toLocaleString()}/${r.stSpins.toLocaleString()})`);
console.log(`  총 당첨       ${r.hits.toLocaleString()}회`);
console.log(`  총 획득구슬   ${r.totalPayout.toLocaleString()}\n`);

const devNormal = Math.abs(r.measuredNormalOdds - th.normalOdds) / th.normalOdds;
console.log(`  통상확률 편차 ${(devNormal * 100).toFixed(3)}%  (수용기준 ±1%)\n`);

console.log("[리치 신뢰도 (통상 성립 가정)]");
for (const rr of reachReliabilities(spec.normalHitRanges / spec.denominator)) {
  console.log(`  ${rr.label.padEnd(16)} ${(rr.reliability * 100).toFixed(2)}%`);
}
console.log(`\n처리시간: ${ms} ms\n`);
