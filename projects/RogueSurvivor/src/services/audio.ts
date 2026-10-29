import type { Settings } from "../core/types";
export class AudioEngine {
  private ctx?: AudioContext;
  private timer = 0;
  private step = 0;
  private last = 0;
  constructor(public settings: Settings) {}
  unlock() {
    try {
      this.ctx ??= new AudioContext();
      void this.ctx.resume().catch(() => {});
    } catch {
      /* Audio is optional. */
    }
  }
  tone(
    frequency: number,
    duration: number,
    volume: number,
    type: OscillatorType = "sine",
  ) {
    try {
      const ctx = this.ctx;
      if (!ctx || ctx.state !== "running" || volume <= 0) return;
      const osc = ctx.createOscillator(),
        gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(frequency, ctx.currentTime);
      gain.gain.setValueAtTime(volume * 0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(
        0.0001,
        ctx.currentTime + duration,
      );
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration);
      osc.onended = () => {
        osc.disconnect();
        gain.disconnect();
      };
    } catch {
      /* No gameplay dependency. */
    }
  }
  effect(kind: string) {
    if (performance.now() - this.last < 60) return;
    this.last = performance.now();
    this.tone(
      kind === "hurt"
        ? 100
        : kind === "cast"
          ? 660
          : kind === "level"
            ? 880
            : 330,
      0.18,
      this.settings.sfx,
      kind === "hurt" ? "triangle" : "sine",
    );
  }
  update(dt: number, playing: boolean) {
    if (!playing) return;
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = 0.8;
      this.tone(
        [220, 277, 330, 440, 330, 277, 246, 330][this.step++ % 8],
        1.5,
        this.settings.music * 0.5,
      );
    }
  }
}
