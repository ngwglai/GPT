import { MAP_PLAYLISTS, MUSIC_GAINS, type MusicTrackId } from "../data/audio";
import type { MapId } from "../data/maps";
import { SfxMixer } from "./sfx";
import type { MusicState } from "./musicPolicy";
import type { Settings } from "../core/types";
export class AudioEngine {
  private ctx?: AudioContext;
  private music?: HTMLAudioElement;
  private track = 0;
  private map?: MapId;
  private mixer?: SfxMixer;
  private ids: readonly MusicTrackId[] = MAP_PLAYLISTS.forest;
  private duck = 1;
  private tracks = this.ids.map(
    (id) => `${import.meta.env.BASE_URL}audio/battle-${id}.mp3`,
  );
  private unlocked = false;
  private failed = new Set<number>();
  private pending = false;
  private active = false;
  setMap(map: MapId, reset = false) {
    if (this.map === map && !reset) return;
    this.map = map;
    this.ids = MAP_PLAYLISTS[map];
    this.tracks = this.ids.map(
      (id) => `${import.meta.env.BASE_URL}audio/battle-${id}.mp3`,
    );
    this.track = 0;
    this.failed.clear();
    if (this.music) this.music.src = this.tracks[this.track];
    this.syncVolume();
  }
  private nextTrack() {
    for (let i = 0; i < this.tracks.length; i++) {
      this.track = (this.track + 1) % this.tracks.length;
      if (!this.failed.has(this.track)) break;
    }
    if (this.music) this.music.src = this.tracks[this.track];
    this.syncVolume();
  }
  private syncVolume() {
    if (this.music)
      this.music.volume = Math.max(
        0,
        Math.min(
          1,
          this.settings.music * this.duck * MUSIC_GAINS[this.ids[this.track]],
        ),
      );
  }
  constructor(public settings: Settings) {}
  unlock() {
    this.unlocked = true;
    try {
      this.ctx ??= new AudioContext();
      if (!this.mixer) {
        this.mixer = new SfxMixer(this.ctx);
        this.mixer.setVolume(this.settings.sfx);
        void this.mixer.preload();
      }
      void this.ctx.resume().catch(() => {});
    } catch {
      /* Audio is optional. */
    }
  }
  setSfxVolume(volume: number) {
    this.settings = { ...this.settings, sfx: volume };
    this.mixer?.setVolume(volume);
  }
  effect(kind: string) {
    this.mixer?.setVolume(this.settings.sfx);
    this.mixer?.play(kind);
  }
  effects(kinds: Iterable<string>) {
    this.mixer?.setVolume(this.settings.sfx);
    this.mixer?.batch(kinds);
  }
  update(_dt: number, state: boolean | MusicState, duck = 1) {
    this.duck = Math.max(0, Math.min(1, duck));
    this.mixer?.setVolume(this.settings.sfx);
    const playing = state === true || state === "playing";
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
    this.syncVolume();
    if (!this.active) {
      music.pause();
      if (state === "stopped") {
        try {
          music.currentTime = 0;
        } catch {
          /* optional media */
        }
      }
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
