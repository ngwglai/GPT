import type { Run, Mode, SkillId } from "./types";
import { CHARACTERS, LIMITS } from "../data/content";
import { random } from "./math";
export function createRun(
  mode: Mode,
  character = "ranger",
  seed = Date.now() >>> 0,
  primary?: SkillId,
  secondary: SkillId = "ward",
): Run {
  const c = CHARACTERS.find((c) => c.id === character) || CHARACTERS[0];
  const s: Run = {
    version: 1,
    seed,
    rng: seed,
    mode,
    character: c.id,
    time: 0,
    phase: "playing",
    player: {
      x: 1800,
      y: 1800,
      hp: c.hp,
      maxHp: c.hp,
      shield: 0,
      speed: c.speed,
      invincible: 1,
      dash: 0,
      dashCd: 0,
      dx: 1,
      dy: 0,
      level: 1,
      xp: 0,
      attack: 1,
      crit: 0.08,
      regen: 0.15,
      magnet: 100,
      cooldown: 1,
      weapons: { [c.weapon]: 1 },
      weaponTimers: { bow: 0, blade: 0, ember: 0, orbit: 0, drone: 0 },
      skills: [primary || c.skill, secondary, "storm"],
      skillLevels: { fire: 1, ice: 1, lance: 1, ward: 1, bloom: 1, storm: 1 },
      cooldowns: [0, 0, 0],
      upgrades: { ["weapon_" + c.weapon]: 1 },
    },
    enemies: [],
    bullets: [],
    zones: [],
    gems: [],
    rocks: [],
    stats: {
      kills: 0,
      damage: 0,
      taken: 0,
      healed: 0,
      bosses: 0,
      bySource: {},
      peakEnemies: 0,
      peakBullets: 0,
    },
    spawnTimer: 1,
    nextBoss: 300,
    bossIndex: 0,
    nextId: 1,
    choices: [],
    event: "星林初醒",
    eventUntil: 9,
    nextEvent: 90,
    victoryClaimed: false,
  };
  for (let y = 320; y < LIMITS.world - 200; y += 380)
    for (let x = 300; x < LIMITS.world - 200; x += 390) {
      if (Math.hypot(x - 1800, y - 1800) < 390) continue;
      s.rocks.push({
        x: x + random(s) * 90,
        y: y + random(s) * 90,
        r: 25 + random(s) * 25,
      });
    }
  return s;
}
