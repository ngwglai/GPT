import { refresh } from "../src/core/cardPool";
import { ensureDeck, heldLayers } from "../src/core/deckState";
import { grant } from "../src/core/progression";
import { World } from "../src/core/world";
import { createRun } from "../src/core/create";
import { closest, distance, unit } from "../src/core/math";
import { ENEMIES, LIMITS, UPGRADES } from "../src/data/content";
import { validateRun } from "../src/services/storage";
import { performance } from "node:perf_hooks";
export function simulate(
  seconds: number,
  character: string,
  seed: number,
  stress = false,
  shuffleAt?: number,
) {
  const w = new World(
    createRun(
      stress ? "endless" : "standard",
      character,
      seed,
      character === "knight" ? "ice" : "fire",
      "bloom",
    ),
  );
  if (stress)
    for (const id of ["bow", "blade", "ember", "orbit", "drone"] as const) {
      w.s.player.weapons[id] = 5;
      w.s.player.upgrades["weapon_" + id] =
        5 - (ensureDeck(w.s).baseWeapons[id] || 0);
    }
  const shuffles: {
    time: number;
    before: number;
    after: number;
    damageBefore: number;
    damageAfter: number;
  }[] = [];
  const start = performance.now();
  let frames = 0,
    saves = 0,
    peakHeapMiB = 0;
  const checkpoint: number[] = [];
  const output: {
    time: number;
    damage: number;
    layers: number;
    negativeLayers: number;
    extraDraws: { positive: number; negative: number };
    attack: number;
    maxHp: number;
  }[] = [];
  while (
    w.s.time < seconds &&
    w.s.phase !== "dead" &&
    w.s.phase !== "victory"
  ) {
    if (
      shuffleAt !== undefined &&
      w.s.phase === "playing" &&
      w.s.time >= shuffleAt &&
      !shuffles.length
    ) {
      const before = heldLayers(w.s),
        damageBefore = w.s.player.attack;
      if (!grant(w.s, "shuffle")) throw Error("shuffle failed");
      shuffles.push({
        time: Math.round(w.s.time),
        before,
        after: heldLayers(w.s),
        damageBefore,
        damageAfter: w.s.player.attack,
      });
    }
    if (w.s.phase === "upgrade") {
      const affinity =
        character === "knight"
          ? ["weapon_blade", "wide", "weapon_orbit", "satellite", "shatter"]
          : character === "mage"
            ? ["weapon_ember", "burn", "wildfire", "weapon_drone", "swarm"]
            : ["weapon_bow", "fork", "pierce", "homing", "weapon_drone"];
      const rank = (id: string) => {
        if (id === "weapon_orbit" && character !== "knight") return 3;
        if (id === "renew" || id === "vitality") return 10;
        if (id === "power" || id === "skill_e") return 7;
        return affinity.includes(id) ? 9 : id === "ascend" ? 6 : 1;
      };
      if (
        ensureDeck(w.s).active === "positive" &&
        w.s.choices.every((id) => rank(id) <= 1) &&
        refresh(w.s)
      )
        continue;
      w.choose([...w.s.choices].sort((a, b) => rank(b) - rank(a))[0]);
      continue;
    }
    const p = w.s.player,
      target = closest(p, w.s.enemies, 700);
    let goal = {
      x: 1800 + Math.cos(w.s.time * 0.045) * 700,
      y: 1800 + Math.sin(w.s.time * 0.045) * 700,
    };
    const gem = w.s.gems
      .filter((g) => distance(p, g) < 400)
      .sort((a, b) => distance(p, a) - distance(p, b))[0];
    if (gem) goal = gem;
    let dir = unit(goal.x - p.x, goal.y - p.y);
    for (const e of w.s.enemies) {
      const d = distance(e, p);
      if (d < e.r + 100) {
        const away = unit(p.x - e.x, p.y - e.y);
        dir.x += (away.x * (e.r + 100 - d)) / 35;
        dir.y += (away.y * (e.r + 100 - d)) / 35;
      }
    }
    for (const z of w.s.zones)
      if (z.enemy && distance(z, p) < z.r + 50) {
        const away = unit(p.x - z.x, p.y - z.y);
        dir.x += away.x * 3;
        dir.y += away.y * 3;
      }
    if (p.x < 200) dir.x += 3;
    if (p.x > 3400) dir.x -= 3;
    if (p.y < 200) dir.y += 3;
    if (p.y > 3400) dir.y -= 3;
    dir = unit(dir.x, dir.y);
    const danger =
      w.s.enemies.some((e) => distance(e, p) < e.r + 35) ||
      w.s.zones.some(
        (z) => z.enemy && z.delay < 0.35 && distance(z, p) < z.r + 20,
      );
    if (stress) {
      p.invincible = 1;
      p.hp = p.maxHp;
    }
    w.step(0.05, {
      x: dir.x,
      y: dir.y,
      aim: target || goal,
      dash: danger,
      skills: [
        !!target,
        p.hp < p.maxHp * 0.7,
        w.s.enemies.some((e) => ENEMIES[e.kind].boss && distance(e, p) < 450) ||
          w.s.enemies.length > 70,
      ],
    });
    frames++;
    if (frames % 6000 === 0)
      output.push({
        time: Math.round(w.s.time),
        damage: Math.round(w.s.stats.damage),
        layers: heldLayers(w.s),
        negativeLayers: UPGRADES.filter(
          (u) => u.polarity === "negative",
        ).reduce((n, u) => n + (w.s.player.upgrades[u.id] || 0), 0),
        extraDraws: { ...ensureDeck(w.s).earned },
        attack: w.s.player.attack,
        maxHp: w.s.player.maxHp,
      });
    if (frames % 12000 === 0) {
      validateRun(w.s);
      peakHeapMiB = Math.max(
        peakHeapMiB,
        process.memoryUsage().heapUsed / 1024 / 1024,
      );
      saves++;
      checkpoint.push(Math.round(w.s.time));
    }
    if (
      w.s.enemies.length > LIMITS.enemies ||
      w.s.bullets.length > LIMITS.bullets ||
      !Number.isFinite(p.hp)
    )
      throw Error("Simulation invariant failed");
  }
  const result = {
    shuffles,
    extraDraws: ensureDeck(w.s).earned,
    pendingDraws: ensureDeck(w.s).pending,
    dropObjects: w.s.rewardDrops?.length || 0,
    refreshes: ensureDeck(w.s).refreshes,
    negativeLayers: UPGRADES.filter((u) => u.polarity === "negative").reduce(
      (n, u) => n + (w.s.player.upgrades[u.id] || 0),
      0,
    ),
    output,
    finiteDefinitions: UPGRADES.filter((u) => u.maxStacks !== null).length,
    remainingDefinitions: UPGRADES.filter(
      (u) => u.maxStacks !== null && (w.s.player.upgrades[u.id] || 0) < u.max,
    ).length,
    remainingRanks: UPGRADES.filter((u) => u.maxStacks !== null).reduce(
      (n, u) => n + u.max - (w.s.player.upgrades[u.id] || 0),
      0,
    ),
    acquiredRanks: Object.values(w.s.player.upgrades).reduce(
      (a, b) => a + b,
      0,
    ),
    weapons: w.s.player.weapons,
    fate: w.s.fate && {
      chests: w.s.fate.chests,
      gained: w.s.fate.gained,
      cleansed: w.s.fate.cleansed,
    },
    character,
    seed,
    stress,
    seconds: Math.round(w.s.time),
    phase: w.s.phase,
    level: w.s.player.level,
    kills: w.s.stats.kills,
    bosses: w.s.stats.bosses,
    damage: Math.round(w.s.stats.damage),
    peakEnemies: w.s.stats.peakEnemies,
    peakBullets: w.s.stats.peakBullets,
    frames,
    checkpoint,
    validatedSnapshots: saves,
    peakHeapMiB: Math.round(peakHeapMiB),
    wallSeconds: Number(((performance.now() - start) / 1000).toFixed(2)),
    build: Object.keys(w.s.player.upgrades).map(
      (id) => UPGRADES.find((u) => u.id === id)?.name,
    ),
  };
  return result;
}
if (process.argv[1]?.endsWith("simulate.ts")) {
  const stress = process.argv.includes("--stress"),
    shuffleMode = process.argv.includes("--shuffle");
  const results = stress
    ? [simulate(7201, "ranger", 77, true, 3600)]
    : shuffleMode
      ? ["ranger", "knight", "mage"].map((c) =>
          simulate(1500, c, 29, false, 600),
        )
      : ["ranger", "knight", "mage"].flatMap((c) =>
          [11, 29, 83].map((seed) => simulate(1500, c, seed)),
        );
  console.log(JSON.stringify(results, null, 2));
  if (stress && results[0].seconds < 7200) process.exitCode = 1;
  if (
    !stress &&
    !shuffleMode &&
    !["ranger", "knight", "mage"].every((c) =>
      results.some((r) => r.character === c && r.phase === "victory"),
    )
  )
    process.exitCode = 1;
}
