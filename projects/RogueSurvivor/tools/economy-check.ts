/** Paired kill-ledger replay: isolates draw economy from player/controller skill. */
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { readFileSync, writeFileSync } from "node:fs";
import { xpNeeded, ENEMIES, difficulty } from "../src/data/content";
import { MAPS } from "../src/data/maps";
import { newWave } from "../src/core/waves";
import { DROP_RULES } from "../src/core/drops";
import { ENEMY_RULES } from "../src/data/enemies";
const flag = (name: string) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const baseline = flag("--baseline");
// Frozen public v1.7 reference, commit 62ac0dec; optional --baseline verifies against archived source.
const oldContent = baseline
  ? await import(pathToFileURL(resolve(baseline, "src/data/content.ts")).href)
  : {
      xpNeeded: (level: number) =>
        18 + level * 12 + Math.floor(Math.sqrt(level) * 8),
    };
const oldDrops = baseline
  ? await import(pathToFileURL(resolve(baseline, "src/core/drops.ts")).href)
  : {
      DROP_RULES: {
        normal: { positive: 0.002, negative: 0.0004 },
        elite: { positive: 0.025, negative: 0.008 },
        boss: { positive: 0.75, negative: 0.15 },
        perMinute: { positive: 8, negative: 3 },
        perKindObjects: 16,
      },
    };
const previous = baseline
  ? JSON.parse(readFileSync(join(baseline, "package.json"), "utf8")).version
  : "1.7.0";
function rng(seed: number) {
  let x = seed >>> 0;
  return () => {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    return x / 4294967296;
  };
}
interface Entry {
  wave: number;
  time: number;
  xp: number;
  tier: "normal" | "elite" | "boss";
  positive: number;
  negative: number;
}
function ledger(seed: number, map: keyof typeof MAPS) {
  const random = rng(seed),
    entries: Entry[] = [];
  let time = 0;
  for (let wave = 1; wave <= 20; wave++) {
    const w = newWave(wave, time),
      config = MAPS[map],
      pool = config.spawns.filter(
        (x) => Math.max(time, (wave - 1) * 60) >= x.after,
      );
    for (let i = 0; i < w.budget; i++) {
      const at = time + ((i + 1) / w.budget) * w.duration;
      let n = random() * pool.reduce((v, x) => v + x.weight, 0);
      const kind = pool.find((x) => (n -= x.weight) < 0)!.kind;
      const elite = random() < difficulty(at).elite;
      entries.push({
        wave,
        time: at,
        xp: ENEMIES[kind].xp * (elite ? ENEMY_RULES.elite.xp : 1),
        tier: elite ? "elite" : "normal",
        positive: random(),
        negative: random(),
      });
    }
    if (wave % 5 === 0) {
      const id = config.bosses[wave / 5 - 1];
      entries.push({
        wave,
        time: time + w.duration,
        xp: ENEMIES[id].xp * 2,
        tier: "boss",
        positive: random(),
        negative: random(),
      });
    }
    time += w.duration;
  }
  return entries;
}
function replay(
  entries: Entry[],
  needed: (level: number) => number,
  rules: typeof DROP_RULES,
) {
  let level = 1,
    xp = 0,
    levels = 0,
    positive = 0,
    negative = 0,
    minute = -1,
    used = { positive: 0, negative: 0 };
  const tiers = { normal: 0, elite: 0, boss: 0 },
    stages: Record<string, unknown> = {};
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i],
      window = Math.floor(e.time / 60);
    if (window !== minute) {
      minute = window;
      used = { positive: 0, negative: 0 };
    }
    xp += e.xp;
    while (xp >= needed(level)) {
      xp -= needed(level);
      level++;
      levels++;
    }
    for (const kind of ["positive", "negative"] as const)
      if (used[kind] < rules.perMinute[kind] && e[kind] < rules[e.tier][kind]) {
        used[kind]++;
        if (kind === "positive") positive++;
        else negative++;
        tiers[e.tier]++;
      }
    if ([5, 10, 20].includes(e.wave) && entries[i + 1]?.wave !== e.wave)
      stages[e.wave] = {
        total: levels + positive + negative,
        level: levels,
        extra: positive + negative,
        positive,
        negative,
      };
  }
  return {
    total: levels + positive + negative,
    level: levels,
    extra: positive + negative,
    tiers,
    stages,
  };
}
const samples = [];
for (const map of Object.keys(MAPS) as (keyof typeof MAPS)[])
  for (let seed = 1; seed <= 64; seed++) {
    const events = ledger(seed, map),
      before = replay(events, oldContent.xpNeeded, oldDrops.DROP_RULES),
      after = replay(events, xpNeeded, DROP_RULES);
    samples.push({
      seed,
      map,
      before,
      after,
      reduction: 1 - after.total / before.total,
    });
  }
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const totals = {
  before: mean(samples.map((x) => x.before.total)),
  after: mean(samples.map((x) => x.after.total)),
};
const summary = {
  baselineVersion: previous,
  samples: samples.length,
  seedRange: [1, 64],
  conditions:
    "四地图相同波次预算及敌人死亡事件、全部击杀经验收集、不选经验加成卡、独立同源掉落随机流；不计刷新和洗牌替换为新增抽卡",
  totals,
  reduction: 1 - totals.after / totals.before,
  stages: Object.fromEntries(
    [5, 10, 20].map((stage) => [
      stage,
      {
        before: mean(samples.map((x) => (x.before.stages[stage] as any).total)),
        after: mean(samples.map((x) => (x.after.stages[stage] as any).total)),
      },
    ]),
  ),
  level: {
    before: mean(samples.map((x) => x.before.level)),
    after: mean(samples.map((x) => x.after.level)),
  },
  extra: {
    before: mean(samples.map((x) => x.before.extra)),
    after: mean(samples.map((x) => x.after.extra)),
  },
  tierDraws: Object.fromEntries(
    ["normal", "elite", "boss"].map((t) => [
      t,
      {
        before: mean(
          samples.map((x) => x.before.tiers[t as keyof typeof x.before.tiers]),
        ),
        after: mean(
          samples.map((x) => x.after.tiers[t as keyof typeof x.after.tiers]),
        ),
      },
    ]),
  ),
};
const result = { summary, samples };
const output = flag("--output");
if (output) writeFileSync(output, JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify(summary, null, 2));

if (summary.reduction < 0.35 || summary.reduction > 0.45)
  throw Error("抽卡降幅未达35%—45%验收范围");
