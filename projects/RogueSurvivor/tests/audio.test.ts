import { afterEach, expect, test, vi } from "vitest";
import { AudioEngine } from "../src/services/audio";
class Track extends EventTarget {
  static current: Track;
  paused = true;
  volume = 1;
  preload = "";
  constructor(public src: string) {
    super();
    Track.current = this;
  }
  play() {
    this.paused = false;
    return Promise.resolve();
  }
  pause() {
    this.paused = true;
  }
}
afterEach(() => vi.unstubAllGlobals());
test("six tracks wrap, pause, volume and independent switch", async () => {
  vi.stubGlobal("Audio", Track);
  const a = new AudioEngine({
    music: 0.3,
    sfx: 0.5,
    quality: "low",
    shake: false,
    showStats: false,
  });
  a.unlock();
  a.update(0, true);
  await Promise.resolve();
  await Promise.resolve();
  const m = Track.current;
  expect(m.paused).toBe(false);
  expect(m.volume).toBe(0.3);
  const first = m.src;
  for (let i = 0; i < 6; i++) m.dispatchEvent(new Event("ended"));
  expect(m.src).toBe(first);
  a.update(0, false);
  expect(m.paused).toBe(true);
  a.settings.musicEnabled = false;
  a.update(0, true);
  expect(m.paused).toBe(true);
  a.settings.musicEnabled = true;
  a.settings.music = 0.7;
  a.update(0, true);
  expect(m.volume).toBe(0.7);
});
test("broken playlist stops after six failures", () => {
  vi.stubGlobal("Audio", Track);
  const a = new AudioEngine({
    music: 0.3,
    sfx: 0.5,
    quality: "low",
    shake: false,
    showStats: false,
  });
  a.unlock();
  a.update(0, false);
  for (let i = 0; i < 6; i++) Track.current.dispatchEvent(new Event("error"));
  const src = Track.current.src;
  a.update(0, true);
  expect(Track.current.src).toBe(src);
  expect(Track.current.paused).toBe(true);
});
test("card modals retain progress, next song plays and only one media element exists", async () => {
  let count = 0;
  class Media extends Track {
    currentTime = 37;
    constructor(src: string) {
      super(src);
      count++;
    }
  }
  vi.stubGlobal("Audio", Media);
  const a = new AudioEngine({
    music: 0.4,
    sfx: 0.8,
    quality: "high",
    shake: false,
    showStats: false,
  });
  a.unlock();
  a.update(0, "playing");
  await new Promise((r) => setTimeout(r, 0));
  const m = Track.current as Media;
  for (let i = 0; i < 50; i++) a.update(0.1, "playing");
  expect(m.currentTime).toBe(37);
  expect(m.paused).toBe(false);
  expect(count).toBe(1);
  const previous = m.src;
  m.dispatchEvent(new Event("ended"));
  m.paused = true;
  a.update(0.1, "playing");
  await new Promise((r) => setTimeout(r, 0));
  expect(m.src).not.toBe(previous);
  expect(m.paused).toBe(false);
  expect(count).toBe(1);
  a.update(0, "paused");
  expect(m.currentTime).toBe(37);
  expect(m.paused).toBe(true);
  a.update(0, "playing");
  await new Promise((r) => setTimeout(r, 0));
  expect(m.paused).toBe(false);
  a.update(0, "stopped");
  expect(m.currentTime).toBe(0);
  expect(m.paused).toBe(true);
});
