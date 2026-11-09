import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { writeFileSync } from "node:fs";
import { simulate } from "../tests/simulate";
const i = process.argv.indexOf("--baseline");
if (i < 0) throw Error("需要 --baseline");
const old = await import(
  pathToFileURL(resolve(process.argv[i + 1], "tests/simulate.ts")).href
);
const rows = [];
for (const version of ["before", "after"])
  for (const character of ["ranger", "knight", "mage"])
    for (const seed of [11, 29, 83]) {
      const r = (version === "before" ? old.simulate : simulate)(
        1500,
        character,
        seed,
      );
      rows.push({ version, ...r });
      console.error(version, character, seed, r.phase, r.seconds, r.level);
    }
const summary = ["before", "after"].map((version) => {
  const set = rows.filter((x) => x.version === version);
  return {
    version,
    samples: set.length,
    automatedVictories: set.filter((x) => x.phase === "victory").length,
    meanSeconds: set.reduce((n, x) => n + x.seconds, 0) / set.length,
    meanLevels: set.reduce((n, x) => n + x.level, 0) / set.length,
    meanKills: set.reduce((n, x) => n + x.kills, 0) / set.length,
  };
});
const out = {
  method:
    "原有确定性控制器、三角色×三种子，真实World与敌人攻击；控制器不能等同真人。死亡局时长不同，不能用其未归一化抽卡总量衡量40%目标，经济目标另用同死亡事件对照。",
  summary,
  rows,
};
const o = process.argv.indexOf("--output");
if (o >= 0)
  writeFileSync(process.argv[o + 1], JSON.stringify(out, null, 2) + "\n");
console.log(JSON.stringify(summary, null, 2));
