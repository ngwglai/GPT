import { migrateGrowth } from "../core/migrateGrowth";
import { buildState } from "../core/buildState";
import { GROWTH_RULES } from "../data/growth";
import { migrateRevival, REVIVAL_RULES } from "../core/revival";
import { migrateWaves, WAVE_RULES } from "../core/waves";
import { emptyEnvironment } from "../core/environmentTypes";
import { MAPS, ENV_RULES } from "../data/maps";
import { ensureDeck } from "../core/deckState";
import { recalculate } from "../core/fate";
import { DROP_RULES } from "../core/drops";
import { CURSES } from "../core/fate";
import type { Run, Settings, Profile, RecordEntry } from "../core/types";
import { createRun } from "../core/create";
import {
  CHARACTERS,
  ENEMIES,
  LIMITS,
  SKILLS,
  UPGRADES,
  WEAPONS,
} from "../data/content";
export const DEFAULT_SETTINGS: Settings = {
  touchControls: "auto",
  music: 0.22,
  sfx: 0.4,
  quality: "high",
  shake: true,
  showStats: false,
};
export const DEFAULT_PROFILE: Profile = {
  version: 1,
  records: [],
  unlocks: [],
  best: 0,
};
let database: Promise<IDBDatabase> | undefined;
function db() {
  return (database ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("starfall-survivor", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("kv");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      database = undefined;
      reject(new Error("本地存储不可用，请检查浏览器隐私设置。"));
    };
  }));
}
export async function read<T>(key: string): Promise<T | undefined> {
  const d = await db();
  return new Promise((resolve, reject) => {
    const tx = d.transaction("kv", "readonly"),
      r = tx.objectStore("kv").get(key);
    r.onsuccess = () => resolve(r.result as T | undefined);
    r.onerror = () => reject(new Error("读取存档失败。"));
  });
}
export async function write(key: string, value: unknown) {
  const d = await db();
  return new Promise<void>((resolve, reject) => {
    const tx = d.transaction("kv", "readwrite");
    tx.objectStore("kv").put(value, key);
    tx.oncomplete = () => resolve();
    tx.onabort = tx.onerror = () =>
      reject(new Error("保存失败：存储空间不足或浏览器拒绝写入。"));
  });
}
function assert(ok: unknown): asserts ok {
  if (!ok) throw new Error("存档损坏或版本不兼容，可恢复备份或开始新远征。");
}
function obj(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}
// Normalize structural schemas 1–3 to 4. Validate the entire old snapshot before growth schema 5 migration.
// Validate all numerical leaves, collection budgets, required structures, identifiers and cross references.
export function migrateRun(value: unknown): unknown {
  if (obj(value) && [1, 2, 3].includes(value.version as number)) {
    const migrated = structuredClone(value);
    if (migrated.version === 1 && migrated.environment === undefined)
      migrated.environment = emptyEnvironment("forest");
    if (
      typeof migrated.time === "number" &&
      Number.isFinite(migrated.time) &&
      typeof migrated.bossIndex === "number" &&
      Number.isFinite(migrated.bossIndex) &&
      Array.isArray(migrated.enemies) &&
      migrated.enemies.every((e) => obj(e) && typeof e.kind === "string")
    ) {
      if (migrated.version !== 3)
        migrated.wave = migrateWaves(migrated as unknown as Run);
      migrated.revival = migrateRevival(migrated as unknown as Run);
    }
    migrated.version = 4;
    return migrated;
  }
  return value;
}
export function validateRun(input: unknown): Run {
  const value = migrateRun(input);
  assert(obj(value) && (value.version === 4 || value.version === 5));
  const legacy = value.version === 4;
  const weaponMax = legacy ? 5 : GROWTH_RULES.weaponMax;
  const s = value as unknown as Run;
  const visit = (v: unknown, depth = 0) => {
    assert(depth < 12);
    if (typeof v === "number")
      assert(Number.isFinite(v) && Math.abs(v) <= LIMITS.number);
    else if (Array.isArray(v)) {
      assert(v.length <= Math.max(1000, LIMITS.bullets));
      v.forEach((x) => visit(x, depth + 1));
    } else if (obj(v)) {
      assert(Object.keys(v).length <= 150);
      for (const [k, x] of Object.entries(v)) {
        assert(!["__proto__", "constructor", "prototype"].includes(k));
        visit(x, depth + 1);
      }
    } else
      assert(
        v === null ||
          typeof v === "boolean" ||
          (typeof v === "string" && v.length < 300),
      );
  };
  visit(s);
  if (s.fate) {
    assert(
      s.fate.noticeUntil === undefined ||
        typeof s.fate.noticeUntil === "number",
    );
    assert(
      obj(s.fate) &&
        obj(s.fate.base) &&
        obj(s.fate.curses) &&
        Array.isArray(s.fate.history) &&
        Array.isArray(s.fate.log),
    );
    assert(
      ["maxHp", "speed", "attack", "crit", "regen", "magnet", "cooldown"].every(
        (k) =>
          typeof (s.fate!.base as unknown as Record<string, unknown>)[k] ===
          "number",
      ),
    );
    assert(
      Object.entries(s.fate.curses).every(
        ([k, v]) =>
          Object.hasOwn(CURSES, k) && Number.isInteger(v) && v >= 0 && v <= 3,
      ),
    );
    assert(
      s.fate.history.every((id) => UPGRADES.some((u) => u.id === id)) &&
        s.fate.log.length <= 8 &&
        s.fate.log.every((x) => typeof x === "string"),
    );
    assert(
      [s.fate.chests, s.fate.gained, s.fate.cleansed].every(
        (n) => Number.isInteger(n) && n >= 0,
      ),
    );
  }
  const base = createRun("standard");
  for (const [k, v] of Object.entries(base)) {
    if (legacy && k === "build") continue;
    assert(Object.hasOwn(s, k));
    assert(typeof (s as unknown as Record<string, unknown>)[k] === typeof v);
  }
  assert(
    ["standard", "endless"].includes(s.mode) &&
      [
        "playing",
        "upgrade",
        "dead",
        "victory",
        "dying",
        "revive",
        "reviving",
      ].includes(s.phase) &&
      CHARACTERS.some((c) => c.id === s.character),
  );
  assert(obj(s.player) && obj(s.stats));
  for (const [k, v] of Object.entries(base.player))
    assert(
      k in s.player &&
        typeof (s.player as unknown as Record<string, unknown>)[k] === typeof v,
    );
  const p = s.player;
  assert(
    p.hp >= 0 &&
      p.hp <= p.maxHp &&
      p.maxHp > 0 &&
      p.maxHp <= 1e6 &&
      p.speed >= 0 &&
      p.speed <= 1000 &&
      p.level >= 1 &&
      Number.isInteger(p.level) &&
      p.cooldown >= 0.1 &&
      p.cooldown <= 3 &&
      p.attack >= 0 &&
      p.attack <= 1e6,
  );
  assert(
    s.time >= 0 &&
      s.nextBoss > 0 &&
      s.nextEvent > 0 &&
      s.spawnTimer >= -1 &&
      s.spawnTimer <= 10,
  );
  assert(Number.isInteger(s.rng) && Number.isInteger(s.nextId));
  const life = s.revival;
  assert(
    obj(life) &&
      [
        life.remaining,
        life.earned,
        life.used,
        life.rewardedBoss,
        life.deaths,
      ].every((n) => Number.isSafeInteger(n) && n >= 0) &&
      life.remaining + life.used === life.earned &&
      life.rewardedBoss <= s.bossIndex &&
      typeof life.elapsed === "number" &&
      life.elapsed >= 0 &&
      life.elapsed <=
        REVIVAL_RULES.defeatDuration + REVIVAL_RULES.defeatHold + 0.25,
  );
  if (["dying", "revive", "reviving"].includes(s.phase)) assert(p.hp === 0);
  if (s.phase === "revive")
    assert(life.remaining > 0 && life.elapsed >= REVIVAL_RULES.defeatDuration);
  if (s.phase === "reviving")
    assert(
      life.used > 0 && life.elapsed <= REVIVAL_RULES.reviveDuration + 0.25,
    );
  assert(
    s.recordId === undefined ||
      (typeof s.recordId === "string" &&
        /^[a-zA-Z0-9-]{1,80}$/.test(s.recordId)),
  );
  assert(
    s.recorded === undefined ||
      (Array.isArray(s.recorded) &&
        s.recorded.length <= 2 &&
        new Set(s.recorded).size === s.recorded.length &&
        s.recorded.every((m) => ["standard", "endless"].includes(m))),
  );

  const w = s.wave;
  assert(
    obj(w) &&
      [1, 2].includes(w.schema) &&
      Number.isInteger(w.number) &&
      w.number >= 1 &&
      w.number <= WAVE_RULES.maxNumber &&
      typeof w.startedAt === "number" &&
      w.startedAt >= 0 &&
      w.startedAt <= s.time &&
      typeof w.duration === "number" &&
      w.duration > 0 &&
      w.duration <= 90 &&
      Number.isInteger(w.budget) &&
      w.budget >= 1 &&
      w.budget <= WAVE_RULES.maxBudget &&
      [w.processed, w.spawned, w.skipped].every(
        (n) => Number.isInteger(n) && n >= 0,
      ) &&
      w.processed <= w.budget &&
      w.spawned + w.skipped === w.processed &&
      (Number(w.schema) === 1
        ? ["entering", "active"].includes(w.status)
        : ["entering", "active", "resting"].includes(w.status)) &&
      (w.status !== "entering") === (w.processed === w.budget) &&
      typeof w.boss === "boolean" &&
      typeof w.announced === "boolean",
  );
  if (Number(w.schema) === 2)
    assert(
      typeof w.restUntil === "number" &&
        w.restUntil >= 0 &&
        (w.status === "resting"
          ? w.restUntil <= s.time + WAVE_RULES.restDuration + 0.001
          : w.restUntil === 0),
    );
  assert(Number.isInteger(s.bossIndex) && s.bossIndex >= 0);
  for (const e of s.enemies)
    if (e.bossOrdinal !== undefined)
      assert(
        ENEMIES[e.kind]?.boss &&
          Number.isInteger(e.bossOrdinal) &&
          e.bossOrdinal >= 1 &&
          e.bossOrdinal <= s.bossIndex,
      );

  assert(
    Array.isArray(p.skills) &&
      p.skills.length === 3 &&
      p.skills.every((id) => Object.hasOwn(SKILLS, id)) &&
      new Set(p.skills).size === 3,
  );
  assert(
    Array.isArray(p.cooldowns) &&
      p.cooldowns.length === 3 &&
      p.cooldowns.every((v) => v >= 0 && v <= 100),
  );
  assert(
    obj(p.weapons) &&
      Object.keys(p.weapons).length <= 5 &&
      Object.entries(p.weapons).every(
        ([k, v]) =>
          Object.hasOwn(WEAPONS, k) &&
          Number.isInteger(v) &&
          v >= 1 &&
          v <= weaponMax,
      ),
  );
  assert(
    obj(p.weaponTimers) &&
      Object.keys(WEAPONS).every(
        (k) => typeof p.weaponTimers[k as keyof typeof WEAPONS] === "number",
      ),
  );
  assert(
    obj(p.skillLevels) &&
      Object.keys(SKILLS).every(
        (k) =>
          Number.isInteger(p.skillLevels[k as keyof typeof SKILLS]) &&
          p.skillLevels[k as keyof typeof SKILLS] >= 1 &&
          p.skillLevels[k as keyof typeof SKILLS] <= 5,
      ),
  );
  assert(
    obj(p.upgrades) &&
      Object.entries(p.upgrades).every(([k, v]) =>
        UPGRADES.some(
          (u) =>
            u.id === k &&
            v >= 0 &&
            Number.isInteger(v) &&
            v <= (legacy && u.weapon ? 5 : u.max),
        ),
      ),
  );
  const point = (v: unknown) => {
    assert(
      obj(v) &&
        typeof v.x === "number" &&
        typeof v.y === "number" &&
        v.x >= -1000 &&
        v.y >= -1000 &&
        v.x <= LIMITS.world + 1000 &&
        v.y <= LIMITS.world + 1000,
    );
  };
  point(p);
  const collection = (
    name: "enemies" | "bullets" | "zones" | "gems" | "rocks",
    limit: number,
    fields: string[],
  ) => {
    const a = s[name];
    assert(Array.isArray(a) && a.length <= limit);
    for (const e of a) {
      point(e);
      for (const k of fields)
        assert(
          typeof (e as unknown as Record<string, unknown>)[k] === "number",
        );
    }
  };
  collection("enemies", LIMITS.enemies, [
    "id",
    "hp",
    "maxHp",
    "r",
    "speed",
    "damage",
    "timer",
    "phase",
    "slow",
    "freeze",
    "burn",
    "burnPower",
    "hit",
  ]);
  collection("bullets", LIMITS.bullets, [
    "id",
    "vx",
    "vy",
    "r",
    "damage",
    "life",
    "pierce",
  ]);
  collection("zones", LIMITS.zones, [
    "id",
    "r",
    "delay",
    "life",
    "tick",
    "damage",
  ]);
  collection("gems", LIMITS.gems, ["value"]);
  collection("rocks", 120, ["r"]);
  assert(
    s.enemies.every(
      (e) =>
        Object.hasOwn(ENEMIES, e.kind) &&
        e.hp > 0 &&
        e.maxHp > 0 &&
        e.r > 0 &&
        e.r < 100 &&
        e.speed >= 0 &&
        e.speed < 1000 &&
        typeof e.elite === "boolean" &&
        typeof e.burnSource === "string" &&
        (e.charge === null ||
          (obj(e.charge) &&
            typeof e.charge.x === "number" &&
            typeof e.charge.y === "number")),
    ),
  );
  assert(
    s.bullets.every(
      (b) =>
        Array.isArray(b.hits) &&
        b.hits.every(Number.isInteger) &&
        typeof b.kind === "string" &&
        typeof b.source === "string" &&
        typeof b.enemy === "boolean" &&
        b.r > 0 &&
        b.r < 100 &&
        b.life > 0 &&
        b.life < 10,
    ),
  );
  assert(
    s.zones.every(
      (z) =>
        typeof z.kind === "string" &&
        typeof z.source === "string" &&
        typeof z.enemy === "boolean" &&
        z.r > 0 &&
        z.r < 1000 &&
        z.delay < 10 &&
        z.life > 0 &&
        z.life < 30,
    ),
  );
  assert(s.rocks.every((r) => r.r > 0 && r.r < 100));
  assert(s.gems.every((g) => g.value > 0));
  for (const [k, v] of Object.entries(base.stats)) {
    assert(k in s.stats);
    if (typeof v === "number")
      assert(
        typeof (s.stats as unknown as Record<string, unknown>)[k] === "number",
      );
  }
  assert(
    obj(s.stats.bySource) &&
      Object.values(s.stats.bySource).every(
        (v) => typeof v === "number" && v >= 0,
      ),
  );
  assert(
    Array.isArray(s.choices) &&
      s.choices.length <= 3 &&
      s.choices.every((id) => UPGRADES.some((u) => u.id === id)) &&
      (s.phase !== "upgrade" || s.choices.length > 0),
  );
  assert(typeof s.event === "string" && typeof s.victoryClaimed === "boolean");
  if (s.deck) {
    const d = s.deck;
    assert(
      obj(d) &&
        d.schema === 2 &&
        obj(d.baseWeapons) &&
        obj(d.baseSkills) &&
        obj(d.pending) &&
        obj(d.earned) &&
        obj(d.dropsInWindow),
    );
    assert(
      [
        d.refreshes,
        d.revision,
        d.dropWindow,
        ...Object.values(d.pending),
        ...Object.values(d.earned),
        ...Object.values(d.dropsInWindow),
      ].every((n) => Number.isInteger(n) && n >= 0),
    );
    assert(
      ["positive", "negative"].every(
        (k) =>
          Object.hasOwn(d.pending, k) &&
          Object.hasOwn(d.earned, k) &&
          Object.hasOwn(d.dropsInWindow, k),
      ),
    );
    assert(d.active === null || ["positive", "negative"].includes(d.active));
    assert(
      Object.entries(d.baseWeapons).every(
        ([id, n]) =>
          Object.hasOwn(WEAPONS, id) &&
          Number.isInteger(n) &&
          n >= 1 &&
          n <= weaponMax,
      ),
    );
    assert(
      Object.keys(SKILLS).every(
        (id) =>
          Number.isInteger(d.baseSkills[id as keyof typeof SKILLS]) &&
          d.baseSkills[id as keyof typeof SKILLS] >= 1 &&
          d.baseSkills[id as keyof typeof SKILLS] <= 5,
      ),
    );
    if (d.lastShuffle)
      assert(
        Number.isInteger(d.lastShuffle.removed) &&
          d.lastShuffle.removed === d.lastShuffle.added &&
          d.lastShuffle.removed >= 1,
      );
    if (s.phase === "upgrade")
      assert(
        d.active !== null &&
          s.choices.every((id) =>
            UPGRADES.some(
              (u) =>
                u.id === id &&
                (d.active === "negative"
                  ? u.polarity === "negative"
                  : u.polarity !== "negative"),
            ),
          ),
      );
  }
  if (s.rewardDrops) {
    assert(
      Array.isArray(s.rewardDrops) &&
        s.rewardDrops.length <= DROP_RULES.perKindObjects * 2,
    );
    for (const drop of s.rewardDrops) {
      point(drop);
      assert(
        ["positive", "negative"].includes(drop.kind) &&
          Number.isInteger(drop.count) &&
          drop.count > 0,
      );
    }
    for (const kind of ["positive", "negative"])
      assert(
        s.rewardDrops.filter((d) => d.kind === kind).length <=
          DROP_RULES.perKindObjects,
      );
  }
  const env = s.environment;
  assert(obj(env) && env.schema === 1 && Object.hasOwn(MAPS, env.mapId));
  assert(
    Array.isArray(env.crystals) && env.crystals.length <= ENV_RULES.crystals,
  );
  assert(
    Array.isArray(env.destroyed) &&
      env.destroyed.length <= 128 &&
      env.destroyed.every(Number.isInteger),
  );
  assert(Array.isArray(env.candies) && env.candies.length <= ENV_RULES.candies);
  assert(Array.isArray(env.fields) && env.fields.length <= ENV_RULES.fields);
  assert(
    obj(env.targets) &&
      Object.entries(env.targets).every(
        ([id, n]) =>
          Object.hasOwn(WEAPONS, id) && Number.isInteger(n) && n >= 0,
      ),
  );
  const buffKinds = [
    "speed",
    "haste",
    "heal",
    "xp",
    "slow",
    "weak",
    "curseHaste",
    "curseCooldown",
    "moon",
  ];
  assert(
    Array.isArray(env.buffs) &&
      env.buffs.length <= 9 &&
      new Set(env.buffs.map((b) => b.kind)).size === env.buffs.length,
  );
  assert(
    env.buffs.every(
      (b) => buffKinds.includes(b.kind) && b.life > 0 && b.life <= 30,
    ),
  );
  assert(
    typeof env.hint === "boolean" &&
      typeof env.rule === "number" &&
      env.rule >= 0 &&
      env.rule <= 1,
  );
  assert(
    typeof env.nextCandy === "number" &&
      env.nextCandy >= -1 &&
      env.nextCandy <= 30 &&
      typeof env.nextField === "number" &&
      env.nextField >= -1 &&
      env.nextField <= 30,
  );
  for (const x of env.crystals) {
    point(x);
    assert(
      Number.isInteger(x.id) &&
        x.hp > 0 &&
        x.hp <= ENV_RULES.crystalHp &&
        ["blast", "xp", "ice"].includes(x.type) &&
        !env.destroyed.includes(x.id),
    );
    assert(
      s.rocks.some((r) => r.crystalId === x.id && r.x === x.x && r.y === x.y),
    );
  }
  assert(new Set(env.crystals.map((x) => x.id)).size === env.crystals.length);
  assert(
    s.rocks.every(
      (r) =>
        r.crystalId === undefined ||
        env.crystals.some((x) => x.id === r.crystalId),
    ),
  );
  for (const x of env.candies) {
    point(x);
    assert(
      Number.isInteger(x.id) &&
        buffKinds.includes(x.kind) &&
        x.life > 0 &&
        x.life <= 30,
    );
  }
  for (const f of env.fields) {
    point(f);
    assert(
      Number.isInteger(f.id) &&
        ["moon", "eclipse", "shield"].includes(f.kind) &&
        f.r === ENV_RULES.fieldRadius &&
        f.delay >= -0.1 &&
        f.delay <= 3 &&
        f.life > 0 &&
        f.life <= ENV_RULES.fieldLife &&
        typeof f.tick === "number",
    );
  }
  for (const e of s.enemies)
    if (e.behavior) {
      const b = e.behavior;
      assert(
        b.copyShots === undefined ||
          (Number.isInteger(b.copyShots) &&
            b.copyShots >= 0 &&
            b.copyShots < 1000000),
      );
      assert(
        typeof b.facing === "number" &&
          typeof b.shield === "number" &&
          b.shield >= 0 &&
          b.shield <= ENV_RULES.shieldCapacity,
      );
      assert(
        typeof b.shieldTime === "number" &&
          b.shieldTime >= 0 &&
          b.shieldTime <= ENV_RULES.shieldTime,
      );
      assert(
        [b.summonOwner, b.shieldOwner].every(
          (n) => Number.isInteger(n) && n >= 0,
        ),
      );
      assert(
        [b.child, b.rewardless, b.awakened].every(
          (x) => typeof x === "boolean",
        ),
      );
      assert(
        typeof b.warning === "number" &&
          b.warning >= -1 &&
          b.warning <= 3 &&
          typeof b.reflecting === "number" &&
          b.reflecting >= 0 &&
          b.reflecting <= 3 &&
          typeof b.healUntil === "number",
      );
      assert(b.target === null || obj(b.target));
      if (b.target) point(b.target);
      assert(
        Array.isArray(b.copied) &&
          b.copied.length <= 5 &&
          new Set(b.copied).size === b.copied.length &&
          b.copied.every((k) => Object.hasOwn(WEAPONS, k)),
      );
    }
  for (const z of s.zones)
    assert(
      z.anchor === undefined ||
        (Number.isInteger(z.anchor) &&
          env.crystals.some((x) => x.id === z.anchor)),
    );
  for (const b of s.bullets) {
    assert(b.reflected === undefined || typeof b.reflected === "boolean");
    assert(
      b.status === undefined ||
        ["slow", "curseHaste", "curseCooldown"].includes(b.status),
    );
  }
  for (const e of s.enemies)
    if (e.dashPattern) {
      const d = e.dashPattern;
      assert(
        [d.wait, d.time, d.left, d.dx, d.dy].every(
          (x) => typeof x === "number",
        ),
      );
      assert(
        d.wait >= -1 &&
          d.wait <= 1 &&
          d.time >= -1 &&
          d.time <= 0.5 &&
          Number.isInteger(d.left) &&
          d.left >= 1 &&
          d.left <= 2 &&
          Math.abs(d.dx) <= 1 &&
          Math.abs(d.dy) <= 1,
      );
    }
  for (const b of s.bullets)
    if (b.motion) {
      const m = b.motion;
      assert(
        [m.wait, m.track, m.turn, m.bounces, m.owner].every(
          (x) => typeof x === "number",
        ),
      );
      assert(
        m.wait >= -1 &&
          m.wait <= 2 &&
          m.track >= 0 &&
          m.track <= 2 &&
          Math.abs(m.turn) <= 2 &&
          Number.isInteger(m.bounces) &&
          m.bounces >= 0 &&
          m.bounces <= 2 &&
          Number.isInteger(m.owner) &&
          m.owner > 0 &&
          (m.bounceIn === undefined || (m.bounceIn >= -1 && m.bounceIn <= 1)),
      );
    }
  for (const z of s.zones)
    if (z.shape) {
      const h = z.shape;
      assert(
        [h.angle, h.length, h.halfAngle, h.omega, h.vx, h.vy, h.owner].every(
          (x) => typeof x === "number",
        ),
      );
      assert(
        ["bar", "fan"].includes(h.kind) &&
          typeof h.angle === "number" &&
          h.length > 0 &&
          h.length <= 1200 &&
          h.halfAngle > 0 &&
          h.halfAngle <= Math.PI &&
          Math.abs(h.omega) <= 2 &&
          Math.abs(h.vx) <= 600 &&
          Math.abs(h.vy) <= 600 &&
          Number.isInteger(h.owner) &&
          h.owner > 0,
      );
    }
  if (s.build) {
    const b = s.build;
    assert(
      obj(b) && b.schema === 1 && typeof b.hunt === "boolean" && obj(b.draws),
    );
    assert(
      [
        b.focusId,
        b.focusHits,
        b.twinHits,
        b.compensation,
        ...Object.values(b.draws),
      ].every((n) => Number.isInteger(n) && n >= 0),
    );
    assert(
      b.focusHits <= 10 &&
        b.twinHits < 4 &&
        ["level", "positive", "negative", "replacement", "refresh"].every((k) =>
          Object.hasOwn(b.draws, k),
        ),
    );
    assert(
      [
        ...(b.twinReady === undefined ? [] : [b.twinReady]),
        b.fractureReady,
        b.orbitReady,
        b.chainReady,
        b.steamReady,
        b.dashUntil,
      ].every((n) => typeof n === "number" && n >= 0),
    );
  }
  const result = structuredClone(s);
  // Wave schema is independent of Run/growth schema. Convert only after full validation.
  if (result.wave && Number(result.wave.schema) === 1) {
    result.wave.schema = 2;
    result.wave.restUntil = 0;
    result.wave.duration = result.wave.boss
      ? WAVE_RULES.bossDuration
      : WAVE_RULES.normalDuration;
  }
  if (legacy) migrateGrowth(result);
  buildState(result);
  const d = ensureDeck(result),
    revision = d.revision;
  recalculate(result);
  d.revision = revision;
  return result;
}
let saveQueue = Promise.resolve();
export function saveRun(run: Run) {
  const snapshot = validateRun(run);
  const task = saveQueue
    .catch(() => {})
    .then(async () => {
      const previous = await read<Run>("run");
      if (previous) {
        try {
          await write("backup", validateRun(previous));
        } catch {
          /* Preserve the last valid backup if the current slot is invalid. */
        }
      }
      await write("run", snapshot);
    });
  saveQueue = task;
  return task;
}
/** Run termination and profile entry commit together. Stable IDs make refresh/retry idempotent. */
export function finishRun(run: Run, entry: RecordEntry) {
  const snapshot = validateRun(run);
  if (!snapshot.recordId || !["dead", "victory"].includes(snapshot.phase))
    return Promise.reject(new Error("远征尚未结束，无法保存结算。"));
  const task = saveQueue
    .catch(() => {})
    .then(async () => {
      const d = await db();
      return new Promise<{ run: Run; profile: Profile }>((resolve, reject) => {
        const tx = d.transaction("kv", "readwrite"),
          store = tx.objectStore("kv");
        const previous = store.get("run"),
          profileRequest = store.get("profile");
        let result: { run: Run; profile: Profile };
        profileRequest.onsuccess = () => {
          const raw = profileRequest.result;
          const profile: Profile = validProfile(raw)
            ? structuredClone(raw)
            : structuredClone(DEFAULT_PROFILE);
          const sameRun = previous.result?.recordId === snapshot.recordId;
          const modes = new Set(snapshot.recorded || []);
          if (sameRun && Array.isArray(previous.result.recorded))
            for (const mode of previous.result.recorded)
              if (mode === "standard" || mode === "endless") modes.add(mode);
          const id = `${snapshot.recordId}-${snapshot.mode}`;
          if (
            !modes.has(snapshot.mode) &&
            !profile.records.some((r) => r.id === id)
          )
            profile.records.unshift({ ...entry, id });
          modes.add(snapshot.mode);
          snapshot.recorded = [...modes];
          profile.records = profile.records.slice(0, 30);
          profile.best = Math.max(profile.best, snapshot.time);
          for (const [condition, name] of [
            [snapshot.stats.bosses > 0, "首领猎人"],
            [snapshot.phase === "victory", "星林守护者"],
            [snapshot.time >= 3600, "长夜行者"],
          ] as const)
            if (condition && !profile.unlocks.includes(name))
              profile.unlocks.push(name);
          if (sameRun || !previous.result) {
            if (previous.result) {
              try {
                store.put(validateRun(previous.result), "backup");
              } catch {
                /* keep valid backup */
              }
            }
            store.put(snapshot, "run");
          }
          store.put(profile, "profile");
          result = { run: snapshot, profile };
        };
        tx.oncomplete = () => resolve(result);
        tx.onabort = tx.onerror = () =>
          reject(new Error("结算保存失败，请检查本地存储空间并重试。"));
      });
    });
  saveQueue = task.then(
    () => {},
    () => {},
  );
  return task;
}
export async function loadRun(backup = false) {
  const data = await read<unknown>(backup ? "backup" : "run");
  return data === undefined ? undefined : validateRun(data);
}
export async function loadSettings() {
  try {
    const v = await read<Settings>("settings");
    if (
      v &&
      Number.isFinite(v.music) &&
      Number.isFinite(v.sfx) &&
      ["high", "low"].includes(v.quality) &&
      typeof v.shake === "boolean" &&
      typeof v.showStats === "boolean"
    )
      return {
        ...DEFAULT_SETTINGS,
        ...v,
        touchControls: ["auto", "on", "off"].includes(v.touchControls || "")
          ? v.touchControls!
          : "auto",
        music: Math.max(0, Math.min(1, v.music)),
        sfx: Math.max(0, Math.min(1, v.sfx)),
      };
  } catch {
    /* Defaults keep the game playable. */
  }
  return { ...DEFAULT_SETTINGS };
}
function validProfile(p: unknown): p is Profile {
  if (
    !obj(p) ||
    p.version !== 1 ||
    !Array.isArray(p.records) ||
    p.records.length > 30 ||
    !Array.isArray(p.unlocks) ||
    !p.unlocks.every((x) => typeof x === "string" && x.length < 80) ||
    typeof p.best !== "number" ||
    !Number.isFinite(p.best)
  )
    return false;
  return p.records.every(
    (r) =>
      obj(r) &&
      [r.time, r.kills, r.level].every(
        (n) => typeof n === "number" && Number.isFinite(n),
      ) &&
      CHARACTERS.some((c) => c.id === r.character) &&
      ["standard", "endless"].includes(r.mode as string) &&
      typeof r.date === "string" &&
      r.date.length < 40 &&
      (r.id === undefined || (typeof r.id === "string" && r.id.length < 100)),
  );
}
export async function loadProfile() {
  try {
    const p = await read<unknown>("profile");
    if (validProfile(p)) return p;
  } catch {
    /* Defaults. */
  }
  return structuredClone(DEFAULT_PROFILE);
}
