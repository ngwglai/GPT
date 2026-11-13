/** Visual-only profiles. Never import these values into collision or combat. */
export const EFFECT_NAMES: Record<string, string> = {
  arrow: "追星光箭",
  slash: "弧月斩光",
  fireball: "烬火飞焰",
  spirit: "萤火灵光",
  frost: "霜潮雪晶",
  lance: "星贯光枪",
  shield: "星幕薄膜",
  heal: "复苏花环",
  starfall: "星落终章爆发",
  dash: "冲刺风带",
  hit: "星芒命中",
  critical: "暴击星爆",
  hostile: "敌方晶弹",
  warning: "危险符环",
  revive: "星火复活",
  dissolve: "魔物消散",
  vine: "古木藤光",
  beam: "水晶折射",
  candy: "糖果召唤",
  moon: "月蚀弯月",
  meteor: "陨火坠落",
  fan: "危险扇浪",
  mirror: "镜界召唤",
  phase: "首领二阶段",
  impact: "命中展开四帧",
};
export const EFFECT_VISUALS = Object.fromEntries(
  Object.keys(EFFECT_NAMES).map((id) => [
    `vfx.${id}`,
    `v1.9.0/effects/${id}.webp`,
  ]),
);
export const EFFECT_SHEETS: Record<
  string,
  { frames: number; frameWidth: number; frameHeight: number; fps: number }
> = {
  "vfx.impact": { frames: 4, frameWidth: 192, frameHeight: 192, fps: 12 },
};
export const FX_DEPTH = {
  ground: 1,
  enemy: 3,
  friendly: 5,
  impact: 7,
  player: 10,
  danger: 12,
} as const;
export const FX_BUDGET = { high: 96, low: 24 } as const;
export function impactFrame(progress: number, frames = 4) {
  return Math.min(
    frames - 1,
    Math.max(0, Math.floor(Math.max(0, Math.min(1, progress)) * frames)),
  );
}
const WEAPON_EFFECTS: Record<string, string> = {
  bow: "arrow",
  fragment: "arrow",
  blade: "slash",
  ember: "fireball",
  orbit: "slash",
  drone: "spirit",
  lance: "lance",
};
const SKILL_EFFECTS: Record<string, string> = {
  fire: "fireball",
  ice: "frost",
  lance: "lance",
  ward: "shield",
  bloom: "heal",
  storm: "starfall",
};
const BOSS_EFFECTS: Record<string, string> = {
  warden: "vine",
  witch: "moon",
  titan: "meteor",
  crystalQueen: "beam",
  candyWitch: "candy",
  eclipseSaint: "moon",
  mirrorMaiden: "mirror",
};
export function weaponEffect(kind: string) {
  return WEAPON_EFFECTS[kind] || "arrow";
}
export function skillEffect(kind: string) {
  return SKILL_EFFECTS[kind] || "hit";
}
export function bossEffect(source: string, shape?: "bar" | "fan") {
  return shape === "fan" ? "fan" : BOSS_EFFECTS[source] || "warning";
}
