export type Random = () => number;

export function bounded(
  value: number,
  min: number,
  max: number,
  fallback: number,
  integer = false,
): number {
  const result = Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
  return integer ? Math.round(result) : result;
}

/** Seeded generator for reproducible experiments and deterministic tests. */
export function seededRandom(seed: number): Random {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shannonEntropy(counts: ArrayLike<number>): number {
  const values = Array.from(counts);
  if (values.some((n) => !Number.isFinite(n) || n < 0))
    throw new RangeError('Counts must be finite and nonnegative');
  const total = values.reduce((sum, n) => sum + n, 0);
  if (!Number.isFinite(total)) throw new RangeError('Count sum must be finite');
  return total === 0
    ? 0
    : -values.reduce((sum, n) => (n === 0 ? sum : sum + (n / total) * Math.log2(n / total)), 0);
}
