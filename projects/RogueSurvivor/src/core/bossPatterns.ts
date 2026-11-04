/** Three-slot attack cadence. Delayed projectiles and shapes live in the run,
 * so pauses, death and restoration share the existing simulation clock. */
import type { Combat } from "./combat";
import type { Enemy, Vec, Zone } from "./types";
import { bossAttackInterval } from "../data/content";
import { ENEMY_RULES } from "../data/enemies";
import { unit, move } from "./math";
import { behavior } from "./creatureAI";
export const BOSS_MOVES: Record<string, readonly string[]> = {
  warden: ["缺口根围", "藤蔓横扫", "交错根墙"],
  witch: ["旋转螺旋", "多轮扇射", "延迟锁定"],
  titan: ["连续冲锋", "扩散冲击波", "定向裂缝"],
  crystalQueen: ["水晶连锁", "旋转光束", "交叉折射"],
  candyWitch: ["甜苦召唤", "弹跳糖果", "移动糖果陷阱"],
  eclipseSaint: ["安全通道", "月牙弧阵", "旋转月蚀扇"],
  mirrorMaiden: ["武器复制", "镜像齐射", "对称夹击"],
};
function shot(
  c: Combat,
  e: Enemy,
  p: Vec,
  a: number,
  delay = 0,
  track = 0,
  turn = 0,
  bounces = 0,
) {
  c.shoot(
    p,
    { x: Math.cos(a), y: Math.sin(a) },
    e.damage,
    "enemy",
    e.kind,
    true,
    {
      life: 5,
      motion: { wait: delay, track, turn, bounces, bounceIn: 0.8, owner: e.id },
    },
  );
}
function shape(
  c: Combat,
  e: Enemy,
  p: Vec,
  kind: "bar" | "fan",
  a: number,
  r: number,
  length = 500,
  delay = 0.8,
  omega = 0,
  vx = 0,
  vy = 0,
  life = 0.4,
) {
  const z = c.zone(
    { ...p },
    r,
    e.damage,
    "bossShape",
    true,
    delay,
    life,
    e.kind,
  );
  if (z)
    z.shape = {
      kind,
      angle: a,
      length,
      halfAngle: Math.PI / 4,
      omega,
      vx,
      vy,
      owner: e.id,
    };
  return z;
}
function fan(c: Combat, e: Enemy, a: number, delay = 0) {
  for (let row = 0; row < 3; row++)
    for (let i = -3; i <= 3; i++)
      shot(c, e, e, a + i * 0.15 + (row - 1) * 0.06, delay + row * 0.18);
}
export function bossPatterns(
  c: Combat,
  e: Enemy,
  dt: number,
  legacy?: () => void,
  decrement = true,
) {
  if (e.hp <= 0) return;
  const p = c.s.player,
    second = e.hp / e.maxHp < ENEMY_RULES.bossPhaseHp;
  if (decrement && e.charge) {
    e.dashPattern ??= {
      wait: Math.max(0, Math.min(1, e.timer)),
      time: 0.42,
      left: 1,
      dx: e.charge.x,
      dy: e.charge.y,
    };
    e.charge = null;
  }
  if (decrement) e.timer -= dt;
  // Preserve the queen's destructible-node cancellation/detonation state machine
  // even while another slot is playing. The legacy handler checks its own timer.
  if (legacy && e.kind === "crystalQueen" && behavior(e).target && e.timer > 0)
    legacy();
  const speed = e.speed * (e.slow > 0 ? 0.48 : 1);
  const n = unit(p.x - e.x, p.y - e.y),
    a = Math.atan2(n.y, n.x);
  if (e.dashPattern) {
    const d = e.dashPattern;
    if (d.wait > 0) d.wait -= dt;
    else if (d.time > 0) {
      move(e, d.dx * speed * 4 * dt, d.dy * speed * 4 * dt, e.r, c.s.rocks);
      d.time -= dt;
    } else if (--d.left > 0) {
      d.wait = 0.65;
      d.time = 0.42;
    } else delete e.dashPattern;
  }
  if (e.timer <= 0) {
    c.sound("warning");
    const mode = e.phase % 3;
    if (legacy && mode === 0) legacy();
    else {
      e.phase++;
      e.timer = bossAttackInterval(c.s.time, second);
      switch (e.kind) {
        case "warden":
          if (mode === 0)
            for (let i = 2; i < 14; i++) {
              const theta = (i * Math.PI) / 8;
              const z = shape(
                c,
                e,
                {
                  x: p.x + Math.cos(theta) * 230,
                  y: p.y + Math.sin(theta) * 230,
                },
                "bar",
                theta + Math.PI / 2,
                16,
                85,
                1.0,
                0,
                -Math.cos(theta) * 45,
                -Math.sin(theta) * 45,
                1.2,
              );
            }
          else if (mode === 1) shape(c, e, e, "fan", a, 330);
          else
            for (let row = -1; row <= 1; row++)
              for (const side of [-1, 1])
                shape(
                  c,
                  e,
                  { x: p.x + side * 225, y: p.y + row * 140 },
                  "bar",
                  row % 2 ? 0.3 : 0,
                  18,
                  260,
                  0.8 + Math.abs(row) * 0.15,
                );
          if (second && mode !== 1) shape(c, e, e, "fan", a, 300, 500, 1.1);
          break;
        case "witch":
          if (mode === 0)
            for (let row = 0; row < 5; row++)
              for (let i = 0; i < 5; i++)
                shot(
                  c,
                  e,
                  e,
                  (i * Math.PI * 2) / 5 + row * 0.23,
                  row * 0.12,
                  0,
                  0.38,
                );
          else if (mode === 1) fan(c, e, a);
          else
            for (let i = -2; i <= 2; i++) shot(c, e, e, a + i * 0.3, 0.65, 0.9);
          if (second && mode !== 1) fan(c, e, a, 0.35);
          break;
        case "titan":
          if (mode === 0) {
            if (!e.dashPattern)
              e.dashPattern = {
                wait: 0.8,
                time: 0.42,
                left: 2,
                dx: n.x,
                dy: n.y,
              };
            // Fixed locks; a moving bar is the telegraphed body-sized impact corridor.
            for (let i = 0; i < 2; i++)
              shape(
                c,
                e,
                { x: e.x + n.x * i * 250, y: e.y + n.y * i * 250 },
                "bar",
                a,
                e.r,
                170,
                0.8 + i * 0.55,
                0,
                n.x * 500,
                n.y * 500,
                0.5,
              );
          } else if (mode === 1)
            for (let i = 0; i < 3; i++)
              shape(
                c,
                e,
                e,
                "fan",
                a,
                180 + i * 90,
                500,
                0.7 + i * 0.2,
                0,
                0,
                0,
                0.25,
              );
          else
            for (let i = -1; i <= 1; i++)
              shape(
                c,
                e,
                { x: p.x + i * 150, y: p.y },
                "bar",
                a + i * 0.5,
                20,
                650,
                0.9 + Math.abs(i) * 0.2,
              );
          if (second && mode === 0)
            shape(
              c,
              e,
              { x: e.x + n.x * 500, y: e.y + n.y * 500 },
              "fan",
              a,
              300,
              500,
              1.8,
            );
          break;
        case "crystalQueen":
          for (const angle of mode === 1 ? [a] : [a, a + Math.PI / 2])
            shape(
              c,
              e,
              e,
              "bar",
              angle,
              20,
              1000,
              1,
              mode === 1 ? 0.45 : 0,
              0,
              0,
              1.2,
            );
          if (second) shape(c, e, p, "bar", a + 0.8, 18, 600, 1.4);
          break;
        case "candyWitch":
          if (mode === 1)
            for (let i = -4; i <= 4; i++)
              shot(c, e, e, a + i * 0.25, 0.35, 0, 0, 2);
          else
            for (let i = -1; i <= 1; i++)
              shape(
                c,
                e,
                { x: p.x + i * 140, y: p.y - 200 },
                "bar",
                Math.PI / 2,
                30,
                90,
                0.9 + i * 0.1,
                0,
                0,
                65,
                2,
              );
          if (second && mode === 1)
            shape(
              c,
              e,
              { x: p.x - 180, y: p.y },
              "bar",
              0,
              30,
              100,
              1,
              0,
              90,
              0,
              2,
            );
          break;
        case "eclipseSaint":
          if (mode === 1)
            for (let i = -6; i <= 6; i++) {
              const angle = a + i * 0.15;
              shot(
                c,
                e,
                {
                  x: e.x + Math.cos(angle) * 75,
                  y: e.y + Math.sin(angle) * 75,
                },
                angle,
                0.3,
                0,
                0.18,
              );
            }
          else shape(c, e, { ...p }, "fan", a, 260, 500, 0.9, 0.7, 0, 0, 1.5);
          if (second && mode === 2) fan(c, e, a, 0.3);
          break;
        case "mirrorMaiden":
          if (mode === 2) {
            for (const sign of [-1, 1])
              for (let row = -1; row <= 1; row++)
                shape(
                  c,
                  e,
                  { x: p.x + sign * 300, y: p.y + row * 150 },
                  "bar",
                  Math.PI / 2,
                  18,
                  90,
                  0.9 + Math.abs(row) * 0.15,
                  0,
                  -sign * 100,
                  0,
                  1.6,
                );
          } else
            for (const sign of [-1, 1])
              for (let i = -2; i <= 2; i++) {
                const origin = {
                  x: p.x + sign * 330,
                  y: p.y + (mode === 1 ? -160 : 160),
                };
                shot(
                  c,
                  e,
                  origin,
                  Math.atan2(p.y - origin.y, p.x - origin.x) + i * 0.12,
                  0.75 + Math.abs(i) * 0.08,
                );
              }
          if (second) shape(c, e, e, "bar", a, 18, 700, 1.1);
          break;
      }
    }
  }
  // Same bounded contact/steering rules; no new permanent terrain or economy.
  if (decrement) {
    if (!e.dashPattern) {
      let vx = n.x,
        vy = n.y;
      for (const rock of c.s.rocks)
        if (Math.hypot(e.x - rock.x, e.y - rock.y) < e.r + rock.r + 52) {
          const away = unit(e.x - rock.x, e.y - rock.y);
          if (vx * away.x + vy * away.y < 0.2) {
            const side = n.x * -away.y + n.y * away.x >= 0 ? 1 : -1;
            vx += (-away.y * side + away.x) * 1.4;
            vy += (away.x * side + away.y) * 1.4;
          }
        }
      const direction = unit(vx, vy);
      move(
        e,
        direction.x * speed * dt,
        direction.y * speed * dt,
        e.r,
        c.s.rocks,
      );
    }
    if (Math.hypot(e.x - p.x, e.y - p.y) < e.r + 16) c.hurt(e.damage);
  }
}
