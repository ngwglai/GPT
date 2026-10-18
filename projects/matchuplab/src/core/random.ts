export type Random = () => number;

// Mulberry32: explicit 32-bit state, including seed zero.
export function createRandom(seed: number): Random {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function stream(seed: number, salt: number): Random {
  return createRandom((seed ^ Math.imul(salt, 0x9e3779b9)) >>> 0);
}

export function sample(probabilities: readonly number[], random: Random): number {
  const u = random();
  let cumulative = 0;
  for (let i = 0; i < probabilities.length; i++) {
    cumulative += probabilities[i];
    if (u < cumulative) return i;
  }
  return probabilities.length - 1; // Floating point rounding at the last boundary.
}

export function greedy(values: readonly number[]): number[] {
  const best = Math.max(...values);
  const ties = values.filter(v => v === best).length;
  return values.map(v => v === best ? 1 / ties : 0);
}
