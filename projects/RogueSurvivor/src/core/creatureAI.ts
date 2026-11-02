import type { Enemy, Run, Vec } from "./types";
import type { Combat } from "./combat";
import { spawn } from "./director";
import { NEW_ENEMIES } from "../data/creatures";
import { ENV_RULES } from "../data/maps";
import { difficulty, bossAttackInterval } from "../data/content";
import { ENEMY_RULES } from "../data/enemies";
import { WEAPONS } from "../data/weapons";
import { distance, unit, move, clamp, random } from "./math";
import {
  addCandy,
  addField,
  addCrystal,
  environment,
  hitCrystals,
} from "./environment";
export function behavior(e: Enemy) {
  return (e.behavior ??= {
    facing: 0,
    shield: 0,
    shieldTime: 0,
    shieldOwner: 0,
    summonOwner: 0,
    child: false,
    rewardless: false,
    warning: 0,
    target: null,
    reflecting: 0,
    awakened: false,
    copied: [],
    healUntil: 0,
  });
}
export function tickDefense(s: Run, e: Enemy, dt: number) {
  const b = e.behavior;
  if (!b) return;
  b.shieldTime = Math.max(0, b.shieldTime - dt);
  if (
    b.shieldTime <= 0 ||
    !s.enemies.some((x) => x.id === b.shieldOwner && x.hp > 0)
  )
    b.shield = 0;
}
export function safeLanding(s: Run, p: Vec, r: number) {
  const v = { x: clamp(p.x, 80, 3520), y: clamp(p.y, 80, 3520) };
  move(v, 0, 0, r, s.rocks);
  if (
    s.rocks.some((x) => distance(v, x) < x.r + r - 0.01) ||
    distance(v, s.player) < 90
  )
    return;
  return v;
}
export function childSpawn(
  c: Combat,
  owner: Enemy,
  kind: "crawler" | "splitter",
  p: Vec,
) {
  const e = spawn(c, kind, p);
  if (!e) return;
  const b = behavior(e);
  b.child = true;
  b.rewardless = true;
  b.summonOwner = owner.id;
  if (kind === "splitter") {
    e.r *= 0.55;
    e.hp *= 0.3;
    e.maxHp = e.hp;
    e.damage *= 0.6;
  }
  return e;
}
function ring(c: Combat, e: Enemy, count: number, offset = 0) {
  for (let i = 0; i < count; i++) {
    const a = offset + (i * Math.PI * 2) / count;
    c.shoot(
      e,
      { x: Math.cos(a), y: Math.sin(a) },
      e.damage,
      "enemy",
      e.kind,
      true,
    );
  }
}
function beam(c: Combat, e: Enemy, dir: Vec) {
  for (let i = 1; i <= 10; i++)
    c.zone(
      { x: e.x + dir.x * i * 66, y: e.y + dir.y * i * 66 },
      37,
      e.damage,
      "crystalBeam",
      true,
      1.15,
      0.3,
      e.kind,
    );
}
function boss(c: Combat, e: Enemy, dt: number) {
  const s = c.s,
    p = s.player,
    b = behavior(e),
    second = e.hp / e.maxHp < ENEMY_RULES.bossPhaseHp;
  const stage = second ? 2 : 1;
  if (b.target && b.warning > 0) {
    b.warning -= dt;
    if (b.warning <= 0) {
      // A live anchor detonates first; player destruction during the warning
      // has already removed this linked zone and therefore still cancels it.
      for (const z of s.zones)
        if (
          z.kind === "crystalChain" &&
          z.anchor !== undefined &&
          distance(z, b.target) < 1 &&
          environment(s).crystals.some((x) => x.id === z.anchor)
        ) {
          delete z.anchor;
          z.delay = 0;
        }
      hitCrystals(c, b.target, 175, 999);
      b.target = null;
    }
  }
  if (e.timer > 0) return;
  e.phase++;
  e.timer = bossAttackInterval(s.time, second);
  c.effect(e, "warning", 90);
  if (e.kind === "crystalQueen") {
    const a = random(s) * Math.PI * 2;
    for (let i = 0; i < stage + 1; i++)
      addCrystal(s, {
        x: e.x + Math.cos(a + i * 2.1) * 180,
        y: e.y + Math.sin(a + i * 2.1) * 180,
      });
    const n = unit(p.x - e.x, p.y - e.y);
    beam(c, e, n);
    if (second) beam(c, e, { x: -n.y, y: n.x });
    const crystal = environment(s).crystals.find((x) => distance(x, p) < 500);
    if (crystal) {
      b.target = { x: crystal.x, y: crystal.y };
      b.warning = 1.5;
      const warning = c.zone(
        crystal,
        175,
        e.damage,
        "crystalChain",
        true,
        1.5,
        0.25,
        e.kind,
      );
      if (warning) warning.anchor = crystal.id;
    }
  } else if (e.kind === "candyWitch") {
    const env = environment(s);
    env.rule = (env.rule + 1) % 2;
    s.event = env.rule
      ? "糖果魔女 · 苦糖回合：糖果更频繁且偏向恶作剧"
      : "糖果魔女 · 甜蜜回合：恢复常规糖果与闪电奖励";
    s.eventUntil = s.time + 4;
    for (let i = 0; i < stage + 1; i++) {
      const a = i * 2.4 + e.phase;
      addCandy(
        s,
        { x: p.x + Math.cos(a) * 155, y: p.y + Math.sin(a) * 155 },
        env.rule ? "slow" : "haste",
      );
    }
    const owned = s.enemies.filter(
      (x) => x.hp > 0 && x.behavior?.summonOwner === e.id,
    ).length;
    if (owned < ENV_RULES.summons)
      childSpawn(c, e, "splitter", { x: e.x + 60, y: e.y });
    c.zone({ ...p }, 80, e.damage, "candyTrap", true, 1.3, 0.3, e.kind);
    if (second) ring(c, e, 20, e.phase * 0.2);
  } else if (e.kind === "eclipseSaint") {
    // Broken ring leaves a visible exit; collision radii reduce its safe angle.
    for (let i = 0; i < 9; i++) {
      const a = e.phase * 0.45 + (i * Math.PI) / 6;
      c.zone(
        { x: p.x + Math.cos(a) * 210, y: p.y + Math.sin(a) * 210 },
        65,
        e.damage,
        "eclipseRing",
        true,
        1.6,
        0.3,
        e.kind,
      );
    }
    addField(s, { x: p.x - 170, y: p.y }, "shield");
    addField(s, { x: p.x + 150, y: p.y }, "eclipse");
    if (second) {
      addField(s, { x: p.x, y: p.y - 180 }, "moon");
      c.zone({ ...p }, 70, e.damage, "eclipseRing", true, 1.25, 0.2, e.kind);
    }
  } else {
    const available = Object.keys(p.weapons).filter((k) =>
      Object.hasOwn(WEAPONS, k),
    );
    const next = available.find((k) => !b.copied.includes(k));
    if (next && b.copied.length < 5) b.copied.push(next);
    const copied =
      b.copied[(e.phase - 1) % Math.max(1, b.copied.length)] || "bow";
    if (copied === "blade")
      c.zone(e, 140, e.damage, "mirrorSlash", true, 1.1, 0.3, e.kind);
    else if (copied === "orbit") {
      for (let i = 0; i < 5; i++) {
        const a = (i * Math.PI * 2) / 5;
        c.zone(
          { x: p.x + Math.cos(a) * 150, y: p.y + Math.sin(a) * 150 },
          55,
          e.damage,
          "mirrorOrbit",
          true,
          1.3,
          0.3,
          e.kind,
        );
      }
    } else if (copied === "ember")
      c.zone({ ...p }, 95, e.damage, "mirrorFire", true, 1.4, 0.6, e.kind);
    else {
      // Fixed-position delayed shots represented as avoidable star circles.
      const n = unit(p.x - e.x, p.y - e.y);
      for (let i = 1; i <= 4; i++)
        c.zone(
          { x: e.x + n.x * i * 85, y: e.y + n.y * i * 85 },
          42,
          e.damage,
          "mirrorArrow",
          true,
          0.9 + i * 0.15,
          0.2,
          e.kind,
        );
    }
    if (second) ring(c, e, 16, e.phase * 0.25);
  }
}
export function advancedAI(c: Combat, e: Enemy, dt: number) {
  if (!Object.hasOwn(NEW_ENEMIES, e.kind)) return false;
  const s = c.s,
    p = s.player,
    b = behavior(e),
    d = distance(e, p),
    n = unit(p.x - e.x, p.y - e.y);
  e.timer -= dt;
  b.reflecting = Math.max(0, b.reflecting - dt);
  const turn = Math.atan2(
    Math.sin(Math.atan2(n.y, n.x) - b.facing),
    Math.cos(Math.atan2(n.y, n.x) - b.facing),
  );
  b.facing += clamp(turn, -dt, dt);
  let vx = n.x,
    vy = n.y,
    boost = 1;
  if (
    e.kind.endsWith("Queen") ||
    e.kind === "candyWitch" ||
    e.kind === "eclipseSaint" ||
    e.kind === "mirrorMaiden"
  )
    boss(c, e, dt);
  if (e.kind === "fairy" || e.kind === "protector") {
    if (d < 260) {
      vx = -n.y * 0.7 - n.x * 0.3;
      vy = n.x * 0.7 - n.y * 0.3;
    }
    if (e.timer <= 0) {
      const allies = s.enemies
        .filter(
          (x) =>
            x.hp > 0 &&
            x.id !== e.id &&
            distance(x, e) < 190 &&
            x.kind !== "fairy" &&
            x.kind !== "protector",
        )
        .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)
        .slice(0, 4);
      for (const x of allies) {
        const t = behavior(x);
        if (e.kind === "fairy" && t.healUntil <= s.time && x.hp < x.maxHp) {
          x.hp = Math.min(x.maxHp, x.hp + x.maxHp * ENV_RULES.healFraction);
          t.healUntil = s.time + 3.8;
          c.effect(
            x,
            "heal",
            35,
            "+" + Math.ceil(x.maxHp * ENV_RULES.healFraction),
          );
        }
        if (e.kind === "protector" && t.shield <= 0) {
          t.shield = ENV_RULES.shieldCapacity;
          t.shieldTime = ENV_RULES.shieldTime;
          t.shieldOwner = e.id;
          c.effect(x, "shield", 36);
        }
      }
      e.timer =
        e.kind === "fairy" ? ENV_RULES.healPeriod : ENV_RULES.shieldPeriod;
    }
  }
  if (e.kind === "ghost") {
    if (b.target) {
      b.warning -= dt;
      vx = vy = 0;
      if (b.warning <= 0) {
        const pos = safeLanding(s, b.target, e.r);
        if (pos && distance(e, pos) <= ENV_RULES.teleportRange) {
          e.x = pos.x;
          e.y = pos.y;
          c.effect(e, "portal", 50);
        }
        b.target = null;
      }
    } else if (e.timer <= 0) {
      const a = random(s) * Math.PI * 2;
      let pos: Vec | undefined;
      for (let i = 0; i < 8; i++) {
        const angle = a + (i * Math.PI) / 4;
        const candidate = safeLanding(
          s,
          {
            x: e.x + n.x * 80 + Math.cos(angle) * 140,
            y: e.y + n.y * 80 + Math.sin(angle) * 140,
          },
          e.r,
        );
        if (candidate && distance(candidate, e) <= ENV_RULES.teleportRange) {
          pos = candidate;
          break;
        }
      }
      if (pos) {
        b.target = pos;
        b.warning = 0.8;
        vx = vy = 0;
        c.effect(pos, "warning", 40);
      }
      e.timer = 5 / difficulty(s.time).attackRate;
    }
  }
  if (e.kind === "mirror") {
    if (e.timer <= 0) {
      b.reflecting = 2.2;
      b.warning = 0.7;
      e.timer = 5 / difficulty(s.time).attackRate;
      c.effect(e, "warning", 50);
    }
    b.warning = Math.max(0, b.warning - dt);
  }
  if (e.kind === "mimic") {
    if (!b.awakened) {
      vx = vy = 0;
      if (d < 190 || e.hp < e.maxHp) {
        b.awakened = true;
        e.charge = n;
        b.warning = 0.7;
        c.effect(e, "warning", 55);
      }
    }
  }
  if (e.kind === "summoner") {
    if (d < 300) {
      vx = -n.y;
      vy = n.x;
    }
    if (e.timer <= 0) {
      if (
        s.enemies.filter((x) => x.hp > 0 && x.behavior?.summonOwner === e.id)
          .length < ENV_RULES.summons
      )
        childSpawn(c, e, "crawler", { x: e.x + 55, y: e.y });
      e.timer = 7 / Math.sqrt(difficulty(s.time).attackRate);
    }
  }
  if (e.kind === "hexer") {
    if (d < 280) {
      vx = -n.y;
      vy = n.x;
    }
    if (e.timer <= 0) {
      const status = (["slow", "curseHaste", "curseCooldown"] as const)[
        e.phase++ % 3
      ];
      c.shoot(e, n, e.damage, "enemy", "hexer", true, { status });
      e.timer = 3.8 / difficulty(s.time).attackRate;
      c.effect(e, "warning", 30);
    }
  }
  if (e.kind === "butterfly") {
    if (!e.charge) {
      const side = e.id % 2 ? 1 : -1;
      vx = n.x - n.y * side * 0.45;
      vy = n.y + n.x * side * 0.45;
      if (e.timer <= 0 && d < 440) {
        e.charge = n;
        b.warning = 0.65;
        c.effect(e, "warning", 28);
      }
    }
  }
  if (e.charge && (e.kind === "butterfly" || e.kind === "mimic")) {
    b.warning -= dt;
    if (b.warning > 0) vx = vy = 0;
    else if (b.warning > -0.4) {
      vx = e.charge.x;
      vy = e.charge.y;
      boost = 3.7;
    } else {
      e.charge = null;
      e.timer = 3.8 / difficulty(s.time).attackRate;
    }
  }
  // Preserve local obstacle steering for the new behaviors as well as legacy AI.
  if ((vx || vy) && !e.charge)
    for (const rock of s.rocks) {
      if (distance(e, rock) < e.r + rock.r + 52) {
        const away = unit(e.x - rock.x, e.y - rock.y);
        if (vx * away.x + vy * away.y < 0.2) {
          const side = n.x * -away.y + n.y * away.x >= 0 ? 1 : -1;
          vx += (-away.y * side + away.x) * 1.4;
          vy += (away.x * side + away.y) * 1.4;
        }
      }
    }
  const dir = unit(vx, vy);
  if (vx || vy)
    move(
      e,
      dir.x * e.speed * (e.slow > 0 ? 0.48 : 1) * boost * dt,
      dir.y * e.speed * (e.slow > 0 ? 0.48 : 1) * boost * dt,
      e.r,
      s.rocks,
    );
  if (distance(e, p) < e.r + 16) c.hurt(e.damage);
  return true;
}
