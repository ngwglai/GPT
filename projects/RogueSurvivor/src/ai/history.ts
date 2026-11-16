import type { LabSession, LabConfig } from "./session";
import type { ChoiceEvent } from "./controller";
import type { SkillEvent } from "./diagnostics";
export const HISTORY_KEY = "rogue-survivor-ai-lab:v1";
export const HISTORY_LIMIT = 12;
export const HISTORY_BYTES = 1024 * 1024;
export interface RunRecord {
  version: 1;
  id: string;
  createdAt: string;
  updatedAt: string;
  config: LabConfig;
  result: string;
  reason: string;
  time: number;
  wave: number;
  kills: number;
  bosses: number;
  level: number;
  damage: number;
  taken: number;
  hp: number;
  build: {
    weapons: Record<string, number>;
    upgrades: Record<string, number>;
    attributes: Record<string, number>;
    skills: string[];
  };
  cards: ChoiceEvent[];
  skills: SkillEvent[];
  totals: { choices: number; skills: number; decisions: number };
}
export function recordRun(
  session: LabSession,
  id: string,
  createdAt: string,
  result?: string,
): RunRecord {
  const s = session.world.s,
    p = s.player,
    c = session.controller;
  const state = result || s.phase;
  const reason =
    state === "victory"
      ? "击败最终首领，标准模式通关"
      : state === "dead"
        ? "生命耗尽，星火已用完"
        : state === "restarted"
          ? "用户重新开始"
          : state === "interrupted"
            ? "页面关闭或刷新，记录截至此时点"
            : session.paused
              ? "已暂停，尚未结束"
              : "进行中，尚未结束";
  return {
    version: 1,
    id,
    createdAt,
    updatedAt: new Date().toISOString(),
    config: { ...session.config },
    result: state,
    reason,
    time: s.time,
    wave: s.wave?.number || 1,
    kills: s.stats.kills,
    bosses: s.stats.bosses,
    level: p.level,
    damage: s.stats.damage,
    taken: s.stats.taken,
    hp: p.hp,
    build: {
      weapons: { ...p.weapons } as Record<string, number>,
      upgrades: Object.fromEntries(
        Object.entries(p.upgrades).filter(([, n]) => n > 0),
      ),
      attributes: {
        maxHp: p.maxHp,
        speed: p.speed,
        attack: p.attack,
        crit: p.crit,
        regen: p.regen,
        magnet: p.magnet,
        cooldown: p.cooldown,
        shield: p.shield,
      },
      skills: [...p.skills],
    },
    cards: structuredClone(c.choices),
    skills: structuredClone(c.skills),
    totals: {
      choices: c.choicesTotal,
      skills: c.skillsTotal,
      decisions: c.decisions,
    },
  };
}
export function boundedHistory(records: RunRecord[]) {
  const out = records.slice(-HISTORY_LIMIT);
  while (out.length && JSON.stringify(out).length * 2 > HISTORY_BYTES)
    out.shift();
  return out;
}
function validRecord(r: unknown): r is RunRecord {
  if (!r || typeof r !== "object") return false;
  const v = r as RunRecord;
  return (
    v.version === 1 &&
    typeof v.id === "string" &&
    v.id.length <= 80 &&
    typeof v.createdAt === "string" &&
    !!v.config &&
    ["legacy", "combat", "build"].includes(v.config.policy) &&
    ["forest", "cavern", "garden", "eclipse"].includes(v.config.map) &&
    ["ranger", "knight", "mage"].includes(v.config.character) &&
    ["standard", "endless"].includes(v.config.mode) &&
    Number.isFinite(v.config.seed) &&
    [v.time, v.wave, v.kills, v.bosses, v.level, v.damage, v.taken, v.hp].every(
      (x) => typeof x === "number" && Number.isFinite(x) && x >= 0,
    ) &&
    Array.isArray(v.cards) &&
    v.cards.length <= 240 &&
    v.cards.every(
      (c) =>
        typeof c.chosen === "string" &&
        Array.isArray(c.scores) &&
        c.scores.length <= 3 &&
        c.scores.every(
          (x) => typeof x.id === "string" && Number.isFinite(x.score),
        ),
    ) &&
    Array.isArray(v.skills) &&
    v.skills.length <= 160 &&
    !!v.build &&
    !!v.build.upgrades &&
    !!v.build.weapons &&
    !!v.build.attributes &&
    !!v.totals
  );
}
export class LabHistory {
  records: RunRecord[] = [];
  warning = "";
  constructor(private storage?: Pick<Storage, "getItem" | "setItem">) {
    try {
      const raw = storage?.getItem(HISTORY_KEY);
      if (raw && raw.length * 2 <= HISTORY_BYTES) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed))
          this.records = boundedHistory(parsed.filter(validRecord));
      }
    } catch {
      this.warning = "本地历史不可用；仍可游玩和导出当前对局。";
    }
  }
  save(record: RunRecord) {
    this.records = boundedHistory([
      ...this.records.filter((r) => r.id !== record.id),
      record,
    ]);
    try {
      this.storage?.setItem(HISTORY_KEY, JSON.stringify(this.records));
    } catch {
      this.warning = "浏览器未能保存历史；当前对局仍可导出。";
    }
  }
}
