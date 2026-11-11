import type { MapId } from "./maps";
// New titles read from upload ID3; old titles retain the verified v1.5 mapping.
export const MUSIC_TRACKS = {
  1: "サイバーバトルビート",
  2: "Crystal Sparkle Battle",
  3: "月lightの幻想曲",
  4: "軽快な戦闘テーマ",
  5: "Sugar Rush Battle（原文件 Battle1）",
  6: "Sugar Rush Battle（原文件 Battle）",
  7: "最終の旋律",
  8: "Enchanted Circus Swing",
  9: "Abandoned Sanctuary",
  10: "冒険の旋律",
  11: "星森冒険曲",
  12: "Frozen Dawn",
} as const;
export type MusicTrackId = keyof typeof MUSIC_TRACKS;
// Measured EBU R128: attenuation only, target -16 LUFS / true peak <= -1 dBTP.
export const MUSIC_GAINS: Record<MusicTrackId, number> = {
  1: 0.8414,
  2: 0.8318,
  3: 0.861,
  4: 0.8035,
  5: 0.8414,
  6: 0.8128,
  7: 0.7762,
  8: 0.881,
  9: 0.8128,
  10: 0.8035,
  11: 0.871,
  12: 0.7762,
};
export const MAP_PLAYLISTS: Record<MapId, readonly MusicTrackId[]> = {
  forest: [11, 10, 4, 3],
  cavern: [2, 12, 3, 10],
  garden: [8, 6, 5, 11],
  eclipse: [9, 7, 1, 12],
};
export interface SfxDefinition {
  file: string;
  volume: number;
  cooldown: number;
  priority: number;
  group?: string;
}
const sound = (
  file: string,
  volume: number,
  cooldown: number,
  priority: number,
  group?: string,
): SfxDefinition => ({ file, volume, cooldown, priority, group });
export const SFX: Record<string, SfxDefinition> = {
  attack: sound("attack", 0.22, 0.13, 1, "attack"),
  attackStrong: sound("impact", 0.32, 0.13, 2, "attack"),
  "cast-fire": sound("fire", 0.65, 0.15, 5),
  "cast-ice": sound("ice", 0.6, 0.15, 5),
  "cast-lance": sound("lance", 0.65, 0.15, 5),
  "cast-ward": sound("ward", 0.55, 0.15, 5),
  "cast-bloom": sound("bloom", 0.6, 0.15, 5),
  "cast-storm": sound("storm", 0.7, 0.15, 6),
  cast: sound("fire", 0.65, 0.15, 5),
  dash: sound("dash", 0.4, 0.18, 4),
  hurt: sound("hurt", 0.65, 0.2, 7),
  death: sound("death", 0.24, 0.14, 1),
  pickup: sound("pickup", 0.25, 0.1, 1),
  level: sound("level", 0.65, 0.3, 6),
  card: sound("card", 0.5, 0.15, 4),
  rare: sound("rare", 0.7, 0.2, 6),
  chest: sound("chest", 0.7, 0.2, 6),
  wave: sound("wave", 0.55, 0.6, 6),
  bossWave: sound("boss", 0.85, 0.8, 9),
  warning: sound("warning", 0.65, 0.35, 10),
  bossDefeat: sound("defeat", 0.8, 0.5, 9),
  victory: sound("victory", 0.85, 0.5, 10),
  defeatPlayer: sound("failure", 0.65, 0.5, 10),
  revive: sound("bloom", 0.75, 0.5, 10),
  revived: sound("rare", 0.65, 0.5, 9),
  spark: sound("pickup", 0.6, 0.3, 8),
  failure: sound("failure", 0.7, 0.5, 10),
  ui: sound("ui", 0.35, 0.07, 3),
};
