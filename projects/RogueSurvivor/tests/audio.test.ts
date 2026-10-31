import { afterEach, expect, test, vi } from "vitest";
import { AudioEngine } from "../src/services/audio";
class Track extends EventTarget {
  static current: Track;
  paused = true;
  volume = 1;
  preload = "";
  constructor(public src: string) { super(); Track.current = this; }
  play() { this.paused = false; return Promise.resolve(); }
  pause() { this.paused = true; }
}
afterEach(() => vi.unstubAllGlobals());
test("six tracks wrap, pause, volume and independent switch", async () => {
  vi.stubGlobal("Audio", Track);
  const a = new AudioEngine({ music: .3, sfx: .5, quality: "low", shake: false, showStats: false });
  a.unlock(); a.update(0, true); await Promise.resolve(); await Promise.resolve();
  const m = Track.current;
  expect(m.paused).toBe(false); expect(m.volume).toBe(.3);
  const first = m.src;
  for (let i = 0; i < 6; i++) m.dispatchEvent(new Event("ended"));
  expect(m.src).toBe(first);
  a.update(0, false); expect(m.paused).toBe(true);
  a.settings.musicEnabled = false; a.update(0, true); expect(m.paused).toBe(true);
  a.settings.musicEnabled = true; a.settings.music = .7; a.update(0, true);
  expect(m.volume).toBe(.7);
});
test("broken playlist stops after six failures", () => {
  vi.stubGlobal("Audio", Track);
  const a = new AudioEngine({ music: .3, sfx: .5, quality: "low", shake: false, showStats: false });
  a.unlock(); a.update(0, false);
  for (let i = 0; i < 6; i++) Track.current.dispatchEvent(new Event("error"));
  const src = Track.current.src; a.update(0, true);
  expect(Track.current.src).toBe(src); expect(Track.current.paused).toBe(true);
});
