import { afterEach, expect, it, vi } from "vitest";
import { SfxMixer } from "../src/services/sfx";
import { SFX } from "../src/data/audio";
class Gain {
  gain = {
    value: 0,
    setValueAtTime(value: number) {
      this.value = value;
    },
  };
  disconnect = vi.fn();
  connect = vi.fn();
}
class Source {
  buffer = {};
  playbackRate = { value: 1 };
  onended?: () => void;
  disconnect = vi.fn();
  connect = vi.fn();
  start = vi.fn();
  stop = vi.fn(() => this.onended?.());
}
class Context {
  currentTime = 0;
  state = "running";
  destination = {};
  sources: Source[] = [];
  gains: Gain[] = [];
  createGain() {
    const g = new Gain();
    this.gains.push(g);
    return g;
  }
  createBufferSource() {
    const s = new Source();
    this.sources.push(s);
    return s;
  }
  decodeAudioData = vi.fn(async () => ({}));
}
afterEach(() => vi.unstubAllGlobals());
async function ready() {
  const ctx = new Context();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(8),
    })),
  );
  const m = new SfxMixer(ctx as unknown as AudioContext);
  m.setVolume(0.5);
  await m.preload();
  return { ctx, m };
}
it("sample buffers decode once per file, never once per event", async () => {
  const { m, ctx } = await ready();
  const count = new Set(Object.values(SFX).map((x) => x.file)).size;
  expect(ctx.decodeAudioData).toHaveBeenCalledTimes(count);
  await m.preload();
  for (let i = 0; i < 100; i++) {
    m.play("pickup");
    ctx.currentTime += 0.02;
  }
  expect(ctx.decodeAudioData).toHaveBeenCalledTimes(count);
  expect(m.activeVoices).toBeLessThanOrEqual(12);
});
it("high-density attacks and pickups coalesce and share frequency budgets", async () => {
  const { m, ctx } = await ready();
  for (let i = 0; i < 20; i++)
    m.batch(["attack", "attackStrong", "pickup", "death"]);
  expect(ctx.sources).toHaveLength(3);
  ctx.currentTime = 0.2;
  m.play("pickup");
  expect(ctx.sources).toHaveLength(4);
});
it("boss warning preempts a low-priority voice and ended voices disconnect", async () => {
  const { m, ctx } = await ready();
  for (let i = 0; i < 12; i++) {
    ctx.currentTime += 0.2;
    m.play("attack");
  }
  expect(m.activeVoices).toBe(12);
  expect(m.play("warning")).toBe(true);
  expect(m.activeVoices).toBe(12);
  expect(ctx.sources[0].stop).toHaveBeenCalledOnce();
  expect(m.play("death")).toBe(false);
  ctx.sources.at(-1)!.onended!();
  expect(m.activeVoices).toBe(11);
  expect(ctx.sources.at(-1)!.disconnect).toHaveBeenCalledOnce();
});
it("zero volume instantly mutes active samples and prevents new voices", async () => {
  const { m, ctx } = await ready();
  expect(m.play("attack")).toBe(true);
  m.setVolume(0);
  expect(ctx.gains[0].gain.value).toBe(0);
  expect(m.play("warning")).toBe(false);
  m.setVolume(0.7);
  expect(ctx.gains[0].gain.value).toBe(0.7);
  expect(m.play("warning")).toBe(true);
});
it("download and decode failures are cached and do not block gameplay", async () => {
  const ctx = new Context();
  const fetch = vi.fn(async () => {
    throw new Error("offline");
  });
  vi.stubGlobal("fetch", fetch);
  const m = new SfxMixer(ctx as unknown as AudioContext);
  m.setVolume(0.4);
  await expect(m.load("attack")).resolves.toBeUndefined();
  expect(m.play("attack")).toBe(false);
  await m.load("attack");
  expect(fetch).toHaveBeenCalledOnce();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(0),
    })),
  );
  ctx.decodeAudioData.mockRejectedValueOnce(new Error("bad codec"));
  await expect(m.load("bad")).resolves.toBeUndefined();
});
