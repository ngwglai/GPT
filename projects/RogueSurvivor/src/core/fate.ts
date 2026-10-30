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
export const LEGACY_MODIFIERS: Record<string, { stat: Stat; amount: number }> =
  {
    vitality: { stat: "maxHp", amount: 25 },
    stride: { stat: "speed", amount: 15 },
    critical: { stat: "crit", amount: 0.07 },
    renew: { stat: "regen", amount: 0.4 },
    magnet: { stat: "magnet", amount: 55 },
    haste: { stat: "cooldown", amount: -0.08 },
    power: { stat: "attack", amount: 0.12 },
  };
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
export function recalculate(s: Run) {
  const f = fate(s),
    p = s.player;
  const values = { ...f.base };
  for (const [id, m] of Object.entries({ ...LEGACY_MODIFIERS, ...MODIFIERS }))
    if (m.stat) values[m.stat] += (p.upgrades[id] || 0) * m.amount!;
  values.maxHp *= 1 - 0.12 * (f.curses.wither || 0);
  values.speed *= 1 - 0.08 * (f.curses.lead || 0);
  values.cooldown *= 1 + 0.1 * (f.curses.silence || 0);
  p.maxHp = clamp(values.maxHp, 20, 1e6);
  p.hp = Math.min(p.hp, p.maxHp);
  p.speed = clamp(values.speed, 80, 500);
  p.attack = clamp(values.attack, 0.1, 100);
  p.crit = clamp(values.crit, 0, 0.75);
  p.regen = clamp(values.regen, 0, 100);
  p.magnet = clamp(values.magnet, 30, 900);
  p.cooldown = clamp(values.cooldown, 0.35, 2);
}
export function addCurse(s: Run, id: Curse) {
  const f = fate(s);
  if ((f.curses[id] || 0) >= 3) return false;
  f.curses[id] = (f.curses[id] || 0) + 1;
  f.gained++;
  recalculate(s);
  return true;
}
export function cleanse(s: Run, id?: Curse) {
  const f = fate(s);
  const pool = (Object.keys(CURSES) as Curse[]).filter((k) => f.curses[k]);
  const key = id || pool[Math.floor(random(s) * pool.length)];
  if (!key || !f.curses[key]) return false;
  f.curses[key]!--;
  f.cleansed++;
  recalculate(s);
  return true;
}
const modifierEntries = Object.entries(MODIFIERS);
export function modifier(
  s: Run,
  key: "damage" | "interval" | "taken" | "xp",
  source = "",
) {
  let n = 0;
  for (const [id, m] of modifierEntries)
    if (!m.source || m.source === source)
      n += (m[key] || 0) * (s.player.upgrades[id] || 0);
  if (key === "taken") n += 0.15 * (s.fate?.curses.frail || 0);
  return Math.max(key === "taken" ? 0.4 : 0.1, 1 + n);
}
export function removable(s: Run) {
  const f = fate(s);
  return [...f.history]
    .reverse()
    .find(
      (id) =>
        (LEGACY_MODIFIERS[id] || MODIFIERS[id]?.stat) &&
        s.player.upgrades[id] > 0 &&
        id !== "bloodmoon",
    );
}
export function forget(s: Run) {
  const id = removable(s);
  if (!id) return false;
  s.player.upgrades[id]--;
  const h = fate(s).history;
  h.splice(h.lastIndexOf(id), 1);
  recalculate(s);
  return id;
}
export function report(s: Run, text: string) {
  const f = fate(s);
  f.log.push(text);
  f.log = f.log.slice(-8);
  f.noticeUntil = s.time + 8;
}
