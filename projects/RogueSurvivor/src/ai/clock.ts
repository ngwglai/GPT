export const FIXED_DT = 1 / 60;
export const SPEEDS = [0.5, 1, 2, 4, 8] as const;
export type Speed = (typeof SPEEDS)[number];
/** Scale requested work, never the dt passed to the game. Overflow slows simulation; no game time is skipped. */
export class SimulationClock {
  speed: Speed = 1;
  paused = false;
  private debt = 0;
  limited = false;
  reset() {
    this.debt = 0;
    this.limited = false;
  }
  advance(
    realSeconds: number,
    step: () => boolean,
    now = () => performance.now(),
    budgetMs = 8,
  ) {
    if (this.paused || !Number.isFinite(realSeconds) || realSeconds <= 0)
      return 0;
    this.debt += Math.min(0.25, realSeconds) * this.speed;
    const start = now();
    let ticks = 0;
    while (this.debt + 1e-10 >= FIXED_DT && ticks < 48) {
      if (ticks > 0 && now() - start >= budgetMs) break;
      if (!step()) {
        this.reset();
        return ticks;
      }
      this.debt -= FIXED_DT;
      ticks++;
    }
    this.limited = this.debt >= FIXED_DT;
    if (this.limited) this.debt = Math.min(this.debt, FIXED_DT * 2);
    return ticks;
  }
}
