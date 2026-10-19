// Mulberry32: integer state, same stream on every supported JS engine.
export class Random {
  private state: number;
  constructor(seed: number) {
    this.state = seed >>> 0;
  }
  next(): number {
    let t = (this.state += 0x6d2b79f5);
    this.state >>>= 0;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  int(max: number): number {
    if (!Number.isInteger(max) || max < 1) throw new Error("无效随机范围");
    return Math.floor(this.next() * max);
  }
  shuffle<T>(values: T[]): T[] {
    for (let i = values.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      [values[i], values[j]] = [values[j], values[i]];
    }
    return values;
  }
}
