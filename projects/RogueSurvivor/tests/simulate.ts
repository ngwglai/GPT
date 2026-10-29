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
  const start = performance.now();
  let frames = 0,
    saves = 0,
    peakHeapMiB = 0;
  const checkpoint: number[] = [];
  while (
    w.s.time < seconds &&
    w.s.phase !== "dead" &&
    w.s.phase !== "victory"
  ) {
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
  const stress = process.argv.includes("--stress");
  const results = stress
    ? [simulate(7201, "ranger", 77, true)]
    : ["ranger", "knight", "mage"].flatMap((c) =>
        [11, 29, 83].map((seed) => simulate(1500, c, seed)),
      );
  console.log(JSON.stringify(results, null, 2));
  if (stress && results[0].seconds < 7200) process.exitCode = 1;
  if (
    !stress &&
    !["ranger", "knight", "mage"].every((c) =>
      results.some((r) => r.character === c && r.phase === "victory"),
    )
  )
    process.exitCode = 1;
}
