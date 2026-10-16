/** Accumulates fixed simulation ticks; drops backlog after a long frame or hidden tab. */
export class SimulationClock {
  running = false;
  private previous: number | undefined;
  private carry = 0;

  play(): void {
    this.running = true;
    this.previous = undefined;
  }
  pause(): void {
    this.running = false;
    this.previous = undefined;
    this.carry = 0;
  }
  reset(): void {
    this.pause();
  }
  resync(): void {
    this.previous = undefined;
    this.carry = 0;
  }

  frame(now: number, ticksPerSecond: number, tick: () => void): number {
    if (
      !this.running ||
      !Number.isFinite(now) ||
      !Number.isFinite(ticksPerSecond) ||
      ticksPerSecond <= 0
    )
      return 0;
    if (this.previous === undefined) {
      this.previous = now;
      return 0;
    }
    const elapsed = Math.min(0.1, Math.max(0, (now - this.previous) / 1000));
    this.previous = now;
    this.carry += elapsed * ticksPerSecond;
    const steps = Math.min(24, Math.floor(this.carry + 1e-9));
    this.carry -= steps;
    for (let i = 0; i < steps; i++) tick();
    return steps;
  }

  singleStep(tick: () => void): void {
    if (!this.running) tick();
  }
}
