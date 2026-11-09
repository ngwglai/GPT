import { World } from "../src/core/world";
import { createRun } from "../src/core/create";
import { spawn, ai } from "../src/core/director";
import { grant } from "../src/core/rewards";
import { validateRun } from "../src/services/storage";
import { criticalMultiplier } from "../src/core/damage";
import { recalculate, modifier } from "../src/core/fate";
import { ENEMIES } from "../src/data/content";
import { writeFileSync } from "node:fs";
const styles: Record<string, string[]> = {
  single: [
    "weapon_bow",
    "weapon_bow",
    "specialist",
    "star_focus",
    "bow_power",
    "bow_quick",
    "power",
    "critical",
  ],
  multi: [
    "weapon_blade",
    "weapon_ember",
    "weapon_orbit",
    "weapon_drone",
    "weapon_bow",
    "weapon_blade",
    "weapon_ember",
    "weapon_orbit",
    "weapon_drone",
    "weapon_blade",
    "weapon_ember",
    "weapon_orbit",
    "weapon_drone",
    "power",
    "vigor",
  ],
  critical: [
    "weapon_bow",
    "weapon_bow",
    "critical",
    "crit_damage",
    "blood_hunt",
    "fork",
    "bow_power",
    "critical",
    "crit_damage",
    "power",
  ],
  burning: [
    "weapon_ember",
    "weapon_ember",
    "weapon_ember",
    "burn",
    "ember_cycle",
    "burning_judge",
    "star_chain",
    "ember_power",
    "ember_quick",
    "burn",
    "power",
  ],
  frozen: [
    "weapon_orbit",
    "weapon_orbit",
    "weapon_orbit",
    "shatter",
    "twin_resonance",
    "crystal_fracture",
    "orbit_resonance",
    "orbit_power",
    "orbit_quick",
    "power",
  ],
  area: [
    "weapon_blade",
    "weapon_blade",
    "weapon_blade",
    "weapon_ember",
    "weapon_ember",
    "weapon_ember",
    "wide",
    "blade_power",
    "ember_power",
    "fire_master",
    "power",
  ],
  survival: [
    "weapon_blade",
    "weapon_blade",
    "weapon_blade",
    "fortress",
    "vitality",
    "armor",
    "renew",
    "recovery",
    "blade_power",
    "power",
  ],
  hybrid: [
    "weapon_ember",
    "weapon_orbit",
    "burn",
    "shatter",
    "frostfire",
    "twin_resonance",
    "orbit_resonance",
    "ember_cycle",
    "power",
    "orbit_power",
    "ember_power",
  ],
};
function setup(style: string, seed: number, budget: number) {
  const w = new World(createRun("endless", "ranger", seed, "ice", "bloom"));
  w.s.rocks = [];
  w.s.player.level = 30;
  const ids = styles[style];
  let spent = 0;
  // An ordered foundation ensures legal prerequisites; each successful card consumes one equal budget unit.
  for (const id of ids) {
    if (spent >= budget) break;
    if (grant(w.s, id)) spent++;
  }
  let tries = 0;
  while (spent < budget && tries++ < budget * 20) {
    const id = ids[(tries - 1) % ids.length];
    if (grant(w.s, id)) spent++;
  }
  if (spent !== budget) throw Error("构筑预算未用完");
  return w;
}
function arena(style: string, seed: number, budget: number, boss: boolean) {
  const w = setup(style, seed, budget),
    p = w.s.player;
  const positions = boss
    ? [{ x: p.x + 90, y: p.y }]
    : Array.from({ length: 24 }, (_, i) => ({
        x: p.x + Math.cos(i * 2.4) * (60 + i * 6),
        y: p.y + Math.sin(i * 2.4) * (60 + i * 6),
      }));
  for (const pos of positions) {
    const e = spawn(w, boss ? "warden" : "crawler", pos)!;
    e.hp = e.maxHp = boss ? 40000 : 800;
  }
  w.grid.rebuild(w.s.enemies);
  let kills = 0,
    damage = 0;
  for (let i = 0; i < 600; i++) {
    w.s.time += 1 / 60;
    for (const e of w.s.enemies) {
      e.freeze = Math.max(0, e.freeze - 1 / 60);
      e.slow = Math.max(0, e.slow - 1 / 60);
      if (e.burn > 0 && e.hp > 0) {
        e.burn -= 1 / 60;
        w.damage(e, e.burnPower / 60, e.burnSource, false, undefined, {
          kind: "burn",
        });
      }
    }
    w.auto(1 / 60);
    w.projectiles(1 / 60);
    for (const e of w.s.enemies)
      if (e.hp <= 0) {
        kills++;
        e.hp = e.maxHp;
        e.burn = 0;
        e.freeze = 0;
        e.slow = 0;
      }
    if (i % 60 === 0) {
      w.cast(0, w.s.enemies[0]);
      p.cooldowns = p.cooldowns.map((n) => Math.max(0, n - 1));
    }
    w.tickEffects(1 / 60);
  }
  damage = w.s.stats.damage;
  validateRun(w.s);
  return {
    style,
    seed,
    budget,
    scenario: boss ? "boss" : "crowd",
    dps: Math.round(damage / 10),
    kills,
    damageSources: w.s.stats.bySource,
    maxHp: p.maxHp,
    regen: p.regen,
    taken: modifier(w.s, "taken"),
    crit: Math.round(p.crit * 100),
    critDamage: criticalMultiplier(w.s),
    bullets: w.s.bullets.length,
  };
}
const rows = [];
for (const style of Object.keys(styles))
  for (const budget of [12, 24, 40])
    for (const seed of [11, 29, 47, 83])
      for (const boss of [false, true])
        rows.push(arena(style, seed, budget, boss));
const summary = [];
for (const style of Object.keys(styles))
  for (const budget of [12, 24, 40])
    for (const scenario of ["crowd", "boss"]) {
      const r = rows.filter(
        (x) =>
          x.style === style && x.budget === budget && x.scenario === scenario,
      );
      summary.push({
        style,
        budget,
        scenario,
        dps: Math.round(r.reduce((n, x) => n + x.dps, 0) / r.length),
        kills: r.reduce((n, x) => n + x.kills, 0) / r.length,
        maxHp: r[0].maxHp,
        regen: r[0].regen,
        taken: r[0].taken,
      });
    }
const out = {
  method:
    "八流派、相等合法卡牌预算、四随机种子、十秒固定靶场；人群靶可重生，Boss靶固定生命；非通关率。沿用真实攻击/暴击/持续/核心机制，敌方不攻击；生存面板不等于真实生存率。",
  summary,
  rows,
};
const idx = process.argv.indexOf("--output");
if (idx >= 0)
  writeFileSync(process.argv[idx + 1], JSON.stringify(out, null, 2) + "\n");
console.log(JSON.stringify(summary, null, 2));
