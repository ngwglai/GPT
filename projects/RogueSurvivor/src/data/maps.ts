import type { EnemyId } from "../core/types";
export type MapId = "forest" | "cavern" | "garden" | "eclipse";
export interface MapDefinition {
  id: MapId;
  name: string;
  description: string;
  mechanic: string;
  ground: string;
  preview: string;
  decor: string[];
  rock: string;
  spawns: { kind: EnemyId; weight: number; after: number }[];
  bosses: EnemyId[];
  elite: EnemyId[];
  difficulty: number;
  obstacles: {
    stepX: number;
    stepY: number;
    jitter: number;
    minRadius: number;
    maxRadius: number;
  };
}
const entry = (kind: EnemyId, weight: number, after = 0) => ({
  kind,
  weight,
  after,
});
export const MAPS: Record<MapId, MapDefinition> = {
  forest: {
    id: "forest",
    obstacles: {
      stepX: 390,
      stepY: 380,
      jitter: 90,
      minRadius: 25,
      maxRadius: 50,
    },
    name: "星光森林",
    description: "温柔的魔法花林，熟悉的远征起点。",
    mechanic: "稀疏星岩与原有世界事件；作为其他地图的平衡参照。",
    ground: "map.ground",
    preview: "ui.world",
    decor: ["map.tree", "map.obelisk", "map.flower"],
    rock: "map.rock",
    difficulty: 1,
    spawns: [
      entry("crawler", 2),
      entry("runner", 1),
      entry("archer", 1, 70),
      entry("guard", 1, 150),
      entry("bomber", 1, 150),
      entry("seer", 1, 240),
      entry("shaman", 1, 400),
      entry("fairy", 0.45, 240),
      entry("butterfly", 0.6, 150),
    ],
    elite: ["runner", "guard", "fairy"],
    bosses: ["warden", "witch", "warden", "titan"],
  },
  cavern: {
    id: "cavern",
    obstacles: {
      stepX: 480,
      stepY: 480,
      jitter: 65,
      minRadius: 22,
      maxRadius: 40,
    },
    name: "水晶洞窟",
    description: "蓝紫晶簇照亮地下湖，改变战场只需一次碎晶。",
    mechanic:
      "水晶具有120生命：红晶爆炸、金晶经验、蓝晶冰场；相距145内可连锁，每次最多16颗。",
    ground: "map.cavern.ground",
    preview: "map.cavern.preview",
    decor: ["map.cavern.crystal", "map.cavern.lake", "map.cavern.ore"],
    rock: "map.cavern.ore",
    difficulty: 1,
    spawns: [
      entry("crawler", 2),
      entry("runner", 1),
      entry("crab", 1.2, 80),
      entry("splitter", 1, 120),
      entry("protector", 0.7, 210),
      entry("mirror", 0.7, 300),
      entry("ghost", 0.8, 420),
    ],
    elite: ["crab", "protector", "mirror"],
    bosses: ["warden", "crystalQueen", "mirrorMaiden", "crystalQueen"],
  },
  garden: {
    id: "garden",
    obstacles: {
      stepX: 450,
      stepY: 440,
      jitter: 60,
      minRadius: 20,
      maxRadius: 38,
    },
    name: "糖果魔女庭院",
    description: "奶油茶会欢迎冒险者，发光糖纸也藏着小恶作剧。",
    mechanic:
      "每12秒出现糖果：绿移速+25%、金攻速+25%、粉治疗25、蓝经验18；紫减速25%、灰伤害-20%，临时效果8秒，不改卡组。",
    ground: "map.garden.ground",
    preview: "map.garden.preview",
    decor: ["map.garden.tree", "map.garden.tea", "map.garden.house"],
    rock: "map.garden.tea",
    difficulty: 1,
    spawns: [
      entry("crawler", 2),
      entry("bomber", 1),
      entry("mimic", 0.7, 90),
      entry("splitter", 1, 140),
      entry("fairy", 0.7, 220),
      entry("hexer", 0.7, 300),
      entry("summoner", 0.7, 420),
    ],
    elite: ["mimic", "hexer", "summoner"],
    bosses: ["witch", "candyWitch", "mirrorMaiden", "candyWitch"],
  },
  eclipse: {
    id: "eclipse",
    obstacles: {
      stepX: 460,
      stepY: 450,
      jitter: 55,
      minRadius: 24,
      maxRadius: 42,
    },
    name: "月蚀遗迹",
    description: "古老祭坛上，安全的月光与危险的月蚀交替流动。",
    mechanic:
      "每15秒布置3个半径100法阵，红色预警1.5秒后生效：月光伤害+20%、月蚀减速25%并每秒轻伤、星辉护盾上限45。",
    ground: "map.eclipse.ground",
    preview: "map.eclipse.preview",
    decor: ["map.eclipse.pillar", "map.eclipse.altar", "map.eclipse.rune"],
    rock: "map.eclipse.pillar",
    difficulty: 1,
    spawns: [
      entry("crawler", 2),
      entry("runner", 1),
      entry("butterfly", 1, 70),
      entry("ghost", 1, 150),
      entry("mirror", 0.7, 230),
      entry("hexer", 0.7, 300),
      entry("summoner", 0.6, 420),
      entry("protector", 0.6, 480),
    ],
    elite: ["ghost", "mirror", "butterfly"],
    bosses: ["warden", "eclipseSaint", "mirrorMaiden", "eclipseSaint"],
  },
};
export const ENV_RULES = {
  crystals: 24,
  crystalHp: 120,
  chain: 16,
  chainRange: 145,
  candies: 12,
  candyPeriod: 12,
  candyLife: 28,
  buffTime: 8,
  fields: 9,
  fieldPeriod: 15,
  fieldRadius: 100,
  fieldWarning: 1.5,
  fieldLife: 9,
  summons: 3,
  children: 2,
  healPeriod: 4,
  healFraction: 0.07,
  healTargets: 4,
  shieldCapacity: 35,
  shieldTime: 4,
  shieldPeriod: 6,
};
