export type Vec = { x: number; y: number };
export type Mode = "standard" | "endless";
export type WeaponId = "bow" | "blade" | "ember" | "orbit" | "drone";
export type SkillId = "fire" | "ice" | "lance" | "ward" | "bloom" | "storm";
export type EnemyId =
  | "crawler"
  | "runner"
  | "archer"
  | "seer"
  | "shaman"
  | "guard"
  | "bomber"
  | "warden"
  | "witch"
  | "titan"
  | "fairy"
  | "protector"
  | "ghost"
  | "splitter"
  | "mirror"
  | "mimic"
  | "summoner"
  | "hexer"
  | "butterfly"
  | "crab"
  | "crystalQueen"
  | "candyWitch"
  | "eclipseSaint"
  | "mirrorMaiden";
export type Phase = "playing" | "upgrade" | "dead" | "victory";
export interface Player extends Vec {
  hp: number;
  maxHp: number;
  shield: number;
  speed: number;
  invincible: number;
  dash: number;
  dashCd: number;
  dx: number;
  dy: number;
  level: number;
  xp: number;
  attack: number;
  crit: number;
  regen: number;
  magnet: number;
  cooldown: number;
  weapons: Partial<Record<WeaponId, number>>;
  weaponTimers: Record<WeaponId, number>;
  skills: [SkillId, SkillId, SkillId];
  skillLevels: Record<SkillId, number>;
  cooldowns: number[];
  upgrades: Record<string, number>;
}
export interface Enemy extends Vec {
  bossOrdinal?: number;
  dashPattern?: {
    wait: number;
    time: number;
    left: number;
    dx: number;
    dy: number;
  };
  behavior?: {
    facing: number;
    shield: number;
    shieldTime: number;
    shieldOwner: number;
    summonOwner: number;
    child: boolean;
    rewardless: boolean;
    warning: number;
    target: Vec | null;
    reflecting: number;
    awakened: boolean;
    copied: string[];
    copyShots?: number;
    healUntil: number;
  };
  id: number;
  kind: EnemyId;
  hp: number;
  maxHp: number;
  r: number;
  speed: number;
  damage: number;
  elite: boolean;
  timer: number;
  phase: number;
  slow: number;
  freeze: number;
  burn: number;
  burnPower: number;
  burnSource: string;
  hit: number;
  charge: Vec | null;
}
export interface Bullet extends Vec {
  motion?: {
    wait: number;
    turn: number;
    track: number;
    bounces: number;
    bounceIn?: number;
    owner: number;
  };
  id: number;
  vx: number;
  vy: number;
  r: number;
  damage: number;
  life: number;
  enemy: boolean;
  pierce: number;
  hits: number[];
  kind: string;
  source: string;
  homing: boolean;
  split: boolean;
  reflected?: boolean;
  status?: "slow" | "curseHaste" | "curseCooldown";
}
export interface Zone extends Vec {
  shape?: {
    kind: "bar" | "fan";
    angle: number;
    length: number;
    halfAngle: number;
    omega: number;
    vx: number;
    vy: number;
    owner: number;
  };
  anchor?: number;
  id: number;
  r: number;
  delay: number;
  life: number;
  tick: number;
  damage: number;
  enemy: boolean;
  kind: string;
  source: string;
}
export interface Gem extends Vec {
  value: number;
}
export interface Effect extends Vec {
  kind: string;
  life: number;
  maxLife: number;
  r: number;
  text?: string;
}
export interface Rock extends Vec {
  crystalId?: number;
  r: number;
}
export interface Stats {
  kills: number;
  damage: number;
  taken: number;
  healed: number;
  bosses: number;
  bySource: Record<string, number>;
  peakEnemies: number;
  peakBullets: number;
}
export interface Run {
  fate?: import("./fate").Fate;
  deck?: import("./deckState").DeckState;
  rewardDrops?: import("./drops").RewardDrop[];
  version: 1 | 2 | 3;
  wave?: import("./waves").WaveState;
  environment?: import("./environmentTypes").EnvironmentState;
  seed: number;
  rng: number;
  mode: Mode;
  character: string;
  time: number;
  phase: Phase;
  player: Player;
  enemies: Enemy[];
  bullets: Bullet[];
  zones: Zone[];
  gems: Gem[];
  rocks: Rock[];
  stats: Stats;
  spawnTimer: number;
  nextBoss: number;
  bossIndex: number;
  nextId: number;
  choices: string[];
  event: string;
  eventUntil: number;
  nextEvent: number;
  victoryClaimed: boolean;
}
export interface Input {
  x: number;
  y: number;
  aim: Vec;
  dash?: boolean;
  skills?: boolean[];
}
export interface Settings {
  music: number;
  musicEnabled?: boolean;
  sfx: number;
  quality: "high" | "low";
  shake: boolean;
  showStats: boolean;
}
export interface RecordEntry {
  mode: Mode;
  time: number;
  kills: number;
  level: number;
  victory: boolean;
  date: string;
  character: string;
}
export interface Profile {
  version: 1;
  records: RecordEntry[];
  unlocks: string[];
  best: number;
}
