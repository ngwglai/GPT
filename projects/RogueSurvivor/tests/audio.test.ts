import { afterEach, expect, test, vi } from "vitest";
import { MAP_PLAYLISTS, MUSIC_GAINS } from "../src/data/audio";
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
test("default forest tracks wrap, pause, volume and independent switch", async () => {
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
  expect(m.volume).toBeCloseTo(0.3 * MUSIC_GAINS[MAP_PLAYLISTS.forest[0]]);
  const first = m.src;
  for (let i = 0; i < MAP_PLAYLISTS.forest.length; i++)
    m.dispatchEvent(new Event("ended"));
  expect(m.src).toBe(first);
  a.update(0, false);
  expect(m.paused).toBe(true);
  a.settings.musicEnabled = false;
  a.update(0, true);
  expect(m.paused).toBe(true);
  a.settings.musicEnabled = true;
  a.settings.music = 0.7;
  a.update(0, true);
  expect(m.volume).toBeCloseTo(0.7 * MUSIC_GAINS[MAP_PLAYLISTS.forest[0]]);
});
test("broken playlist stops after one failure per forest track", () => {
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
  for (let i = 0; i < MAP_PLAYLISTS.forest.length; i++)
    Track.current.dispatchEvent(new Event("error"));
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

test.each(["forest", "cavern", "garden", "eclipse"] as const)(
  "%s playlist loops locally and keeps one element across restore",
  async (map) => {
    const { MAP_PLAYLISTS } = await import("../src/data/audio");
    vi.stubGlobal("Audio", Track);
    const a = new AudioEngine({
      music: 0.3,
      sfx: 0.5,
      quality: "high",
      shake: false,
      showStats: false,
    });
    a.setMap(map);
    a.unlock();
    a.update(0, "playing");
    const media = Track.current;
    const expected = MAP_PLAYLISTS[map];
    for (let i = 0; i < expected.length * 2; i++) {
      expect(media.src).toContain(
        `battle-${expected[i % expected.length]}.mp3`,
      );
      media.dispatchEvent(new Event("ended"));
    }
    a.setMap(map);
    expect(Track.current).toBe(media);
    a.update(0, "paused");
    expect(media.paused).toBe(true);
    a.update(0, "playing");
  },
);
test("switching maps resets only its playlist and failure scope", () => {
  vi.stubGlobal("Audio", Track);
  const a = new AudioEngine({
    music: 0.3,
    sfx: 0.5,
    quality: "high",
    shake: false,
    showStats: false,
  });
  a.setMap("cavern");
  a.unlock();
  a.update(0, "paused");
  const media = Track.current;
  for (let i = 0; i < MAP_PLAYLISTS.cavern.length; i++)
    media.dispatchEvent(new Event("error"));
  a.update(0, "playing");
  expect(media.paused).toBe(true);
  a.setMap("garden");
  a.update(0, "playing");
  expect(media.src).toContain(`battle-${MAP_PLAYLISTS.garden[0]}.mp3`);
  expect(media.paused).toBe(false);
  expect(Track.current).toBe(media);
});
test("defeat/revival ducking keeps the same track, volume restores without restart", async () => {
  class Media extends Track {
    currentTime = 29;
  }
  vi.stubGlobal("Audio", Media);
  const a = new AudioEngine({
    music: 0.6,
    sfx: 0.5,
    quality: "high",
    shake: false,
    showStats: false,
  });
  a.unlock();
  a.update(0, "playing");
  await Promise.resolve();
  const media = Track.current as Media;
  a.update(0, "playing", 0.35);
  expect(media.volume).toBeCloseTo(0.21 * MUSIC_GAINS[MAP_PLAYLISTS.forest[0]]);
  expect(media.currentTime).toBe(29);
  a.update(0, "playing", 1);
  expect(media.volume).toBeCloseTo(0.6 * MUSIC_GAINS[MAP_PLAYLISTS.forest[0]]);
  expect(Track.current).toBe(media);
});
test.each(["dying", "revive", "reviving"] as const)(
  "%s music continues softly unless explicitly paused or hidden",
  async (phase) => {
    const { musicState } = await import("../src/services/musicPolicy");
    const { createRun } = await import("../src/core/create");
    const s = createRun("endless");
    s.phase = phase;
    expect(musicState(s, phase, false, false)).toBe("playing");
    expect(musicState(s, phase, true, false)).toBe("paused");
    expect(musicState(s, phase, false, true)).toBe("paused");
    s.phase = "dead";
    expect(musicState(s, "result", false, false)).toBe("stopped");
  },
);

test("12 local files are assigned once to four three-track themed playlists", async () => {
  const { MUSIC_TRACKS, MAP_PLAYLISTS, MUSIC_GAINS } =
    await import("../src/data/audio");
  const { statSync } = await import("node:fs");
  expect(Object.keys(MUSIC_TRACKS)).toHaveLength(12);
  expect(MAP_PLAYLISTS).toEqual({
    forest: [11, 10, 4],
    cavern: [2, 12, 1],
    garden: [8, 6, 5],
    eclipse: [9, 3, 7],
  });
  const all = Object.values(MAP_PLAYLISTS).flat();
  expect(all).toHaveLength(12);
  expect([...new Set(all)].sort((a, b) => a - b)).toEqual(
    Array.from({ length: 12 }, (_, i) => i + 1),
  );
  expect(
    new Set(Object.values(MAP_PLAYLISTS).map((x) => x.join(","))).size,
  ).toBe(4);
  for (const list of Object.values(MAP_PLAYLISTS)) {
    expect(list).toHaveLength(3);
    expect(new Set(list).size).toBe(list.length);
    for (const id of list) {
      expect(statSync(`public/audio/battle-${id}.mp3`).size).toBeGreaterThan(
        1e6,
      );
      expect(MUSIC_GAINS[id]).toBeGreaterThan(0);
      expect(MUSIC_GAINS[id]).toBeLessThanOrEqual(1);
    }
  }
});
test("track gain is applied before rollover playback and multiplies volume/duck", async () => {
  vi.stubGlobal("Audio", Track);
  const a = new AudioEngine({
    music: 0.7,
    sfx: 0.5,
    quality: "high",
    shake: false,
    showStats: false,
  });
  a.setMap("eclipse");
  a.unlock();
  a.update(0, "playing", 0.35);
  const m = Track.current;
  expect(m.volume).toBeCloseTo(0.7 * 0.35 * MUSIC_GAINS[9]);
  m.dispatchEvent(new Event("ended"));
  expect(m.src).toContain("battle-3.mp3");
  expect(m.volume).toBeCloseTo(0.7 * 0.35 * MUSIC_GAINS[3]);
  a.settings.music = 0;
  a.update(0, "playing");
  expect(m.volume).toBe(0);
  expect(m.paused).toBe(true);
});
test("one broken song is skipped within the current map, autoplay rejection is harmless", async () => {
  class Denied extends Track {
    play() {
      return Promise.reject(new Error("autoplay"));
    }
  }
  vi.stubGlobal("Audio", Denied);
  const a = new AudioEngine({
    music: 0.5,
    sfx: 0.5,
    quality: "high",
    shake: false,
    showStats: false,
  });
  a.setMap("cavern");
  a.unlock();
  a.update(0, "playing");
  await new Promise((r) => setTimeout(r, 0));
  const m = Track.current;
  m.dispatchEvent(new Event("error"));
  expect(m.src).toContain("battle-12.mp3");
  expect(() => a.update(0, "playing")).not.toThrow();
  await new Promise((r) => setTimeout(r, 0));
});
