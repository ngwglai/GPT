import type { Combat } from "./combat";
import type { Enemy, EnemyId, Run, Vec } from "./types";
import { difficulty, ENEMIES, LIMITS } from "../data/content";
import { MAPS } from "../data/maps";
import { environment } from "./environment";
import { random } from "./math";

export const WAVE_RULES = {
  bossEvery: 5,
  finalBoss: 4,
  normalDuration: 55,
  bossDuration: 75,
  maxBudget: 360,
  maxNumber: LIMITS.number,
};
export interface WaveState {
  schema: 1;
  number: number;
  startedAt: number;
  duration: number;
  budget: number;
  processed: number;
  spawned: number;
  skipped: number;
  status: "entering" | "active";
  boss: boolean;
  announced: boolean;
}
function budget(number: number) {
  const points = [
    [1, 28],
    [5, 52],
    [10, 86],
    [15, 120],
    [20, 156],
    [30, 210],
    [60, 280],
    [120, 360],
  ];
  for (let i = 1; i < points.length; i++) {
    const [x, y] = points[i],
      [a, b] = points[i - 1];
    if (number <= x) return Math.round(b + ((y - b) * (number - a)) / (x - a));
  }
  return WAVE_RULES.maxBudget;
}
export function newWave(number: number, startedAt: number): WaveState {
  number = Math.max(1, Math.min(WAVE_RULES.maxNumber, Math.floor(number)));
  const boss = number % WAVE_RULES.bossEvery === 0;
  return {
    schema: 1,
    number,
    startedAt,
    duration: boss ? WAVE_RULES.bossDuration : WAVE_RULES.normalDuration,
    budget: budget(number),
    processed: 0,
    spawned: 0,
    skipped: 0,
    status: "entering",
    boss,
    announced: false,
  };
}
export function entryWindow(w: WaveState) {
  return Math.min(24, 10 + (w.number - 1) * 0.3);
}
/** Explicit legacy conversion: existing enemies are already admitted, never replay them. */
export function migrateWaves(s: Run): WaveState {
  const w = newWave(
    Math.max(Math.floor(s.time / 60) + 1, s.bossIndex * 5, 1),
    s.time,
  );
  w.processed = w.budget;
  w.spawned = w.budget;
  w.status = "active";
  w.announced = true;
  for (const e of s.enemies)
    if (ENEMIES[e.kind]?.boss) e.bossOrdinal ??= Math.max(1, s.bossIndex);
  return w;
}
export function ensureWaves(s: Run) {
  return (s.wave ??= migrateWaves(s));
}
export function bossesDue(s: Run) {
  const due = Math.floor(ensureWaves(s).number / WAVE_RULES.bossEvery);
  return s.mode === "standard" ? Math.min(WAVE_RULES.finalBoss, due) : due;
}
export function waveRemaining(s: Run) {
  const w = ensureWaves(s);
  return Math.max(0, w.duration - (s.time - w.startedAt));
}
type Spawn = (
  c: Combat,
  kind: EnemyId,
  position?: Vec,
  elite?: boolean,
) => Enemy | undefined;
/** At most one transition per step. Unadmitted ordinary slots expire at the cap, not a queue. */
export function tickWaves(c: Combat, _dt: number, spawn: Spawn) {
  const s = c.s;
  let w = ensureWaves(s);
  if (
    waveRemaining(s) <= 0 ||
    (w.processed >= w.budget &&
      !s.enemies.some((e) => e.hp > 0) &&
      s.bossIndex >= bossesDue(s))
  ) {
    w = s.wave = newWave(w.number + 1, s.time);
  }
  if (s.mode === "standard" && w.number > 20) {
    w.boss = false;
    w.duration = WAVE_RULES.normalDuration;
  }
  if (!w.announced) {
    w.announced = true;
    c.sound(w.boss ? "bossWave" : "wave");
  }
  const map = MAPS[environment(s).mapId];
  // Pending bosses are an ordinal range [bossIndex+1, due], constant space even in endless.
  if (
    s.bossIndex < bossesDue(s) &&
    !s.enemies.some((e) => e.hp > 0 && ENEMIES[e.kind].boss)
  ) {
    const index = s.bossIndex;
    const kind =
      s.mode === "endless" && index >= 4 && index % 3 === 2
        ? "mirrorMaiden"
        : map.bosses[index % map.bosses.length];
    const e = spawn(c, kind);
    if (e) {
      e.bossOrdinal = ++s.bossIndex;
      s.event = `首领降临 · ${ENEMIES[kind].name}`;
      s.eventUntil = s.time + 8;
      c.sound("bossWave");
    }
  }
  const elapsed = Math.max(0, s.time - w.startedAt);
  const swarm = s.event === "兽潮来袭" && s.time < s.eventUntil ? 1 / 0.6 : 1;
  const target = Math.min(
    w.budget,
    Math.floor(
      w.budget * Math.min(1, (elapsed * swarm + 0.8) / entryWindow(w)),
    ),
  );
  // Unlock composition by expedition progress, strength remains tied to actual survival time.
  const unlock = Math.max(s.time, (w.number - 1) * 60);
  const pool = map.spawns.filter((x) => unlock >= x.after);
  const d = difficulty(s.time);
  while (w.processed < target) {
    let roll = random(s) * pool.reduce((n, x) => n + x.weight, 0);
    const chosen = pool.find((x) => (roll -= x.weight) < 0) || pool[0];
    const elite = random(s) < d.elite;
    const kind =
      elite && unlock > 300 && random(s) < 0.3
        ? map.elite[Math.floor(random(s) * map.elite.length)]
        : chosen.kind;
    w.processed++;
    if (
      s.enemies.length < LIMITS.enemies - 3 &&
      spawn(c, kind, undefined, elite)
    )
      w.spawned++;
    else w.skipped++;
  }
  w.status = w.processed >= w.budget ? "active" : "entering";
}
