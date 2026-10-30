import { CURSES } from "../core/fate";
import type { Run, Settings, Profile } from "../core/types";
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
// Validate all numerical leaves, collection budgets, required structures, identifiers and cross references.
export function validateRun(value: unknown): Run {
  assert(obj(value) && value.version === 1);
  const s = value as unknown as Run;
  const visit = (v: unknown, depth = 0) => {
    assert(depth < 12);
    if (typeof v === "number")
      assert(Number.isFinite(v) && Math.abs(v) <= LIMITS.number);
    else if (Array.isArray(v)) {
      assert(v.length <= 1000);
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
    assert(Object.hasOwn(s, k));
    assert(typeof (s as unknown as Record<string, unknown>)[k] === typeof v);
  }
  assert(
    ["standard", "endless"].includes(s.mode) &&
      ["playing", "upgrade", "dead", "victory"].includes(s.phase) &&
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
      p.maxHp <= 10000 &&
      p.speed >= 0 &&
      p.speed <= 1000 &&
      p.level >= 1 &&
      Number.isInteger(p.level) &&
      p.cooldown >= 0.1 &&
      p.cooldown <= 2 &&
      p.attack >= 0 &&
      p.attack <= 1000,
  );
  assert(
    s.time >= 0 &&
      s.nextBoss > 0 &&
      s.nextEvent > 0 &&
      s.spawnTimer >= -1 &&
      s.spawnTimer <= 10,
  );
  assert(Number.isInteger(s.rng) && Number.isInteger(s.nextId));
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
          Object.hasOwn(WEAPONS, k) && Number.isInteger(v) && v >= 1 && v <= 5,
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
          (u) => u.id === k && v >= 0 && Number.isInteger(v) && v <= u.max,
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
  return structuredClone(s);
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
        music: Math.max(0, Math.min(1, v.music)),
        sfx: Math.max(0, Math.min(1, v.sfx)),
      };
  } catch {
    /* Defaults keep the game playable. */
  }
  return { ...DEFAULT_SETTINGS };
}
export async function loadProfile() {
  try {
    const p = await read<Profile>("profile");
    if (
      p?.version === 1 &&
      Array.isArray(p.records) &&
      p.records.length <= 30 &&
      p.records.every(
        (r) =>
          Number.isFinite(r.time) &&
          Number.isFinite(r.kills) &&
          Number.isFinite(r.level) &&
          CHARACTERS.some((c) => c.id === r.character) &&
          ["standard", "endless"].includes(r.mode) &&
          typeof r.date === "string" &&
          r.date.length < 40,
      ) &&
      Array.isArray(p.unlocks) &&
      p.unlocks.every((x) => typeof x === "string") &&
      Number.isFinite(p.best)
    )
      return p;
  } catch {
    /* Defaults. */
  }
  return structuredClone(DEFAULT_PROFILE);
}
