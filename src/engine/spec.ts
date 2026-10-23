// 스펙 로드 — JSON을 타입드 Spec 으로 노출. (PRD §3, §4.2)
import type { Spec } from "./types.js";
import abyssMax from "../specs/abyss_max.json" with { type: "json" };
import abyssMid from "../specs/abyss_mid.json" with { type: "json" };
import abyssLight from "../specs/abyss_light.json" with { type: "json" };

export const SPECS: Readonly<Record<string, Spec>> = {
  abyss_max: abyssMax as Spec,
  abyss_mid: abyssMid as Spec,
  abyss_light: abyssLight as Spec,
};

export const DEFAULT_SPEC_ID = "abyss_max";

export function getSpec(id: string): Spec {
  const spec = SPECS[id];
  if (!spec) throw new Error(`unknown spec id: ${id}`);
  return spec;
}

/** 1/xxx 형태 환산값. */
export function oddsOf(hitRanges: number, denominator: number): number {
  return denominator / hitRanges;
}
