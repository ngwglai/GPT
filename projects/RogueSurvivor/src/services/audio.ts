import type { Settings } from "../core/types";
export class AudioEngine {
  private ctx?: AudioContext;
  private music?: HTMLAudioElement;
  private track = 0;
  private unlocked = false;
  private failed = new Set<number>();
  private pending = false;
  private active = false;
  private readonly tracks = Array.from(
    { length: 6 },
    (_, i) => `${import.meta.env.BASE_URL}audio/battle-${i + 1}.mp3`,
  );
  private nextTrack() {
    this.track = (this.track + 1) % this.tracks.length;
    if (this.music) this.music.src = this.tracks[this.track];
  }
  private last = 0;
  constructor(public settings: Settings) {}
  unlock() {
    this.unlocked = true;
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
  update(_dt: number, playing: boolean) {
    this.active =
      playing &&
      this.settings.music > 0 &&
      this.settings.musicEnabled !== false;
    if (!this.music && this.unlocked) {
      this.music = new Audio(this.tracks[this.track]);
      this.music.preload = "metadata";
      this.music.addEventListener("ended", () => this.nextTrack());
      this.music.addEventListener("error", () => {
        this.failed.add(this.track);
        if (this.failed.size < this.tracks.length) this.nextTrack();
      });
    }
    const music = this.music;
    if (!music) return;
    music.volume = Math.max(0, Math.min(1, this.settings.music));
    if (!this.active) {
      music.pause();
      return;
    }
    if (
      music.paused &&
      !this.pending &&
      this.failed.size < this.tracks.length
    ) {
      this.pending = true;
      void music
        .play()
        .then(() => {
          if (!this.active) music.pause();
        })
        .catch(() => {
          /* Browser autoplay restrictions never block gameplay. */
        })
        .finally(() => {
          this.pending = false;
        });
    }
  }
}
