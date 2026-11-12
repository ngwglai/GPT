/** Historical curves live only in a frozen reporting fixture, never in the game bundle. */
import { readFileSync, writeFileSync } from "node:fs";
import {
  difficulty,
  bossHpMultiplier,
  bossDamageMultiplier,
  bossAttackRate,
  bossAttackInterval,
  ENEMIES,
} from "../src/data/content";
import { MAPS } from "../src/data/maps";
import { World } from "../src/core/world";
import { createRun } from "../src/core/create";
import { spawn } from "../src/core/director";
const old = JSON.parse(
  readFileSync(
    new URL("../tests/fixtures/enemy-growth-v1.8.2.json", import.meta.url),
    "utf8",
  ),
);
function previous(t: number, key: string) {
  const at = Math.max(0, Math.min(60, t)),
    times: number[] = old.minutes,
    values: number[] = old[key];
  for (let i = 1; i < times.length; i++)
    if (at <= times[i]) {
      const f = (at - times[i - 1]) / (times[i] - times[i - 1]);
      return values[i - 1] + f * (values[i] - values[i - 1]);
    }
  return values.at(-1)!;
}
const times = [0, 2.5, 5, 7.5, 10, 15, 20, 30, 60, 90];
const fmt = (x: number) => Number(x.toFixed(6)).toString();
function table(headings: string[], rows: (string | number)[][]) {
  return [headings, headings.map(() => "---"), ...rows]
    .map((row) => "| " + row.join(" | ") + " |")
    .join("\n");
}
const pair = (a: number, b: number) => `${fmt(a)} → ${fmt(b)}`;
const normal = times.map((t) => {
  const n = difficulty(t * 60);
  return [
    t,
    pair(previous(t, "hp"), n.hp),
    pair(previous(t, "damage"), n.damage),
    pair(previous(t, "attackRate"), n.attackRate),
    pair(previous(t, "elite") * 100, n.elite * 100),
    fmt(n.speed),
  ];
});
const boss = times.map((t) => {
  const interval = previous(t, "bossInterval");
  return [
    t,
    pair(previous(t, "bossHp"), bossHpMultiplier(t * 60)),
    pair(previous(t, "bossDamage"), bossDamageMultiplier(t * 60)),
    pair(1.5 / interval, bossAttackRate(t * 60)),
    pair(interval, bossAttackInterval(t * 60, false)),
    pair(
      Math.max(old.bossIntervalFloor, interval * old.bossSecondPhase),
      bossAttackInterval(t * 60, true),
    ),
  ];
});
const actual: (number | string)[][] = [];
for (const t of [0, 5, 10, 20, 60, 90]) {
  const w = new World(createRun("endless", "ranger", 183));
  w.s.time = t * 60;
  for (const [kind, elite] of [
    ["crawler", false],
    ["crawler", true],
    ["warden", false],
  ] as const) {
    const e = spawn(w, kind, { x: 2300, y: 1800 }, elite)!;
    const h = previous(t, kind === "warden" ? "bossHp" : "hp"),
      d = previous(t, kind === "warden" ? "bossDamage" : "damage");
    actual.push([
      t,
      `${ENEMIES[kind].boss ? "Boss" : elite ? "精英" : "普通"}${ENEMIES[kind].name}`,
      pair(ENEMIES[kind].hp * h * (elite ? 2.4 : 1), e.maxHp),
      pair(ENEMIES[kind].damage * d * (elite ? 1.3 : 1), e.damage),
      fmt(e.speed),
      pair((ENEMIES[kind].hp * h * (elite ? 2.4 : 1)) / 100, e.maxHp / 100),
    ]);
  }
}
const markdown = `# v1.8.3 成长数值对照\n\n由 \`npm run report:growth\` 生成。旧版基准为 ${old.version}、提交 \`${old.commit}\` 的 \`${old.source}\`，旧曲线仅保留于测试/报告夹具，未进入运行时。\n\n所有表格均为“旧 → 新”；输入是实际模拟时间的分钟数，数值仅在文档显示时保留6位小数，战斗计算不取整。\n\n## 普通怪\n\nH=1+0.2t，D=1+0.16t，A=1+0.1t，精英概率=min(0.03+0.006t,0.48)。攻击间隔为原有基础间隔除以A；移动速度列读取实际现有配置。\n\n${table(["分钟", "生命倍率", "伤害倍率", "频率倍率", "精英概率（%）", "新版本移速倍率"], normal)}\n\n## Boss\n\n令u=max(0,t−5)：H=3+0.6u，D=2+0.32u，A=1+0.1u。基础间隔1.5秒，二阶段再乘0.8，未保留旧0.16秒间隔下限。倍率不在60分钟截断。\n\n${table(["分钟", "生命倍率", "伤害倍率", "频率倍率", "一阶段间隔（秒）", "二阶段间隔（秒）"], boss)}\n\n## 代表单位的实际出生属性\n\n新属性由真实spawn函数生成；旧属性使用同一基础定义及历史倍率。森林难度系数${MAPS.forest.difficulty}，精英生命×2.4、伤害×1.3、移速×1.12均保持。表中的“100 DPS血池时间”仅以固定每秒100点最终伤害除生命估算，不模拟移动、技能、控制、治疗、护盾、玩家死亡或卡牌选择，不能作为真实通关率或实测玩家DPS。\n\n${table(["分钟", "单位", "生命", "伤害", "新移速", "100 DPS血池时间（秒）"], actual)}\n\n## 适用范围\n\n- 普通与精英怪保留基础定义及出生属性快照；Boss使用独立基础生命/伤害。\n- 召唤物在出生时读取当前倍率；分裂子代的生命0.3、伤害0.6修正保留。\n- 召唤技能原有7/√A等特殊间隔规则、妖精固定治疗间隔和护卫固定护盾间隔保留。\n- 流星雨伤害为16D，月蚀弹幕为12D，仍共用普通怪伤害倍率。\n- 已有存档中的存活怪物不回填或重算生命/伤害；计时器保持保存进度，下一次重置间隔时采用新公式。\n- 旧版在60分钟后封顶，新版继续线性增长；因此极长对局中某些倍率会高于旧封顶（如90分钟Boss攻击频率9.5高于旧7.5），未额外回调或封顶。\n- 波次数量/预算、地图权重、玩家/卡牌/武器、音乐和复活规则不变。\n`;
writeFileSync(new URL("../V1.8.3-BALANCE.md", import.meta.url), markdown);
console.log(
  "V1.8.3-BALANCE.md generated from actual growth and spawn definitions.",
);
