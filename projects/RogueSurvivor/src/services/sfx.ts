import { SFX } from "../data/audio";

/** One decoded buffer per file, bounded voices and coalesced per-kind requests. */
export class SfxMixer {
  private buffers = new Map<string, Promise<AudioBuffer | undefined>>();
  private decoded = new Map<string, AudioBuffer>();
  private last = new Map<string, number>();
  private voices: {
    source: AudioBufferSourceNode;
    gain: GainNode;
    priority: number;
  }[] = [];
  private master: GainNode;
  private volume = -1;
  readonly maxVoices = 12;
  constructor(private ctx: AudioContext) {
    this.master = ctx.createGain();
    this.master.connect(ctx.destination);
    this.setVolume(0);
  }
  setVolume(volume: number) {
    const next = Math.max(0, Math.min(1, Number.isFinite(volume) ? volume : 0));
    if (next === this.volume) return;
    this.volume = next;
    this.master.gain.value = next;
  }
  async load(file: string) {
    if (!this.buffers.has(file))
      this.buffers.set(
        file,
        (async () => {
          try {
            const response = await fetch(
              `${import.meta.env.BASE_URL}audio/sfx/${file}.mp3`,
            );
            if (!response.ok) return;
            const buffer = await this.ctx.decodeAudioData(
              await response.arrayBuffer(),
            );
            this.decoded.set(file, buffer);
            return buffer;
          } catch {
            return;
          }
        })(),
      );
    return this.buffers.get(file)!;
  }
  preload() {
    return Promise.all(
      [...new Set(Object.values(SFX).map((x) => x.file))].map((x) =>
        this.load(x),
      ),
    );
  }
  play(kind: string) {
    const def = SFX[kind],
      now = this.ctx.currentTime;
    if (!def || this.volume <= 0 || this.ctx.state !== "running") return false;
    const key = def.group || kind;
    if (now - (this.last.get(key) ?? -Infinity) < def.cooldown) return false;
    const buffer = this.decoded.get(def.file);
    if (!buffer) {
      void this.load(def.file);
      return false;
    }
    if (this.voices.length >= this.maxVoices) {
      const victim = this.voices.reduce((a, b) =>
        a.priority <= b.priority ? a : b,
      );
      if (victim.priority >= def.priority) return false;
      this.release(victim);
      try {
        victim.source.stop();
      } catch {
        /* already ended */
      }
    }
    this.last.set(key, now);
    const source = this.ctx.createBufferSource(),
      gain = this.ctx.createGain();
    source.buffer = buffer;
    // Audio variation does not touch the gameplay RNG or saved run state.
    source.playbackRate.value =
      def.priority >= 9 ? 1 : 0.98 + Math.random() * 0.04;
    gain.gain.setValueAtTime(def.volume, now);
    source.connect(gain);
    gain.connect(this.master);
    const voice = { source, gain, priority: def.priority };
    this.voices.push(voice);
    source.onended = () => this.release(voice);
    source.start();
    return true;
  }
  private release(v: (typeof this.voices)[number]) {
    const index = this.voices.indexOf(v);
    if (index < 0) return;
    this.voices.splice(index, 1);
    v.source.disconnect();
    v.gain.disconnect();
  }
  batch(kinds: Iterable<string>) {
    const sorted = [...new Set(kinds)].sort(
      (a, b) => (SFX[b]?.priority || 0) - (SFX[a]?.priority || 0),
    );
    for (const kind of sorted) this.play(kind);
  }
  get activeVoices() {
    return this.voices.length;
  }
}
