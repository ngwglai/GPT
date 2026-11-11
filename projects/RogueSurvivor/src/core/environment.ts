import type { Combat } from "./combat";
import type { Run, Vec } from "./types";
import {
  emptyEnvironment,
  type BuffKind,
  type MagicField,
} from "./environmentTypes";
import { ENV_RULES, MAPS, type MapId } from "../data/maps";
import { LIMITS } from "../data/content";
import { clamp, distance, random } from "./math";
export function environment(s: Run) {
  return (s.environment ??= emptyEnvironment());
}
export function addBuff(s: Run, kind: BuffKind, life = ENV_RULES.buffTime) {
  const env = environment(s),
    old = env.buffs.find((x) => x.kind === kind);
  if (old) old.life = Math.max(old.life, life);
  else if (env.buffs.length < 9) env.buffs.push({ kind, life });
}
export function temporary(
  s: Run,
  key: "speed" | "damage" | "interval" | "cooldown",
) {
  const has = (k: BuffKind) =>
    environment(s).buffs.some((b) => b.kind === k && b.life > 0);
  return key === "speed"
    ? (has("speed") ? 1.25 : 1) * (has("slow") ? 0.75 : 1)
    : key === "damage"
      ? (has("weak") ? 0.8 : 1) * (has("moon") ? 1.2 : 1)
      : key === "interval"
        ? (has("haste") ? 1.25 : 1) * (has("curseHaste") ? 0.8 : 1)
        : has("curseCooldown")
          ? 1.25
          : 1;
}
export function initializeMap(s: Run, map: MapId) {
  s.environment = emptyEnvironment(map);
  if (map !== "cavern") return;
  for (let i = 0; i < ENV_RULES.crystals; i++) {
    const x = 400 + (i % 6) * 530 + (random(s) - 0.5) * 70,
      y = 500 + Math.floor(i / 6) * 790 + (random(s) - 0.5) * 70;
    addCrystal(
      s,
      { x, y },
      ["blast", "xp", "ice"][i % 3] as "blast" | "xp" | "ice",
    );
  }
}
export function addCrystal(
  s: Run,
  p: Vec,
  type: "blast" | "xp" | "ice" = "blast",
) {
  const env = environment(s);
  if (env.crystals.length >= ENV_RULES.crystals) return;
  const pos = {
    x: clamp(p.x, 90, LIMITS.world - 90),
    y: clamp(p.y, 90, LIMITS.world - 90),
  };
  if (
    distance(pos, s.player) < 85 ||
    s.rocks.some((r) => distance(pos, r) < r.r + 80)
  )
    return;
  const crystal = { ...pos, id: s.nextId++, hp: ENV_RULES.crystalHp, type };
  env.crystals.push(crystal);
  s.rocks.push({ ...pos, r: 22, crystalId: crystal.id });
  return crystal;
}
/** Iterative bounded chain: every crystal removed before propagation; no recursive area calls. */
export function hitCrystals(c: Combat, p: Vec, r: number, damage: number) {
  const s = c.s,
    env = environment(s),
    queue: number[] = [];
  for (const x of env.crystals)
    if (x.hp > 0 && distance(p, x) <= r + 22) {
      x.hp -= Math.max(0, damage);
      if (x.hp <= 0) queue.push(x.id);
    }
  let count = 0;
  while (queue.length && count < ENV_RULES.chain) {
    const id = queue.shift()!,
      x = env.crystals.find((x) => x.id === id);
    if (!x || env.destroyed.includes(id)) continue;
    count++;
    env.destroyed.push(id);
    if (env.destroyed.length > 128) env.destroyed.shift();
    c.effect(x, "crystal", 100);
    for (const z of s.zones) if (z.anchor === id) z.life = 0;
    s.zones = s.zones.filter((z) => z.life > 0);
    s.rocks = s.rocks.filter((r) => r.crystalId !== id);
    if (x.type === "xp")
      s.player.xp = Math.min(LIMITS.number, s.player.xp + 24);
    if (x.type === "ice") c.zone(x, 110, 0, "ice", false, 0, 3, "crystal");
    if (x.type === "blast") {
      for (const e of s.enemies)
        if (e.hp > 0 && distance(e, x) < 145 + e.r)
          c.damage(e, 85, "crystal", false, x, { kind: "proc" });
      for (const other of env.crystals)
        if (other.hp > 0 && distance(other, x) < ENV_RULES.chainRange) {
          other.hp = 0;
          queue.push(other.id);
        }
    }
  }
  // Defer an over-budget chain until a later hit, retaining all unprocessed objects.
  for (const x of env.crystals)
    if (x.hp <= 0 && !env.destroyed.includes(x.id)) x.hp = 1;
  env.crystals = env.crystals.filter((x) => !env.destroyed.includes(x.id));
  return count;
}
export function addCandy(s: Run, p: Vec, kind?: BuffKind) {
  const env = environment(s);
  if (env.candies.length >= ENV_RULES.candies) return;
  const kinds: BuffKind[] = ["speed", "haste", "heal", "xp", "slow", "weak"];
  env.candies.push({
    id: s.nextId++,
    x: clamp(p.x, 60, 3540),
    y: clamp(p.y, 60, 3540),
    kind: kind || kinds[Math.floor(random(s) * kinds.length)],
    life: ENV_RULES.candyLife,
  });
}
export function addField(
  s: Run,
  p: Vec,
  kind: MagicField["kind"],
  delay = ENV_RULES.fieldWarning,
) {
  const env = environment(s);
  if (env.fields.length >= ENV_RULES.fields) return;
  env.fields.push({
    id: s.nextId++,
    x: clamp(p.x, 120, 3480),
    y: clamp(p.y, 120, 3480),
    kind,
    r: ENV_RULES.fieldRadius,
    delay,
    life: ENV_RULES.fieldLife,
    tick: 0,
  });
}
export function tickEnvironment(c: Combat, dt: number) {
  const s = c.s,
    env = environment(s),
    p = s.player,
    def = MAPS[env.mapId];
  for (const b of env.buffs) b.life -= dt;
  env.buffs = env.buffs.filter((b) => b.life > 0);
  if (!env.hint && s.time > 1) {
    s.event = def.name + " · " + def.mechanic;
    s.eventUntil = s.time + 9;
    env.hint = true;
  }
  const resting = s.wave?.status === "resting";
  if (env.mapId === "garden" && !resting) {
    env.nextCandy -= dt;
    if (env.nextCandy <= 0) {
      env.nextCandy = env.rule ? 8 : ENV_RULES.candyPeriod;
      const a = random(s) * Math.PI * 2;
      addCandy(
        s,
        { x: p.x + Math.cos(a) * 180, y: p.y + Math.sin(a) * 180 },
        env.rule ? (random(s) < 0.5 ? "slow" : "weak") : undefined,
      );
    }
  }
  if (env.mapId === "eclipse" && !resting) {
    env.nextField -= dt;
    if (env.nextField <= 0) {
      env.nextField = Math.max(
        9,
        ENV_RULES.fieldPeriod - Math.min(6, Math.floor(s.time / 1200)),
      );
      const a = random(s) * Math.PI * 2;
      for (let i = 0; i < 3; i++)
        addField(
          s,
          {
            x: p.x + Math.cos(a + i * 2.1) * 190,
            y: p.y + Math.sin(a + i * 2.1) * 190,
          },
          (["moon", "eclipse", "shield"] as const)[i],
        );
    }
  }
  for (const x of env.candies) {
    x.life -= dt;
    if (distance(x, p) < 30) {
      if (x.kind === "heal") c.heal(25);
      else if (x.kind === "xp") p.xp = Math.min(LIMITS.number, p.xp + 18);
      else addBuff(s, x.kind);
      x.life = 0;
      c.effect(x, "candy", 35);
    }
  }
  env.candies = env.candies.filter((x) => x.life > 0);
  for (const f of env.fields) {
    if (f.delay > 0) {
      f.delay -= dt;
      continue;
    }
    f.life -= dt;
    f.tick -= dt;
    if (f.tick <= 0) {
      f.tick = 1;
      if (distance(f, p) < f.r) {
        if (f.kind === "moon") addBuff(s, "moon", 1.2);
        else if (f.kind === "shield")
          p.shield = Math.max(p.shield, Math.min(45, p.shield + 8));
        else {
          addBuff(s, "slow", 1.2);
          c.hurt(4);
        }
      }
    }
  }
  env.fields = env.fields.filter((f) => f.life > 0);
}
