/** Development-only harness, excluded from the production Vite entry. */
import Phaser from "phaser";
import { GameScene } from "../src/render/scene";
import { createRun } from "../src/core/create";
import { World } from "../src/core/world";
import { spawn } from "../src/core/director";
import { DEFAULT_SETTINGS } from "../src/services/storage";
import type { MapId } from "../src/data/maps";
const q = new URLSearchParams(location.search);
const map = (q.get("map") || "forest") as MapId;
const dense = q.has("dense");
const scene = new GameScene();
scene.settings = {
  ...DEFAULT_SETTINGS,
  quality: q.has("low") ? "low" : "high",
  shake: false,
};
const s = createRun("endless", "mage", 190, "fire", "ward", map);
s.time = 600;
s.player.shield = 100;
s.player.weapons = { bow: 3, blade: 3, ember: 3, orbit: 3, drone: 3 };
const w = new World(s);
for (let i = 0; i < (dense ? 300 : 18); i++) {
  const a = i * 2.39996,
    r = 110 + (i % 19) * 19;
  const e = spawn(
    w,
    (
      [
        "crawler",
        "archer",
        "fairy",
        "protector",
        "ghost",
        "mirror",
        "crab",
      ] as const
    )[i % 7],
    { x: 1800 + Math.cos(a) * r, y: 1800 + Math.sin(a) * r },
    i % 7 === 0,
  );
  if (e) {
    e.timer = 99;
    e.hit = i % 5 === 0 ? 0.1 : 0;
  }
}
for (let i = 0; i < (dense ? 700 : 24); i++) {
  const a = i * 2.3,
    r = 90 + (i % 29) * 12;
  w.shoot(
    { x: 1800 + Math.cos(a) * r, y: 1800 + Math.sin(a) * r },
    { x: Math.cos(a), y: Math.sin(a) },
    10,
    i % 3 === 0
      ? "enemy"
      : (["bow", "ember", "drone", "lance"] as const)[i % 4],
    "bow",
    i % 3 === 0,
    { life: 5 },
  );
}
for (const [i, kind] of ["fire", "ice", "ward", "bloom", "storm"].entries()) {
  const a = i * 1.25;
  w.zone(
    { x: 1800 + Math.cos(a) * 170, y: 1800 + Math.sin(a) * 170 },
    65,
    10,
    kind,
    false,
    i === 0 ? 0.5 : 0,
    3,
    kind,
  );
}
for (let i = 0; i < (dense ? 18 : 4); i++) {
  const a = i * 1.4;
  const z = w.zone(
    { x: 1800 + Math.cos(a) * 240, y: 1800 + Math.sin(a) * 240 },
    i % 2 ? 24 : 60,
    10,
    "bossShape",
    true,
    i % 2 ? 0.7 : 0,
    3,
    (["warden", "crystalQueen", "candyWitch", "eclipseSaint"] as const)[i % 4],
  );
  if (z && i % 2)
    z.shape = {
      kind: "bar",
      angle: a,
      length: 240,
      halfAngle: 0.6,
      omega: 0,
      vx: 0,
      vy: 0,
      owner: 0,
    };
}
for (let i = 0; i < (dense ? 70 : 10); i++)
  w.effect(
    { x: 1650 + (i % 10) * 32, y: 1700 + Math.floor(i / 10) * 35 },
    ["fire", "ice", "slash", "hurt", "heal", "critical", "portal"][i % 7],
    30,
  );
const frames: number[] = [],
  draws: number[] = [];
let measuring = false;
const update = scene.update.bind(scene);
scene.update = (time, delta) => {
  const start = performance.now();
  update(time, delta);
  if (measuring) {
    frames.push(delta);
    draws.push(performance.now() - start);
  }
};
scene.onReady = () => {
  scene.setWorld(w);
  scene.showWorld = true;
  scene.paused = true;
};
scene.onFrame = () => {
  s.time += 1 / 60;
  scene.needsPaint = true;
};
const game = new Phaser.Game({
  type: Phaser.CANVAS,
  parent: "game",
  width: innerWidth,
  height: innerHeight,
  scene: [scene],
  audio: { noAudio: true },
  banner: false,
  render: { antialias: true },
  fps: { target: 60, smoothStep: false },
});
(window as any).vfxHarness = {
  scene,
  w,
  game,
  start() {
    frames.length = draws.length = 0;
    measuring = true;
  },
  stop() {
    measuring = false;
    const mean = (xs: number[]) =>
      xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
    return {
      map,
      dense,
      viewport: [innerWidth, innerHeight],
      frames: frames.length,
      fps: 1000 / mean(frames),
      drawMs: mean(draws),
      enemies: s.enemies.length,
      bullets: s.bullets.length,
      zones: s.zones.length,
      sprites: (scene as any).sprites.length,
      heap: (performance as any).memory?.usedJSHeapSize ?? null,
    };
  },
};
