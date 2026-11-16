import Phaser from "phaser";
import { GameScene } from "../render/scene";
import { World } from "../core/world";
import { createRun } from "../core/create";
import { UPGRADES } from "../data/content";
import { AIController, createPolicy, type PolicyId } from "./controller";
import type { MapId } from "../data/maps";
import type { Mode } from "../core/types";
import "./demo.css";
const form = document.querySelector<HTMLFormElement>("#setup")!;
const status = document.querySelector<HTMLOutputElement>("#status")!;
const list = document.querySelector<HTMLOListElement>("#choices")!;
let controller: AIController | undefined,
  rendered = 0;
class SpectatorScene extends GameScene {
  override inputState() {
    return controller!.input(this.world!);
  }
  override update(time: number, delta: number) {
    if (this.world && !this.paused && controller) controller.manage(this.world);
    super.update(time, delta);
    if (!this.world || !controller) return;
    const s = this.world.s;
    status.value = `${s.phase} · ${s.time.toFixed(1)} 秒 · 第 ${s.wave?.number} 波 · 等级 ${s.player.level} · 生命 ${Math.ceil(s.player.hp)}/${Math.ceil(s.player.maxHp)} · 击杀 ${s.stats.kills} · Boss ${s.stats.bosses}`;
    status.dataset.phase = s.phase;
    status.dataset.time = String(s.time);
    status.dataset.level = String(s.player.level);
    status.dataset.policy = controller.policy.name;
    while (rendered < controller.choices.length) {
      const c = controller.choices[rendered++],
        li = document.createElement("li");
      li.textContent = `${c.time.toFixed(1)} 秒：${UPGRADES.find((u) => u.id === c.chosen)?.name || c.chosen}`;
      list.appendChild(li);
    }
  }
}
const scene = new SpectatorScene();
scene.settings = {
  music: 0,
  sfx: 0,
  quality: "high",
  shake: true,
  showStats: false,
};
new Phaser.Game({
  type: Phaser.CANVAS,
  fps: { target: 60, smoothStep: false },
  banner: false,
  parent: "game",
  width: window.innerWidth,
  height: window.innerHeight,
  backgroundColor: "#122c2a",
  scene: [scene],
  render: { antialias: true },
  audio: { noAudio: true },
});
window.addEventListener("resize", () =>
  scene.game.scale.resize(window.innerWidth, window.innerHeight),
);
form.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!scene.ready || !form.reportValidity()) return;
  const data = new FormData(form),
    character = String(data.get("character"));
  controller = new AIController(createPolicy(data.get("policy") as PolicyId));
  scene.setWorld(
    new World(
      createRun(
        data.get("mode") as Mode,
        character,
        Number(data.get("seed")),
        character === "knight" ? "ice" : "fire",
        "bloom",
        data.get("map") as MapId,
      ),
    ),
  );
  scene.showWorld = true;
  scene.paused = false;
  rendered = 0;
  list.replaceChildren();
  document.querySelector("#pause")!.textContent = "暂停";
});
document.querySelector("#pause")!.addEventListener("click", (event) => {
  scene.paused = !scene.paused;
  (event.target as HTMLButtonElement).textContent = scene.paused
    ? "继续"
    : "暂停";
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    scene.paused = true;
    document.querySelector("#pause")!.textContent = "继续";
  }
});

// Browser-side headless batch: execute every normal fixed step, then paint the result.
// This is acceleration of execution only; no game clock/state writes and no rule bypass.
document.querySelector("#advance")!.addEventListener("click", () => {
  if (!scene.world || !controller) return;
  const world = scene.world;
  for (let i = 0; i < 1800; i++) {
    controller.manage(world);
    if (["dead", "victory"].includes(world.s.phase)) break;
    if (["dying", "reviving"].includes(world.s.phase))
      world.advancePresentation(1 / 60);
    else if (world.s.phase === "playing")
      world.step(1 / 60, controller.input(world));
  }
  scene.needsPaint = true;
});
