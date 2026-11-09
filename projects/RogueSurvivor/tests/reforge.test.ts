import legacyV17 from "./fixtures/v17-run.json";
import { describe, it, expect } from "vitest";
import { createRun } from "../src/core/create";
import { World } from "../src/core/world";
import { spawn, ai } from "../src/core/director";
import { grant } from "../src/core/rewards";
import { eligible, offer, cardWeight, refresh } from "../src/core/cardPool";
import { recalculate, forget } from "../src/core/fate";
import { buildState } from "../src/core/buildState";
import { damageBreakdown, criticalMultiplier } from "../src/core/damage";
import {
  CORE_CARDS,
  CORE_IDS,
  CORE_PARAMS as P,
} from "../src/data/cards/cores";
import { weaponStats } from "../src/data/weapons";
import { WEAPONS, UPGRADES, xpNeeded, LIMITS } from "../src/data/content";
import { GROWTH_RULES } from "../src/data/growth";
import { validateRun } from "../src/services/storage";
import { applyUpgrade, checkLevel } from "../src/core/progression";
import { ensureDeck, heldLayers } from "../src/core/deckState";
import { shuffleDeck } from "../src/core/shuffle";
import { cardDescription } from "../src/core/progression";
import { effectSummary, nextEffect } from "../src/ui/cards";
function world() {
  const w = new World(createRun("endless", "ranger", 1808));
  w.s.rocks = [];
  w.s.player.level = 30;
  w.s.player.crit = 0;
  return w;
}
function dummy(w: World, kind: "crawler" | "warden" = "crawler", x = 1840) {
  const e = spawn(w, kind, { x, y: 1800 })!;
  e.hp = e.maxHp = 100000;
  w.grid.rebuild(w.s.enemies);
  return e;
}
function cards(w: World, ids: string[]) {
  for (const id of ids) expect(grant(w.s, id), id).toBe(true);
  w.s.player.crit = 0;
}
describe("星轨重铸：三级武器", () => {
  it.each(Object.keys(WEAPONS) as (keyof typeof WEAPONS)[])(
    "%s 按1→2→3进化，第四次拒绝且可存档",
    (id) => {
      const w = world(),
        s = w.s;
      while ((s.player.weapons[id] || 0) < 3)
        expect(grant(s, "weapon_" + id)).toBe(true);
      expect(grant(s, "weapon_" + id)).toBe(false);
      expect(s.player.weapons[id]).toBe(3);
      const saved = validateRun(s);
      expect(saved.player.weapons[id]).toBe(3);
      expect(weaponStats(id, 2).damage).toBeCloseTo(WEAPONS[id].damage * 1.48);
      expect(weaponStats(id, 3).interval).toBeCloseTo(
        WEAPONS[id].interval / 1.25,
      );
    },
  );
  it.each(["bow", "blade", "ember", "orbit", "drone"] as const)(
    "%s 第三级改变实际攻击机制",
    (id) => {
      const check = (rank: number) => {
        const w = world();
        dummy(w);
        w.s.player.weapons = { [id]: rank };
        w.auto(0.01);
        return w;
      };
      const a = check(2),
        b = check(3);
      if (id === "bow") expect(b.s.bullets.length).toBe(a.s.bullets.length + 1);
      if (id === "blade")
        expect(
          b.effects.find((e) => e.kind === "slash")!.r -
            a.effects.find((e) => e.kind === "slash")!.r,
        ).toBe(GROWTH_RULES.bladeEvolutionRadius);
      if (id === "orbit")
        expect(
          b.effects.filter((e) => e.kind === "orbit").length -
            a.effects.filter((e) => e.kind === "orbit").length,
        ).toBe(2);
      if (id === "drone") {
        expect(a.s.bullets.every((x) => !x.homing)).toBe(true);
        expect(b.s.bullets.every((x) => x.homing)).toBe(true);
      }
      if (id === "ember") {
        const impact = (w: World) => {
          const e = w.s.enemies[0],
            bullet = w.s.bullets[0];
          bullet.x = e.x;
          bullet.y = e.y;
          bullet.vx = bullet.vy = 0;
          w.projectiles(0.01);
          return w.effects.find((x) => x.kind === "fire")!.r;
        };
        expect(impact(a)).toBe(55);
        expect(impact(b)).toBe(100);
      }
    },
  );
  it("五种武器并存，攻击量与已有预算有界", () => {
    const w = world();
    for (const id of Object.keys(WEAPONS))
      while ((w.s.player.weapons[id as keyof typeof WEAPONS] || 0) < 3)
        grant(w.s, "weapon_" + id);
    dummy(w);
    for (let i = 0; i < 600; i++)
      w.step(1 / 60, { x: 0, y: 0, aim: w.s.player });
    expect(Object.keys(w.s.player.weapons)).toHaveLength(5);
    expect(w.s.bullets.length).toBeLessThanOrEqual(LIMITS.bullets);
    expect(() => validateRun(w.s)).not.toThrow();
  });
  it("损坏数值在公开武器计算入口不会产生NaN", () => {
    expect(Number.isFinite(weaponStats("bow", NaN).damage)).toBe(true);
  });
});
describe("统一伤害乘区", () => {
  it("基础攻击、专精、条件和暴击分别计算且同条件加算", () => {
    const w = world(),
      e = dummy(w, "warden");
    cards(w, ["power", "bow_power", "shatter", "boss_hunter", "burn"]);
    w.s.player.upgrades.burning_judge = 1;
    e.freeze = 1;
    e.burn = 2;
    const d = damageBreakdown(w.s, e, 10, "bow", true);
    expect(d.base).toBeCloseTo(1.2);
    expect(d.expertise).toBeCloseTo(1.3);
    expect(d.conditional).toBeCloseTo(1 + 0.4 + 0.25 + 0.25);
    expect(d.critical).toBe(2);
    expect(d.total).toBeCloseTo(10 * 1.2 * 1.3 * 1.9 * 2);
    w.s.player.crit = 1;
    w.damage(e, 10, "bow");
    expect(e.maxHp - e.hp).toBeCloseTo(d.total);
  });
  it("暴伤和临界溢出仍带来真实收益，净化遗忘可重算", () => {
    const w = world();
    cards(w, ["crit_damage"]);
    expect(criticalMultiplier(w.s)).toBe(2.3);
    w.s.player.upgrades.crit_damage = 10000;
    recalculate(w.s);
    const before = w.s.player.attack;
    grant(w.s, "crit_damage");
    expect(criticalMultiplier(w.s)).toBe(6);
    expect(w.s.player.attack).toBeGreaterThan(before);
    expect(nextEffect(w.s, "crit_damage")).toContain("基础攻击区");
    const a = w.s.player.attack;
    expect(forget(w.s)).toBe("crit_damage");
    expect(w.s.player.attack).toBeLessThan(a);
  });
  it("条件不会被火焰基础伤害重复叠乘，范围攻击保持蟹甲规则", () => {
    const w = world(),
      e = dummy(w);
    cards(w, ["weapon_ember", "ember_power", "burn"]);
    w.area(e, 30, 10, "fire", "ember");
    expect(e.maxHp - e.hp).toBeCloseTo(13);
    expect(e.burnPower).toBeCloseTo(10 * 0.15 * 1.4);
    const before = e.hp;
    ai(w, 0.05);
    expect(before - e.hp).toBeCloseTo(e.burnPower * 0.05 * 1.3);
  });
  it("有限与非法输入损伤不会产生负伤害或Infinity", () => {
    const w = world(),
      e = dummy(w);
    for (const raw of [NaN, Infinity, -Infinity, -100, 1e300]) {
      const d = damageBreakdown(w.s, e, raw, "bow", true);
      expect(Number.isFinite(d.total)).toBe(true);
      expect(d.total).toBeGreaterThanOrEqual(0);
      expect(d.total).toBeLessThanOrEqual(1e12);
    }
  });
});
describe("十张机制核心卡", () => {
  it("核心卡均有真实机制、有效前置与互斥", () => {
    expect(CORE_IDS.size).toBe(10);
    for (const u of CORE_CARDS) {
      for (const id of [u.requires, ...(u.allOf || [])].filter(Boolean))
        expect(UPGRADES.some((x) => x.id === id)).toBe(true);
      if (u.excludes)
        expect(UPGRADES.some((x) => x.id === u.excludes)).toBe(true);
    }
    const w = world();
    expect(grant(w.s, "twin_resonance")).toBe(false);
    cards(w, ["weapon_orbit", "twin_resonance"]);
    cards(w, ["star_focus"]);
    expect(grant(w.s, "star_chain")).toBe(false);
  });
  it("冰晶碎裂杀敌冰爆，不允许衍生击杀递归", () => {
    const w = world();
    cards(w, ["shatter", "crystal_fracture"]);
    const a = dummy(w),
      b = dummy(w, "crawler", 1870),
      c = dummy(w, "crawler", 1900);
    a.hp = 1;
    b.hp = 1;
    a.freeze = b.freeze = 2;
    w.damage(a, 10, "bow");
    expect(b.hp).toBeLessThanOrEqual(0);
    expect(w.s.stats.bySource.crystal_fracture).toBeGreaterThan(0);
    expect(w.effects.filter((x) => x.kind === "ice")).toHaveLength(1);
    expect(c.hp).toBeLessThan(c.maxHp);
  });
  it("余烬循环独立暴击倍率，燃烧不消费追猎充能", () => {
    const w = world(),
      e = dummy(w);
    cards(w, ["burn", "ember_cycle", "critical", "blood_hunt"]);
    w.s.player.crit = 1;
    buildState(w.s).hunt = true;
    w.damage(e, 10, "ember", false, undefined, { kind: "burn" });
    expect(e.maxHp - e.hp).toBeCloseTo(10 * P.burnCrit);
    expect(buildState(w.s).hunt).toBe(true);
  });
  it("暴击击杀只存一次追猎，下一次非致命直接命中消耗", () => {
    const w = world(),
      a = dummy(w),
      b = dummy(w, "crawler", 1890);
    cards(w, ["critical", "blood_hunt"]);
    w.s.player.crit = 1;
    a.hp = 1;
    w.damage(a, 10, "bow");
    expect(buildState(w.s).hunt).toBe(true);
    w.s.player.crit = 0;
    const before = b.hp;
    w.damage(b, 10, "bow");
    expect(before - b.hp).toBeCloseTo(22.5);
    expect(buildState(w.s).hunt).toBe(false);
  });
  it("月环共振有全局冷却，双生每四次命中冻结", () => {
    const w = world();
    cards(w, ["weapon_orbit", "shatter", "orbit_resonance", "twin_resonance"]);
    const e = dummy(w),
      b = dummy(w, "crawler", 1890);
    for (let i = 0; i < 4; i++) w.damage(e, 1, "bow");
    expect(e.freeze).toBe(P.twins.freeze);
    w.damage(e, 1, "orbit");
    const dealt = w.s.stats.bySource.orbit_resonance;
    expect(dealt).toBeGreaterThan(0);
    w.damage(e, 1, "orbit");
    expect(w.s.stats.bySource.orbit_resonance).toBe(dealt);
    expect(b.hp).toBeLessThan(b.maxHp);
  });
  it("火焰连锁最多三个节点并且不再施加燃烧", () => {
    let triggered = false;
    for (let seed = 1; seed < 50 && !triggered; seed++) {
      const w = world();
      w.s.rng = seed;
      cards(w, ["weapon_ember", "star_chain"]);
      for (let i = 0; i < 12; i++) dummy(w, "crawler", 1830 + i * 20);
      w.area(w.s.player, 10, 10, "fire", "ember");
      const count = w.effects.filter((x) => x.kind === "fire").length - 1;
      if (count) {
        triggered = true;
        expect(count).toBeLessThanOrEqual(3);
        expect(w.s.enemies.every((e) => e.burn === 0)).toBe(true);
      }
    }
    expect(triggered).toBe(true);
  });
  it("终末裁决条件收益随生命下降，聚焦切换目标清空", () => {
    const w = world(),
      a = dummy(w),
      b = dummy(w, "crawler", 1910);
    cards(w, ["execution", "final_judgment", "star_focus"]);
    a.hp = a.maxHp * 0.4;
    const x = damageBreakdown(w.s, a, 10, "bow").conditional;
    a.hp = a.maxHp * 0.1;
    expect(damageBreakdown(w.s, a, 10, "bow").conditional).toBeGreaterThan(x);
    a.hp = a.maxHp;
    w.damage(a, 10, "bow");
    const before = a.hp;
    w.damage(a, 10, "bow");
    expect(before - a.hp).toBeCloseTo(10.4);
    const bp = b.hp;
    w.damage(b, 10, "bow");
    expect(bp - b.hp).toBe(10);
    expect(buildState(w.s).focusHits).toBe(1);
  });
  it("霜焰蒸腾只对双状态触发且不递归；琉璃彗星有真实生命代价", () => {
    const w = world(),
      e = dummy(w);
    cards(w, ["burn", "shatter", "frostfire", "glass_comet"]);
    e.burn = 1;
    e.freeze = 1;
    w.damage(e, 10, "bow");
    const dealt = w.s.stats.bySource.frostfire;
    expect(dealt).toBeGreaterThan(0);
    w.damage(e, 10, "bow");
    expect(w.s.stats.bySource.frostfire).toBe(dealt);
    const hp = w.s.player.hp;
    w.step(0.01, { x: 1, y: 0, dash: true, aim: w.s.player });
    expect(w.s.player.hp).toBeLessThan(hp);
    expect(buildState(w.s).dashUntil).toBeGreaterThan(w.s.time);
    expect(w.s.player.dash).toBe(0.18);
  });
});
describe("经济、存档与无限成长", () => {
  it("前三级经验不变，之后平滑提高，无尽没有玩法等级上限", () => {
    for (let lv = 1; lv <= 3; lv++)
      expect(xpNeeded(lv)).toBe(18 + lv * 12 + Math.floor(Math.sqrt(lv) * 8));
    for (let lv = 4; lv < 200; lv++) {
      expect(xpNeeded(lv)).toBeGreaterThan(xpNeeded(lv - 1));
      expect(xpNeeded(lv) / xpNeeded(lv - 1)).toBeLessThan(1.5);
    }
    expect(Number.isFinite(xpNeeded(1e12))).toBe(true);
  });
  it("记录新增抽卡来源，刷新不算新机会", () => {
    const w = world(),
      s = w.s;
    s.player.xp = xpNeeded(s.player.level);
    checkLevel(s);
    expect(buildState(s).draws.level).toBe(1);
    refresh(s);
    expect(buildState(s).draws.refresh).toBe(1);
    expect(buildState(s).draws.level).toBe(1);
    s.phase = "playing";
    ensureDeck(s).pending.negative = 1;
    checkLevel(s);
    expect(buildState(s).draws.negative).toBe(1);
  });
  it("构筑亲和只改权重，不绕过资格或锁死新武器", () => {
    const w = world();
    const own = UPGRADES.find((x) => x.id === "bow_power")!;
    expect(cardWeight(w.s, own)).toBeGreaterThan([6, 3, 1][own.rarity]);
    expect(eligible(w.s).some((x) => x.id === "weapon_ember")).toBe(true);
    cards(w, ["burn"]);
    const card = UPGRADES.find((x) => x.id === "ember_cycle")!;
    expect(cardWeight(w.s, card)).toBeGreaterThan([6, 3, 1][card.rarity]);
  });
  it.each([1, 2, 3, 4])(
    "旧版%s武器5级补偿两层对应专精，rng/波次/队列/星火保持且迁移幂等",
    (version) => {
      const w = world(),
        s = w.s;
      s.version = version as 1 | 2 | 3 | 4;
      s.player.upgrades.weapon_bow = 4;
      s.player.weapons.bow = 5;
      s.player.upgrades.power = 2;
      recalculate(s);
      s.player.weapons.bow = 5;
      const rng = s.rng,
        wave = structuredClone(s.wave),
        revival = structuredClone(s.revival),
        pending = structuredClone(s.deck!.pending);
      const v = validateRun(s);
      expect(v.version).toBe(5);
      expect(v.player.weapons.bow).toBe(3);
      expect(v.player.upgrades.weapon_bow).toBe(2);
      expect(v.player.upgrades.bow_power).toBe(2);
      expect(v.build!.compensation).toBe(2);
      expect(v.rng).toBe(rng);
      if (version >= 3) expect(v.wave).toEqual(wave);
      expect(v.revival?.remaining).toBe(revival?.remaining);
      expect(v.deck!.pending).toEqual(pending);
      expect(validateRun(v)).toEqual(v);
    },
  );
  it("旧4级映射3级，已满的待选武器被合法候选替代，不消耗RNG", () => {
    const w = world(),
      s = w.s;
    s.version = 4;
    s.player.upgrades.weapon_bow = 3;
    s.player.weapons.bow = 4;
    s.phase = "upgrade";
    s.deck!.active = "positive";
    s.choices = ["weapon_bow"];
    const r = s.rng,
      v = validateRun(s);
    expect(v.player.weapons.bow).toBe(3);
    expect(v.player.upgrades.bow_power).toBe(1);
    expect(v.choices).not.toContain("weapon_bow");
    expect(v.choices.length).toBe(3);
    expect(v.rng).toBe(r);
  });
  it("非法旧武器等级被拒绝，不能通过迁移洗白", () => {
    const s = createRun("endless");
    s.version = 4;
    s.player.weapons.bow = 999;
    expect(() => validateRun(s)).toThrow();
  });
  it("机制状态、抽卡统计持久化，洗牌清空旧触发状态但等量保留卡牌", () => {
    const w = world(),
      s = w.s;
    cards(w, [
      "weapon_orbit",
      "shatter",
      "orbit_resonance",
      "critical",
      "blood_hunt",
    ]);
    const b = buildState(s);
    b.hunt = true;
    b.focusId = 123;
    b.focusHits = 4;
    b.dashUntil = 5;
    const restored = validateRun(s);
    expect(restored.build).toEqual(b);
    const before = heldLayers(s);
    expect(shuffleDeck(s, () => "power")).toBe(true);
    expect(heldLayers(s)).toBe(before);
    expect(buildState(s).hunt).toBe(false);
    expect(buildState(s).dashUntil).toBe(0);
    expect(s.player.weapons.orbit).toBeUndefined();
  });
  it("属性层数极端值有限，宝箱不递归且不越过三级", () => {
    const w = world(),
      s = w.s;
    for (const id of [
      "power",
      "critical",
      "crit_damage",
      "bow_power",
      "boss_hunter",
      "burning_judge",
    ])
      s.player.upgrades[id] = 1e9;
    recalculate(s);
    const e = dummy(w, "warden");
    expect(
      Number.isFinite(damageBreakdown(s, e, 1e100, "bow", true).total),
    ).toBe(true);
    for (let i = 0; i < 100; i++) expect(grant(s, "chest_epic")).toBe(true);
    expect(Object.values(s.player.weapons).every((n) => n <= 3)).toBe(true);
    expect(s.fate!.chests).toBe(100);
    expect(() => validateRun(s)).not.toThrow();
  });
  it("卡牌说明读取实际武器参数、核心参数及属性增量", () => {
    const s = world().s;
    expect(cardDescription(s, "weapon_blade")).toContain("3级横扫半径额外+45");
    expect(UPGRADES.find((x) => x.id === "crystal_fracture")!.desc).toContain(
      String(P.fracture.radius),
    );
    expect(cardDescription(s, "power")).toContain("20个百分点");
    expect(effectSummary(s, "weapon_bow")).toContain("/ 3");
  });
});

it("旧版本无fate基线时按旧属性贡献还原，再执行新规则", () => {
  const s = createRun("standard");
  s.version = 1;
  s.player.upgrades.power = 2;
  s.player.attack = 1.24;
  const v = validateRun(s);
  expect(v.fate!.base.attack).toBeCloseTo(1);
  expect(v.player.attack).toBeCloseTo(1.4);
  expect(v.player.upgrades.power).toBe(2);
});
it("护甲刚到上限后下一张立刻转化为可见收益", () => {
  const w = world(),
    s = w.s;
  s.player.upgrades.armor = 6;
  recalculate(s);
  const attack = s.player.attack;
  grant(s, "armor");
  expect(s.player.attack).toBeGreaterThan(attack);
});
it.each(["critical", "stride", "haste", "magnet", "armor", "bow_quick"])(
  "无限%s达到边界后下一张仍有实际属性收益",
  (id) => {
    const w = world(),
      s = w.s;
    s.player.upgrades[id] = 1e6;
    recalculate(s);
    const before = s.player.attack;
    expect(grant(s, id)).toBe(true);
    expect(s.player.attack).toBeGreaterThan(before);
    expect(Number.isFinite(s.player.attack)).toBe(true);
  },
);

it("原v1.7 API构造的存档夹具完整迁移，不含玩家数据且不丢失负面/星火/待领队列", () => {
  const old = structuredClone(legacyV17),
    v = validateRun(old);
  expect(v.version).toBe(5);
  expect(v.player.weapons.bow).toBe(3);
  expect(v.player.upgrades.bow_power).toBe(2);
  expect(v.player.upgrades.hex_wither).toBe(old.player.upgrades.hex_wither);
  expect(v.revival).toEqual(old.revival);
  expect(v.wave).toEqual(old.wave);
  expect(v.deck!.pending).toEqual(old.deck.pending);
  expect(v.rng).toBe(old.rng);
  expect(v.fate!.base).toEqual(old.fate.base);
  expect(v.player.xp / xpNeeded(v.player.level)).toBeCloseTo(
    old.player.xp /
      (18 +
        old.player.level * 12 +
        Math.floor(Math.sqrt(old.player.level) * 8)),
  );
  expect(v.enemies).toEqual(old.enemies);
  expect(v.choices).not.toContain("weapon_bow");
  expect(validateRun(v)).toEqual(v);
  expect(old.version).toBe(4);
});
it("遗忘不会移除核心卡所依赖的最后一层强化", () => {
  const w = world();
  cards(w, ["weapon_orbit", "shatter", "orbit_resonance"]);
  expect(forget(w.s)).toBe(false);
  cards(w, ["shatter"]);
  expect(forget(w.s)).toBe("shatter");
  expect(w.s.player.upgrades.shatter).toBe(1);
});
it("互斥关系在两侧的图鉴元数据中都明确可见", () => {
  expect(UPGRADES.find((x) => x.id === "fortress")!.excludes).toBe(
    "glass_comet",
  );
  const w = world();
  cards(w, ["glass_comet"]);
  expect(grant(w.s, "fortress")).toBe(false);
});

it("风险核心标为混合，洗牌纯正面池不得生成琉璃彗星", () => {
  const c = UPGRADES.find((u) => u.id === "glass_comet")!;
  expect(c.polarity).toBe("mixed");
  expect(c.shuffleReward).toBe(false);
});

it("初始武器的升级说明展示实际武器等级，而非获取卡层数", () => {
  const w = world();
  grant(w.s, "weapon_bow");
  expect(cardDescription(w.s, "weapon_bow")).toContain("当前2级 → 3级");
});

it("宝箱不会随机强塞有代价的混合核心", () => {
  const w = world();
  for (let i = 0; i < 100; i++) grant(w.s, "chest_epic");
  expect(w.s.player.upgrades.glass_comet || 0).toBe(0);
});
it("遗忘后的再次选择单独记录，不伪装成刷新或升级", () => {
  const w = world();
  grant(w.s, "power");
  w.s.phase = "upgrade";
  w.s.choices = ["forget"];
  w.s.deck!.active = "positive";
  expect(applyUpgrade(w.s, "forget")).toBe(true);
  expect(buildState(w.s).draws.replacement).toBe(1);
  expect(buildState(w.s).draws.level).toBe(0);
  expect(buildState(w.s).draws.refresh).toBe(0);
});

it("暴伤说明不会在缺少余烬循环时暗示燃烧已可暴击", () => {
  const s = world().s;
  expect(effectSummary(s, "crit_damage")).toContain("燃烧暴击未解锁");
  s.player.upgrades.ember_cycle = 1;
  expect(effectSummary(s, "crit_damage")).not.toContain("未解锁");
});

it("高频多箭的双生共鸣不会永久冻结Boss", () => {
  const w = world();
  cards(w, ["weapon_orbit", "twin_resonance"]);
  const e = dummy(w, "warden");
  let frozen = 0;
  // Four impacts per 0.2s is within an evolved, forked, quickened bow's firing rate.
  for (let frame = 0; frame < 200; frame++) {
    w.s.time = frame * 0.02;
    e.freeze = Math.max(0, e.freeze - 0.02);
    if (frame % 10 === 0)
      for (let arrow = 0; arrow < 4; arrow++) w.damage(e, 0.01, "bow", false);
    if (e.freeze > 0) frozen += 0.02;
  }
  expect(frozen).toBeLessThanOrEqual(1);
  expect(e.hp).toBeGreaterThan(0);
});

it("双生控制冷却随存档恢复，不会重复触发", () => {
  const w = world();
  cards(w, ["weapon_orbit", "twin_resonance"]);
  const e = dummy(w, "warden");
  for (let i = 0; i < 4; i++) w.damage(e, 0.01, "bow", false);
  const saved = validateRun(w.s);
  expect(saved.build!.twinReady).toBeCloseTo(P.twins.cooldown);
  const resumed = new World(saved),
    target = resumed.s.enemies[0];
  target.freeze = 0;
  resumed.s.time = 0.1;
  for (let i = 0; i < 4; i++) resumed.damage(target, 0.01, "bow", false);
  expect(target.freeze).toBe(0);
});
it("较早v5检查点缺少新增控制时钟时可安全补齐", () => {
  const s = world().s;
  delete (s.build as any).twinReady;
  expect(validateRun(s).build!.twinReady).toBe(0);
});
