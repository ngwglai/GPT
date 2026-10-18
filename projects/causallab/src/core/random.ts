export function checkSeed(seed: number) {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff)
    throw new Error("随机种子必须为 0–4294967295 的整数");
}
// Mulberry32, fixed unsigned 32-bit arithmetic; never uses time or Math.random.
export function random(seed: number): () => number {
  checkSeed(seed);
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
