import { negativeFactor } from "../data/cards/registry";
import { ensureDeck } from "./deckState";
import { UPGRADES } from "../data/content";
import type { Run } from "./types";
import { CHARACTERS } from "../data/characters";
import { MODIFIERS, type Stat } from "../data/cards/expedition";
import { clamp, random } from "./math";
export const CURSES = {
  wither: { name: "枯萎", desc: "最大生命每层 -12%" },
  lead: { name: "铅足", desc: "移速每层 -8%" },
  frail: { name: "脆弱", desc: "承伤每层 +15%" },
  silence: { name: "缄默", desc: "主动冷却每层 +10%" },
};
export type Curse = keyof typeof CURSES;
export { LEGACY_MODIFIERS } from "../data/cards/effects";
import { LEGACY_MODIFIERS } from "../data/cards/effects";
export interface Fate {
  noticeUntil?: number;
  base: Record<Stat, number>;
  curses: Partial<Record<Curse, number>>;
  history: string[];
  log: string[];
  chests: number;
  gained: number;
  cleansed: number;
}
export function fate(s: Run): Fate {
  if (s.fate) return s.fate;
  const p = s.player;
  const c = CHARACTERS.find((c) => c.id === s.character)!;
  const base: Record<Stat, number> = {
    maxHp: p.maxHp,
    speed: p.speed,
    attack: p.attack,
    crit: p.crit,
    regen: p.regen,
    magnet: p.magnet,
    cooldown: p.cooldown,
  };
  for (const [id, m] of Object.entries(LEGACY_MODIFIERS))
    base[m.stat] -= (p.upgrades[id] || 0) * m.amount;
  // Baselines are retained from v1 saves, including any legitimate legacy customization.
  if (base.maxHp <= 0) base.maxHp = c.hp;
  return (s.fate = {
    base,
    curses: {},
    history: Object.entries(p.upgrades).flatMap(([id, n]) =>
      LEGACY_MODIFIERS[id]
        ? Array.from({ length: Math.min(n, 5) }, () => id)
        : [],
    ),
    log: [],
    chests: 0,
    gained: 0,
    cleansed: 0,
  });
}
export function soft(value: number, knee: number) {
  return value <= knee
    ? value
    : knee + knee * Math.log1p((value - knee) / knee);
}
export function recalculate(s: Run) {
  const d = ensureDeck(s),
    f = fate(s),
    p = s.player,
    values = { ...f.base };
  for (const [id, m] of Object.entries({ ...LEGACY_MODIFIERS, ...MODIFIERS }))
    if (m.stat) values[m.stat] += (p.upgrades[id] || 0) * m.amount!;
  const n = (id: string) => p.upgrades["hex_" + id] || 0;
  f.curses = {};
  for (const id of Object.keys(CURSES) as Curse[])
    if (n(id)) f.curses[id] = n(id);
  let overflow =
    Math.max(0, values.speed - 500) / 15 +
    Math.max(0, values.crit - 0.75) / 0.07 +
    Math.max(0, 0.35 - values.cooldown) / 0.08 +
    Math.max(0, values.magnet - 900) / 55;
  overflow +=
    Math.max(0, (p.upgrades.armor || 0) * 0.08 - 0.6) / 0.08 +
    Math.max(0, (p.upgrades.wide || 0) - 240 / 18);
  for (const [id, m] of Object.entries(MODIFIERS))
    if (m.interval)
      overflow +=
        Math.max(0, (p.upgrades[id] || 0) * m.interval - 2) / m.interval;
  p.maxHp = clamp(
    soft(values.maxHp, 2000) * negativeFactor("hex_wither", n("wither")),
    20,
    1e6,
  );
  p.hp = Math.min(p.hp, p.maxHp);
  p.speed =
    clamp(values.speed, 80, 500) * negativeFactor("hex_lead", n("lead"));
  p.attack = Math.max(
    1e-12,
    (soft(values.attack, 3) + Math.log1p(overflow) * 0.04) *
      negativeFactor("hex_damage", n("damage")),
  );
  p.crit = clamp(values.crit, 0, 0.75);
  p.regen =
    soft(Math.max(0, values.regen), 10) *
    negativeFactor("hex_regen", n("regen"));
  p.magnet = clamp(values.magnet, 30, 900);
  p.cooldown =
    clamp(values.cooldown, 0.35, 2) *
    negativeFactor("hex_silence", n("silence"));
  p.weapons = {};
  for (const key of ["bow", "blade", "ember", "orbit", "drone"] as const) {
    const lv = (d.baseWeapons[key] || 0) + (p.upgrades["weapon_" + key] || 0);
    if (lv) p.weapons[key] = Math.min(5, lv);
  }
  p.skillLevels = { ...d.baseSkills };
  for (const [slot, id] of ["skill_q", "skill_e", "skill_r"].entries())
    p.skillLevels[p.skills[slot]] = Math.min(
      5,
      p.skillLevels[p.skills[slot]] + (p.upgrades[id] || 0),
    );
  d.revision = (d.revision + 1) % 1e12;
  modifierCache.delete(s);
}
export function addCurse(s: Run, id: Curse) {
  ensureDeck(s);
  const key = "hex_" + id,
    p = s.player;
  if ((p.upgrades[key] || 0) >= 3) return false;
  p.upgrades[key] = (p.upgrades[key] || 0) + 1;
  fate(s).gained = Math.min(1e12, fate(s).gained + 1);
  recalculate(s);
  return true;
}
export function cleanse(s: Run, id?: Curse) {
  ensureDeck(s);
  const p = s.player,
    pool = UPGRADES.filter((u) => u.cleanseable && p.upgrades[u.id]);
  const key = id ? "hex_" + id : pool[Math.floor(random(s) * pool.length)]?.id;
  if (!key || !p.upgrades[key]) return false;
  p.upgrades[key]--;
  fate(s).cleansed = Math.min(1e12, fate(s).cleansed + 1);
  recalculate(s);
  return true;
}
const modifierEntries = Object.entries(MODIFIERS);
const modifierCache = new WeakMap<Run, Map<string, number>>();
export function modifier(
  s: Run,
  key: "damage" | "interval" | "taken" | "xp",
  source = "",
) {
  ensureDeck(s);
  let cache = modifierCache.get(s);
  if (!cache) {
    cache = new Map();
    modifierCache.set(s, cache);
  }
  const token = key + ":" + source;
  if (cache.has(token)) return cache.get(token)!;
  let n = 0;
  for (const [id, m] of modifierEntries)
    if (!m.source || m.source === source)
      n += (m[key] || 0) * (s.player.upgrades[id] || 0);
  let value =
    key === "taken"
      ? Math.max(0.4, 1 + n) *
        negativeFactor("hex_frail", s.player.upgrades.hex_frail || 0)
      : key === "interval"
        ? Math.min(3, 1 + soft(n, 2))
        : 1 + soft(n, 2);
  if (key === "xp")
    value *= negativeFactor("hex_xp", s.player.upgrades.hex_xp || 0);
  cache.set(token, value);
  return value;
}
export function removable(s: Run) {
  ensureDeck(s);
  return [...fate(s).history]
    .reverse()
    .find(
      (id) =>
        UPGRADES.some((u) => u.id === id && u.forgettable) &&
        s.player.upgrades[id] > 0 &&
        (s.player.upgrades[id] > 1 ||
          !UPGRADES.some((u) => u.requires === id && s.player.upgrades[u.id])),
    );
}
export function forget(s: Run) {
  const id = removable(s);
  if (!id) return false;
  s.player.upgrades[id]--;
  if (!s.player.upgrades[id])
    fate(s).history = fate(s).history.filter((x) => x !== id);
  recalculate(s);
  return id;
}
export function report(s: Run, text: string) {
  const f = fate(s);
  f.log.push(text);
  f.log = f.log.slice(-8);
  f.noticeUntil = s.time + 8;
}
