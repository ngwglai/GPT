import Phaser from "phaser";
import { GameScene } from "../render/scene";
import { UPGRADES, WEAPONS, SKILLS, ENEMIES } from "../data/content";
import { artUrl } from "../data/visuals";
import { AudioEngine } from "../services/audio";
import { musicState } from "../services/musicPolicy";
import { LabSession, type LabConfig } from "./session";
import { POLICY_LABELS } from "./controller";
import { SPEEDS, type Speed, FIXED_DT } from "./clock";
import { LabHistory, recordRun, type RunRecord } from "./history";
import { DecisionOverlay } from "./overlay";
import type { Settings } from "../core/types";
import "./demo.css";
const get = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const text = (id: string, value: string) => {
  const node = get(id);
  if (node.textContent !== value) node.textContent = value;
};
const form = get<HTMLFormElement>("setup"),
  status = get<HTMLOutputElement>("status");
const button = (id: string) => get<HTMLButtonElement>(id);
const routes = get<HTMLInputElement>("show-routes"),
  details = get<HTMLDetailsElement>("decision-details");
const settings: Settings = {
  music: 0.35,
  musicEnabled: true,
  sfx: 0.35,
  quality: "high",
  shake: true,
  showStats: false,
};
const audio = new AudioEngine(settings);
let storage: Storage | undefined;
try {
  storage = window.localStorage;
} catch {}
const history = new LabHistory(storage),
  overlay = new DecisionOverlay(get<HTMLCanvasElement>("debug-layer"));
let session: LabSession | undefined,
  runId = "",
  createdAt = "",
  savedEnd = false,
  lastUi = 0,
  lastSave = 0,
  lastChoice = -1,
  lastSkill = -1,
  selectedChoice = 0,
  loadoutKey = "";
const formatTime = (seconds: number) =>
  `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0")}:${Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0")}`;
const num = (value: number) => Math.round(value).toLocaleString("zh-CN");
const cardName = (id: string) =>
  UPGRADES.find((u) => u.id === id)?.name || id.slice(0, 60);
function download(record: RunRecord) {
  const blob = new Blob([JSON.stringify(record, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `rogue-ai-${record.config.policy}-${record.config.seed}-${Math.round(record.time)}s.json`;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function save(result?: string) {
  if (!session) return;
  history.save(recordRun(session, runId, createdAt, result));
  text("history-count", String(history.records.length));
  get("storage-warning").hidden = !history.warning;
  text("storage-warning", history.warning);
}
function debugMode() {
  session?.controller.setDebug(routes.checked || details.open);
  if (!routes.checked) get("debug-layer").hidden = true;
}
class SpectatorScene extends GameScene {
  protected override advanceSimulation(delta: number) {
    if (!session || this.paused) return { dt: 0, simulated: false };
    const result = session.advance(Math.max(0, delta / 1000));
    return { dt: result.ticks * FIXED_DT, simulated: result.gameSeconds > 0 };
  }
  override update(time: number, delta: number) {
    super.update(time, delta);
    const now = performance.now();
    audio.update(
      Math.min(0.1, delta / 1000),
      musicState(
        session?.world.s,
        "game",
        session?.paused || false,
        document.hidden,
      ),
      session && ["dying", "reviving"].includes(session.world.s.phase)
        ? 0.35
        : 1,
    );
    if (!session) return;
    audio.effects(session.world.sounds);
    session.world.sounds.clear();
    if (session.world.lastSound) {
      audio.effect(session.world.lastSound);
      session.world.lastSound = "";
    }
    overlay.draw(
      session.controller.policy.debug,
      session.world.s.player,
      this.scale.width,
      this.scale.height,
      routes.checked,
    );
    if (now - lastUi >= 150) {
      renderState();
      lastUi = now;
    }
    if (session.ended && !savedEnd) {
      save();
      savedEnd = true;
      renderState();
    }
    if (now - lastSave >= 30000 && !session.ended) {
      save();
      lastSave = now;
    }
  }
}
const scene = new SpectatorScene();
scene.settings = settings;
scene.onReady = () => {
  button("start").disabled = false;
  status.value = "准备就绪 · 选择策略后开始远征";
};
new Phaser.Game({
  type: Phaser.CANVAS,
  fps: { target: 60, smoothStep: false },
  banner: false,
  parent: "game",
  width: innerWidth,
  height: innerHeight,
  backgroundColor: "#17332e",
  scene: [scene],
  render: { antialias: true, powerPreference: "high-performance" },
  audio: { noAudio: true },
});
window.addEventListener("resize", () =>
  scene.game.scale.resize(innerWidth, innerHeight),
);
function pause(value: boolean) {
  if (!session) return;
  session.paused = value;
  scene.paused = value;
  scene.needsPaint = true;
  button("pause").textContent = value ? "继续" : "暂停";
  if (!value) audio.unlock();
  renderState();
}
form.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!scene.ready || !form.reportValidity()) return;
  if (session && !session.ended) save("restarted");
  const data = new FormData(form);
  const config: LabConfig = {
    policy: data.get("policy") as LabConfig["policy"],
    character: String(data.get("character")),
    map: data.get("map") as LabConfig["map"],
    mode: data.get("mode") as LabConfig["mode"],
    seed: Number(data.get("seed")),
  };
  session = new LabSession(config);
  session.clock.speed = Number(data.get("speed")) as Speed;
  runId = Array.from(crypto.getRandomValues(new Uint32Array(4)), (n) =>
    n.toString(16),
  ).join("");
  createdAt = new Date().toISOString();
  savedEnd = false;
  lastChoice = lastSkill = -1;
  selectedChoice = 0;
  loadoutKey = "";
  lastSave = performance.now();
  scene.setWorld(session.world);
  scene.paused = false;
  scene.showWorld = true;
  for (const id of ["pause", "advance", "export"]) button(id).disabled = false;
  button("pause").textContent = "暂停";
  audio.setMap(config.map, true);
  audio.unlock();
  debugMode();
  renderState();
});
button("pause").addEventListener("click", () => pause(!session?.paused));
button("advance").addEventListener("click", () => {
  session?.queueThirtySeconds();
  scene.paused = false;
  button("pause").textContent = "暂停";
  renderState();
});
get<HTMLSelectElement>("speed").addEventListener("change", (event) => {
  const speed = Number((event.target as HTMLSelectElement).value);
  if (session && SPEEDS.some((v) => v === speed)) {
    session.fastTicks = 0;
    session.clock.speed = speed as Speed;
    session.clock.reset();
  }
});
routes.addEventListener("change", debugMode);
details.addEventListener("toggle", debugMode);
function syncSound() {
  const enabled = get<HTMLInputElement>("sound").checked;
  const volume = Number(get<HTMLInputElement>("volume").value);
  settings.musicEnabled = enabled;
  settings.music = volume;
  settings.sfx = enabled ? volume : 0;
  audio.settings = settings;
  audio.setSfxVolume(settings.sfx);
  if (enabled) audio.unlock();
}
get("sound").addEventListener("change", syncSound);
get("volume").addEventListener("input", syncSound);
button("export").addEventListener("click", () => {
  if (session) download(recordRun(session, runId, createdAt));
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) pause(true);
});
window.addEventListener("pagehide", () => {
  if (session && !savedEnd) save("interrupted");
});
function renderState() {
  if (!session) return;
  const s = session.world.s,
    p = s.player,
    c = session.controller;
  const phaseNames: Record<string, string> = {
    playing: "自主战斗",
    upgrade: "选择卡牌",
    dying: "战败演出",
    revive: "星火复活",
    reviving: "复活演出",
    victory: "标准模式通关",
    dead: "远征结束",
  };
  const action = session.paused
    ? "已暂停"
    : session.fastTicks
      ? "逐步高速模拟"
      : phaseNames[s.phase] || s.phase;
  status.value = `${action} · ${POLICY_LABELS[session.config.policy]}`;
  status.dataset.phase = s.phase;
  status.dataset.fastTicks = String(session.fastTicks);
  status.dataset.time = String(s.time);
  status.dataset.level = String(p.level);
  status.dataset.policy = c.policy.name;
  status.dataset.choices = String(c.choicesTotal);
  status.dataset.skills = String(c.skillsTotal);
  status.dataset.decisions = String(c.decisions);
  text("game-time", formatTime(s.time));
  text("wave", String(s.wave?.number || 1));
  text("health", `${num(p.hp)} / ${num(p.maxHp)}`);
  text("level", String(p.level));
  text("enemies", String(s.enemies.length));
  text("kills", `${num(s.stats.kills)} / ${s.stats.bosses}`);
  text("actual-speed", `${session.actualSpeed.toFixed(2)}×`);
  text("policy-name", POLICY_LABELS[session.config.policy]);
  text("action-state", p.dash > 0 && !session.paused ? "闪避冲刺中" : action);
  const d = c.policy.debug;
  if (d) {
    text("goal-state", `${Math.round(d.goal.x)}, ${Math.round(d.goal.y)}`);
    text("decision-time", `${d.time.toFixed(2)}s · ${c.decisions} 次`);
    const parts = { enemies: 0, bullets: 0, zones: 0, environment: 0 };
    for (const v of d.candidates)
      if (v.parts)
        for (const k of Object.keys(parts) as (keyof typeof parts)[])
          parts[k] += v.parts[k];
    const main = (Object.keys(parts) as (keyof typeof parts)[]).sort(
      (a, b) => parts[b] - parts[a],
    )[0];
    const riskNames = {
      enemies: "怪物接近",
      bullets: "敌方弹道",
      zones: "攻击预警",
      environment: "边界 / 环境",
    };
    const enemy = d.nearestEnemy;
    text(
      "threat-state",
      d.algorithm === "legacy"
        ? d.immediateDanger
          ? "近距离危险（原策略阈值）"
          : "原策略近距离检测未触发"
        : parts[main] > 0
          ? `${riskNames[main]}${enemy ? ` · 邻近${ENEMIES[enemy.kind as keyof typeof ENEMIES]?.name || enemy.kind}` : ""}`
          : "候选路线未检出明显风险",
    );
  } else {
    text("goal-state", "展开面板后采集");
    text("decision-time", `${c.decisions} 次`);
    text("threat-state", "未采集调试数据");
  }
  text(
    "performance-note",
    session.ended
      ? history.records.find((r) => r.id === runId)?.reason ||
          phaseNames[s.phase]
      : session.fastTicks
        ? `高速批次剩余 ${Math.ceil(session.fastTicks / 60)} 秒逻辑步；可随时暂停。`
        : session.clock.limited ||
            (session.actualSpeed > 0 &&
              session.actualSpeed < session.clock.speed * 0.8)
          ? `性能受限：请求 ${session.clock.speed}×，实测 ${session.actualSpeed.toFixed(2)}×。全部逻辑步仍完整执行。`
          : `请求 ${session.clock.speed}× · 实测 ${session.actualSpeed.toFixed(2)}× · AI 每0.05游戏秒决策，音乐保持正常音高。`,
  );
  button("advance").disabled = session.ended;
  button("pause").disabled = session.ended;
  const key = JSON.stringify(p.weapons);
  if (key !== loadoutKey) {
    loadoutKey = key;
    get("loadout").replaceChildren();
    for (const [id, level] of Object.entries(p.weapons)) {
      const span = document.createElement("span"),
        img = document.createElement("img");
      img.src = artUrl("weapon." + id) || "";
      img.alt = "";
      span.append(img, `${WEAPONS[id as keyof typeof WEAPONS].name} ${level}`);
      get("loadout").append(span);
    }
  }
  get("skill-bar").replaceChildren();
  p.skills.forEach((id, index) => {
    const span = document.createElement("span");
    span.textContent = `${["Q", "E", "R"][index]} ${SKILLS[id].name} ${p.cooldowns[index] > 0 ? `${p.cooldowns[index].toFixed(1)}s` : "就绪"}`;
    get("skill-bar").append(span);
  });
  if (lastChoice !== c.choicesTotal) {
    const follow = !selectedChoice || selectedChoice === lastChoice;
    lastChoice = c.choicesTotal;
    text("choice-count", `${c.choicesTotal}次 · 保留${c.choices.length}次`);
    const select = get<HTMLSelectElement>("choice-select");
    select.replaceChildren();
    for (const choice of [...c.choices].reverse()) {
      const option = document.createElement("option");
      option.value = String(choice.sequence);
      option.textContent = `#${choice.sequence} ${formatTime(choice.time)} ${choice.refreshed ? "刷新" : cardName(choice.chosen)}`;
      select.append(option);
    }
    if (follow || !c.choices.some((v) => v.sequence === selectedChoice))
      selectedChoice = c.choices.at(-1)?.sequence || 0;
    select.value = String(selectedChoice);
    renderChoice();
    get("choices").replaceChildren();
    for (const choice of c.choices.slice(-12).reverse()) {
      const li = document.createElement("li");
      li.textContent = `${formatTime(choice.time)} · ${choice.refreshed ? "合法刷新" : cardName(choice.chosen)}`;
      get("choices").append(li);
    }
  }
  if (lastSkill !== c.skillsTotal) {
    lastSkill = c.skillsTotal;
    text("skill-count", `${c.skillsTotal}次 · 保留${c.skills.length}次`);
    get("skill-log").replaceChildren();
    for (const e of c.skills.slice(-20).reverse()) {
      const li = document.createElement("li");
      li.textContent = `${formatTime(e.time)} · ${SKILLS[e.skill as keyof typeof SKILLS]?.name || e.skill} → (${Math.round(e.target.x)}, ${Math.round(e.target.y)})`;
      get("skill-log").append(li);
    }
  }
}
function renderChoice() {
  const choice = session?.controller.choices.find(
    (c) => c.sequence === selectedChoice,
  );
  const body = get<HTMLTableElement>("card-scores").tBodies[0];
  body.replaceChildren();
  if (!choice) {
    body.dataset.sequence = "";
    text("choice-result", "升级时自动展示真实评分");
    return;
  }
  text(
    "choice-result",
    choice.refreshed
      ? `#${choice.sequence} 已消耗合法刷新次数`
      : `#${choice.sequence} 最终选择：${cardName(choice.chosen)} · ${choice.kind === "negative" ? "强制负面选择" : "正面选择"}`,
  );
  body.dataset.sequence = String(choice.sequence);
  for (const id of choice.offered) {
    const row = document.createElement("tr"),
      score = choice.scores.find((v) => v.id === id);
    row.dataset.card = id;
    row.dataset.score = String(score?.score ?? "");
    row.className = id === choice.chosen ? "selected" : "";
    for (const value of [
      cardName(id),
      score ? score.score.toFixed(4) : "—",
      id === choice.chosen ? "已选择" : "",
    ]) {
      const cell = document.createElement("td");
      cell.textContent = value;
      row.append(cell);
    }
    if (score) row.title = score.reason;
    body.append(row);
  }
}
get("choice-select").addEventListener("change", (event) => {
  selectedChoice = Number((event.target as HTMLSelectElement).value);
  renderChoice();
});
button("history-open").addEventListener("click", () => {
  if (session && !savedEnd) save();
  const list = get("history-list");
  list.replaceChildren();
  for (const r of [...history.records].reverse()) {
    const article = document.createElement("article");
    article.className = "history-card";
    const h = document.createElement("h3");
    h.textContent = `${POLICY_LABELS[r.config.policy]} · ${r.config.map} / ${r.config.character} · 种子 ${r.config.seed}`;
    article.append(h);
    for (const value of [
      r.reason,
      `${formatTime(r.time)} · 波次${r.wave} · 等级${r.level} · 击杀${num(r.kills)} · Boss ${r.bosses}`,
      `累计输出 ${num(r.damage)} · 承受伤害 ${num(r.taken)} · 选择 ${r.totals.choices}次`,
    ]) {
      const p = document.createElement("p");
      p.textContent = value;
      article.append(p);
    }
    const detail = document.createElement("details"),
      summary = document.createElement("summary"),
      pre = document.createElement("pre");
    summary.textContent = "最终武器与卡牌";
    pre.textContent =
      Object.entries(r.build.weapons)
        .map(
          ([id, n]) =>
            `${WEAPONS[id as keyof typeof WEAPONS]?.name || id} Lv.${n}`,
        )
        .join("、") +
      "\n" +
      Object.entries(r.build.upgrades)
        .map(([id, n]) => `${cardName(id)} ×${n}`)
        .join("、");
    detail.append(summary, pre);
    article.append(detail);
    const exportButton = document.createElement("button");
    exportButton.textContent = "导出此局 JSON";
    exportButton.addEventListener("click", () => download(r));
    article.append(exportButton);
    list.append(article);
  }
  if (!history.records.length) {
    const p = document.createElement("p");
    p.textContent = "暂无AI记录，开始一场远征吧。";
    list.append(p);
  }
  get<HTMLDialogElement>("history-dialog").showModal();
});
button("history-close").addEventListener("click", () =>
  get<HTMLDialogElement>("history-dialog").close(),
);
text("history-count", String(history.records.length));
get("storage-warning").hidden = !history.warning;
text("storage-warning", history.warning);
