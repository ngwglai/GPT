/** Extracted verbatim decisions from tests/simulate.ts at 232a8e2.
 * The original script remains unchanged. Stress grants are deliberately excluded. */
import type { Policy, Observation, CardDecision } from "./types";
import { closest, distance, unit } from "../core/math";
import type { Enemy, Input } from "../core/types";
import { ENEMIES } from "../data/content";
// readonly observations are structurally compatible with geometry; no mutations here.
export class LegacyPolicy implements Policy {
  readonly name: string = "legacy";
  choose(s: Observation): CardDecision {
    const affinity =
      s.character === "knight"
        ? ["weapon_blade", "wide", "weapon_orbit", "satellite", "shatter"]
        : s.character === "mage"
          ? ["weapon_ember", "burn", "wildfire", "weapon_drone", "swarm"]
          : ["weapon_bow", "fork", "pierce", "homing", "weapon_drone"];
    const rank = (id: string) => {
      if (id === "weapon_orbit" && s.character !== "knight") return 3;
      if (id === "renew" || id === "vitality") return 10;
      if (id === "power" || id === "skill_e") return 7;
      return affinity.includes(id) ? 9 : id === "ascend" ? 6 : 1;
    };

    return {
      id: [...s.choices].sort((a, b) => rank(b) - rank(a))[0],
      refresh:
        s.deck?.active === "positive" && s.choices.every((id) => rank(id) <= 1),
      scores: s.choices.map((id) => ({
        id,
        score: rank(id),
        reason: "legacy-static-rank",
      })),
    };
  }
  act(s: Observation): Input {
    const p = s.player,
      target = closest(p, s.enemies as Enemy[], 700);
    let goal = {
      x: 1800 + Math.cos(s.time * 0.045) * 700,
      y: 1800 + Math.sin(s.time * 0.045) * 700,
    };
    const gem = s.gems
      .filter((g) => distance(p, g) < 400)
      .sort((a, b) => distance(p, a) - distance(p, b))[0];
    if (gem) goal = gem;
    let dir = unit(goal.x - p.x, goal.y - p.y);
    for (const e of s.enemies) {
      const d = distance(e, p);
      if (d < e.r + 100) {
        const away = unit(p.x - e.x, p.y - e.y);
        dir.x += (away.x * (e.r + 100 - d)) / 35;
        dir.y += (away.y * (e.r + 100 - d)) / 35;
      }
    }
    for (const z of s.zones)
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
      s.enemies.some((e) => distance(e, p) < e.r + 35) ||
      s.zones.some(
        (z) => z.enemy && z.delay < 0.35 && distance(z, p) < z.r + 20,
      );
    return {
      x: dir.x,
      y: dir.y,
      aim: target || goal,
      dash: danger,
      skills: [
        !!target,
        p.hp < p.maxHp * 0.7,
        s.enemies.some((e) => ENEMIES[e.kind].boss && distance(e, p) < 450) ||
          s.enemies.length > 70,
      ],
    };
  }
}
