// xoshiro256** 64비트 PRNG — 시드 고정으로 재현성 보장 (PRD §4.1).
// 결정성을 위해 BigInt 64비트 연산을 사용한다.

const MASK64 = (1n << 64n) - 1n;

function rotl(x: bigint, k: bigint): bigint {
  return ((x << k) | (x >> (64n - k))) & MASK64;
}

/** splitmix64 — 단일 시드로부터 256비트 상태를 안정적으로 전개. */
function splitmix64(seed: bigint): () => bigint {
  let z = seed & MASK64;
  return () => {
    z = (z + 0x9e3779b97f4a7c15n) & MASK64;
    let r = z;
    r = ((r ^ (r >> 30n)) * 0xbf58476d1ce4e5b9n) & MASK64;
    r = ((r ^ (r >> 27n)) * 0x94d049bb133111ebn) & MASK64;
    return r ^ (r >> 31n);
  };
}

export class Rng {
  private s0: bigint;
  private s1: bigint;
  private s2: bigint;
  private s3: bigint;

  constructor(seed: number | bigint = 0x1234_5678n) {
    const sm = splitmix64(BigInt(seed) & MASK64);
    this.s0 = sm();
    this.s1 = sm();
    this.s2 = sm();
    this.s3 = sm();
  }

  /** 다음 64비트 난수. */
  nextU64(): bigint {
    const result = (rotl((this.s1 * 5n) & MASK64, 7n) * 9n) & MASK64;
    const t = (this.s1 << 17n) & MASK64;
    this.s2 ^= this.s0;
    this.s3 ^= this.s1;
    this.s1 ^= this.s2;
    this.s0 ^= this.s3;
    this.s2 ^= t;
    this.s3 = rotl(this.s3, 45n);
    return result;
  }

  /** [0, bound) 범위 정수. 거부 표집으로 모듈로 편향 제거. */
  nextInt(bound: number): number {
    if (bound <= 0) throw new RangeError("bound must be > 0");
    const b = BigInt(bound);
    // 64비트 공간에서 bound 배수의 상한 — 그 위는 거부.
    const limit = (MASK64 - (MASK64 % b));
    let x = this.nextU64();
    while (x >= limit) x = this.nextU64();
    return Number(x % b);
  }

  /** [0, 1) 실수 (53비트). */
  nextFloat(): number {
    return Number(this.nextU64() >> 11n) / 2 ** 53;
  }
}
