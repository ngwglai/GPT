import { UPGRADES } from "../src/data/content";
console.log(
  "# v1.2 卡牌数据说明\n\n本表由 `npm run docs:cards` 从当前注册表生成，定义与运行时共用参数。`player.upgrades` 是唯一持有层数记录；初始装备在 `deck.baseWeapons/baseSkills` 中保存。\n\n|卡牌|类型|分类|最大层数|效果|\n|---|---|---|---|---|\n" +
    UPGRADES.map(
      (u) =>
        `|${u.name}|${u.type}|${{ positive: "纯正面", negative: "纯负面", mixed: "混合" }[u.polarity]}|${u.maxStacks === null ? "∞" : u.maxStacks}|${u.desc}|`,
    ).join("\n"),
);
