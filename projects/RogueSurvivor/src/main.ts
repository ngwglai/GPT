import { ENEMY_RULES } from "./data/enemies";
import {
  cardBrowser,
  skillBrowser,
  enemyBrowser,
  nextEffect,
} from "./ui/cards";
import { ensureDeck } from "./core/deckState";
import { refresh } from "./core/cardPool";
import { cardDescription } from "./core/progression";
import { CURSES } from "./core/fate";
import Phaser from "phaser";
import "./ui/style.css";
import { GameScene } from "./render/scene";
import { defaultArt } from "./render/art";
import { World } from "./core/world";
import { createRun } from "./core/create";
import {
  CHARACTERS,
  ENEMIES,
  WEAPONS,
  SKILLS,
  UPGRADES,
  RARITIES,
  xpNeeded,
  LIMITS,
} from "./data/content";
import type {
  Mode,
  Run,
  SkillId,
  Settings,
  Profile,
  WeaponId,
} from "./core/types";
import {
  loadRun,
  saveRun,
  loadSettings,
  loadProfile,
  write,
} from "./services/storage";
import {
  ASSET_IDS,
  assetPack,
  loadAssets,
  fromFile,
  validateAsset,
  persistAssets,
  importPack,
  download,
} from "./services/assets";
import { AudioEngine } from "./services/audio";
const app = document.querySelector<HTMLDivElement>("#app")!,
  toast = document.querySelector<HTMLDivElement>("#toast")!;
let settings: Settings,
  profile: Profile,
  audio: AudioEngine,
  world: World | undefined,
  saved: Run | undefined,
  saveError = "",
  screen = "home",
  mode: Mode = "standard",
  character = "ranger",
  primary: SkillId = "fire",
  secondary: SkillId = "ward",
  lastPhase = "",
  lastSave = 0,
  hudTimer = 0,
  toastTimer = 0,
  returnScreen = "home",
  assetId = "player.ranger",
  busy = false;
const scene = new GameScene();
const esc = (v: string) =>
  v.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const time = (s: number) =>
  `${Math.floor(s / 60)
    .toString()
    .padStart(2, "0")}:${Math.floor(s % 60)
    .toString()
    .padStart(2, "0")}`;
const artCache = new Map<string, string>();
function art(id: string) {
  if (assetPack.assets[id]) return assetPack.assets[id].data;
  if (!artCache.has(id)) artCache.set(id, defaultArt(id).toDataURL());
  return artCache.get(id)!;
}
const img = (id: string, cls = "icon") =>
  `<img class="${cls}" src="${art(id)}" alt="">`;
const button = (action: string, label: string, cls = "", extra = "") =>
  `<button data-action="${action}" class="${cls}" ${extra}>${label}</button>`;
function notify(message: string) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("show"), 4500);
}
function header() {
  return `<header><a href="#" data-action="home" class="brand"><span class="brand-star">✦</span><span>星烬远征<small>ROGUE SURVIVOR</small></span></a><nav>${button("codex", "远征图鉴")}${button("records", "远征记录")}${button("assets", "资源工坊")}${button("settings", "设置", "nav-setting")}</nav><span class="version">离线单人 · v1.2</span></header>`;
}
function shell(content: string, cls = "") {
  scene.showWorld = false;
  app.innerHTML = `<div class="shell ${cls}">${header()}${content}<footer><span>✧ 一片星林，无数种可能。</span><span>无需账号 · 进度保存在此浏览器</span></footer></div>`;
  panelArt();
}
function panelArt() {
  document.documentElement.style.setProperty(
    "--panel-image",
    assetPack.assets["ui.panel"]
      ? `url("${assetPack.assets["ui.panel"].data}")`
      : "none",
  );
}
function home() {
  screen = "home";
  scene.paused = true;
  world = undefined;
  const demo = new World(createRun("standard"));
  demo.s.player.x = 1800;
  demo.s.player.y = 1800;
  scene.setWorld(demo);
  shell(
    `<main class="landing"><section class="hero-copy"><div class="eyebrow"><span></span> 俯视角动作 · 随机构筑 · 无尽生存</div><h1>于星烬中<br>再赴<span>远征。</span></h1><p class="intro">星光坠入古老森林，沉睡的异兽正在苏醒。<br>握紧武器，组合你的力量，在怪潮中开辟自己的路。</p><div class="mode-grid"><button data-action="mode-standard" class="mode-card ${mode === "standard" ? "selected" : ""}"><span class="mode-symbol">◈</span><span><b>星林远征</b><small>标准模式 · 20 分钟最终战</small></span><i>${mode === "standard" ? "●" : "○"}</i></button><button data-action="mode-endless" class="mode-card ${mode === "endless" ? "selected" : ""}"><span class="mode-symbol">∞</span><span><b>无尽星夜</b><small>无尽模式 · 挑战生存纪录</small></span><i>${mode === "endless" ? "●" : "○"}</i></button></div><div class="start-row">${button("select", "开启远征 <span>↗</span>", "primary start")}${saved && ["playing", "upgrade"].includes(saved.phase) ? button("continue", `继续旅程 <small>${time(saved.time)} · 等级 ${saved.player.level}</small>`, "continue") : ""}</div>${saveError ? `<p class="error">${esc(saveError)}</p>${button("backup", "恢复上次备份", "text-button")}` : ""}<div class="controls-line"><kbd>W A S D</kbd> 移动 <span>·</span> <kbd>Q E R</kbd> 技能 <span>·</span> <kbd>空格</kbd> 闪避</div></section><section class="hero-art" aria-label="逐星游侠探索星林的矢量插画"><div class="orbit o1"></div><div class="orbit o2"></div><div class="moon">✧</div><div class="star s1">✦</div><div class="star s2">✧</div><div class="star s3">✦</div><svg class="landscape" viewBox="0 0 600 500" aria-hidden="true"><ellipse cx="300" cy="350" rx="245" ry="110" fill="#173c37"/><ellipse cx="300" cy="346" rx="211" ry="92" fill="#285244"/><path d="M90 340 172 293 289 360 403 307 527 355 417 415 263 435 123 391Z" fill="#39644d"/><path d="m98 300 20-145 29 134m-18 19 42-201 40 192m273 11-29-161-36 171m60-4 29-208 30 231" fill="#20483e" stroke="#4d7957" stroke-width="3"/><path d="m165 365 87-36 120 72" fill="none" stroke="#739374" stroke-width="8" opacity=".25"/><g fill="#a4d5a6"><circle cx="97" cy="351" r="3"/><circle cx="433" cy="389" r="3"/><circle cx="337" cy="330" r="3"/></g></svg>${img("player.ranger", "hero-ranger")}${img("enemy.crawler", "hero-enemy enemy-a")}${img("enemy.archer", "hero-enemy enemy-b")}${img("map.rock", "hero-rock")}${img("map.flower", "hero-flower")}<div class="art-label"><span class="live-dot"></span> 第一章 · 微光之森<small>在黑夜降临之前，找到属于你的星光。</small></div></section></main><section class="home-bottom"><div><span>01 / 自由战斗</span><b>自动出击，专注走位</b></div><div><span>02 / 随机构筑</span><b>每一次升级，新的可能</b></div><div><span>03 / 无尽挑战</span><b>活得更久，走得更远</b></div><div class="best"><small>最长生存纪录</small><strong>${time(profile.best)}</strong></div></section>`,
    "home",
  );
}
function selection() {
  screen = "select";
  shell(
    `<main class="page"><div class="page-heading"><div><div class="eyebrow">准备出发 / ${mode === "standard" ? "星林远征" : "无尽星夜"}</div><h2>选择你的行路人</h2><p>武器自动攻击。主动技能与闪避的时机，由你决定。</p></div>${button("home", "← 返回", "subtle")}</div><div class="character-grid">${CHARACTERS.map((c) => `<button data-action="character-${c.id}" class="character-card ${character === c.id ? "selected" : ""}"><div class="portrait">${img("player." + c.id, "portrait-img")}<span>${character === c.id ? "已选择" : "选择角色"}</span></div><small>${c.role}</small><h3>${c.name}</h3><p>${c.desc}</p><div class="character-meta">生命 ${c.hp}<span>初始 · ${WEAPONS[c.weapon].name}</span></div></button>`).join("")}</div><div class="loadout"><div><label for="primary-skill">Q · 主动攻击</label><select id="primary-skill">${(["fire", "ice", "lance"] as SkillId[]).map((k) => `<option value="${k}" ${primary === k ? "selected" : ""}>${SKILLS[k].name} — ${SKILLS[k].desc}</option>`).join("")}</select></div><div><label for="secondary-skill">E · 生存技能</label><select id="secondary-skill">${(["ward", "bloom"] as SkillId[]).map((k) => `<option value="${k}" ${secondary === k ? "selected" : ""}>${SKILLS[k].name} — ${SKILLS[k].desc}</option>`).join("")}</select></div><div class="ultimate">${img("skill.storm")}<span><b>R · 星落终章</b><small>大范围连环星爆 · 清除弹幕</small></span></div></div><div class="launch-row"><p>${saved && ["playing", "upgrade"].includes(saved.phase) ? "开始新远征将替换当前继续存档，并保留一份备份。" : "推荐佩戴耳机。按 ESC 可随时暂停、设置与保存。"}</p>${button("launch", "踏入星林 →", "primary")}</div></main>`,
  );
}
function hud() {
  scene.showWorld = true;
  scene.needsPaint = true;
  screen = "game";
  app.innerHTML = `<div class="hud"><div class="hud-top"><div class="player-hud">${img("player." + world!.s.character)}<div><div class="player-name">${CHARACTERS.find((c) => c.id === world!.s.character)!.name} <span id="level"></span></div><div class="health"><div id="health-fill"></div><span id="health-label"></span></div><small id="shield"></small></div></div><div class="run-clock"><b id="clock">00:00</b><span>${world!.s.mode === "standard" ? "星林远征" : "无尽星夜"}</span></div><div class="hud-actions"><span id="kills"></span>${button("build", "当前构筑", "hud-button")}${button("pause", "Ⅱ 暂停", "hud-button")}</div></div><div class="xp"><div id="xp-fill"></div></div><div id="boss-hud"></div><div id="event"></div><div class="hud-bottom"><div id="weapons" class="weapon-hud"></div><div class="skills">${world!.s.player.skills.map((id, i) => `<div class="skill-slot" title="${SKILLS[id].desc}">${img("skill." + id)}<div class="cooldown-shade" id="shade-${i}"></div><kbd>${["Q", "E", "R"][i]}</kbd><b id="cd-${i}"></b><span>${SKILLS[id].name}</span></div>`).join("")}<div class="skill-slot dash-slot"><span class="dash-icon">➶</span><kbd>空格</kbd><b id="dash-cd"></b><span>闪避</span></div></div><div class="hint">鼠标瞄准 · 自动攻击<br><span id="budget"></span></div></div><div id="performance"></div></div>`;
  updateHud();
}
function updateHud() {
  if (!world || screen !== "game") return;
  const s = world.s,
    p = s.player;
  const set = (id: string, text: string) => {
    document.getElementById(id)!.textContent = text;
  };
  set("level", `等级 ${p.level}`);
  set(
    "health-label",
    `${Math.round(p.hp * 10) / 10} / ${Math.round(p.maxHp * 10) / 10}`,
  );
  set("shield", p.shield > 0 ? `◈ 护盾 ${Math.ceil(p.shield)}` : "生命");
  document.getElementById("health-fill")!.style.width =
    `${(p.hp / p.maxHp) * 100}%`;
  document.getElementById("xp-fill")!.style.width =
    `${Math.min(100, (p.xp / xpNeeded(p.level)) * 100)}%`;
  set("clock", time(s.time));
  set(
    "kills",
    `✧ 击败 ${s.stats.kills} · 待领 +${ensureDeck(s).pending.positive} / −${ensureDeck(s).pending.negative}`,
  );
  p.cooldowns.forEach((cd, i) => {
    set("cd-" + i, cd > 0.05 ? cd.toFixed(1) : "");
    document.getElementById("shade-" + i)!.style.height =
      `${Math.min(100, (cd / (SKILLS[p.skills[i]].cooldown * p.cooldown)) * 100)}%`;
  });
  set("dash-cd", p.dashCd > 0 ? p.dashCd.toFixed(1) : "");
  set(
    "event",
    (s.time < s.eventUntil ? s.event : "") +
      (s.time < (s.fate?.noticeUntil || 0) ? " · " + s.fate!.log.at(-1) : "") +
      Object.entries(s.fate?.curses || {})
        .filter(([, n]) => n)
        .map(
          ([k, n]) =>
            ` · ${CURSES[k as keyof typeof CURSES].name}×${n}（${CURSES[k as keyof typeof CURSES].desc}）`,
        )
        .join(""),
  );
  set(
    "budget",
    s.enemies.length >= LIMITS.enemies - 3
      ? "怪潮密集：新增敌人暂缓入场"
      : s.enemies.length > 110 || s.bullets.length > 220
        ? "高密度战斗：自动精简特效"
        : "每 30 秒自动保存",
  );
  document.getElementById("weapons")!.innerHTML = Object.entries(p.weapons)
    .map(
      ([k, lv]) =>
        `<div title="${WEAPONS[k as WeaponId].name}">${img("weapon." + k)}<span>${lv === 5 ? "✦ 进化" : "★".repeat(lv)}</span></div>`,
    )
    .join("");
  const boss = s.enemies.find((e) => ENEMIES[e.kind].boss);
  document.getElementById("boss-hud")!.innerHTML = boss
    ? `<div class="boss-name">${ENEMIES[boss.kind].name} <small>${boss.hp / boss.maxHp < ENEMY_RULES.bossPhaseHp ? "狂暴阶段" : "第一阶段"}</small></div><div class="boss-bar"><i style="width:${Math.max(0, (boss.hp / boss.maxHp) * 100)}%"></i></div>`
    : "";
  set(
    "performance",
    settings.showStats
      ? `FPS ${Math.round(scene.game.loop.actualFps)} ｜ 敌人 ${s.enemies.length}/${LIMITS.enemies} ｜ 弹道 ${s.bullets.length}/${LIMITS.bullets} ｜ 特效 ${world.effects.length} ｜ ${settings.quality === "low" ? "简约画面" : "完整画面"}`
      : "",
  );
}
function modal(content: string, cls = "") {
  app.insertAdjacentHTML(
    "beforeend",
    `<div class="overlay"><section class="dialog ${cls}" role="dialog" aria-modal="true">${content}</section></div>`,
  );
  scene.paused = true;
  document.querySelector(".hud")?.setAttribute("inert", "");
  document.querySelector<HTMLButtonElement>(".dialog button")?.focus();
  document.querySelector(".hud")?.setAttribute("aria-hidden", "true");
}
function pause() {
  if (!world || screen !== "game") return;
  screen = "pause";
  modal(
    `<div class="eyebrow">呼吸片刻，再向前</div><h2>远征已暂停</h2><p>你的旅程停留在 ${time(world.s.time)}。怪物与冷却也已暂停。</p><p>${
      Object.entries(world.s.fate?.curses || {})
        .filter(([, n]) => n)
        .map(
          ([k, n]) =>
            `${CURSES[k as keyof typeof CURSES].name}×${n}：${CURSES[k as keyof typeof CURSES].desc}`,
        )
        .join("；") || "当前没有诅咒"
    }</p><p>${world.s.fate?.log.join("<br>") || "尚无奇遇记录"}</p><div class="pause-actions">${button("resume", "继续远征", "primary")}${button("save", "保存当前进度")}${button("build", "当前构筑")}${button("codex", "远征图鉴")}${button("settings", "游戏设置")}${button("assets", "资源工坊")}${button("save-home", "保存并返回营地", "subtle")}</div><div class="help"><b>行路指南</b><p>WASD 移动 · Q / E / R 技能 · 空格闪避<br>鼠标指定落点或方向 · 1 / 2 / 3 选择升级<br>躲开红色预警；拾取绿色星晶升级。<br>金色+牌：额外正面抽卡；紫色−牌：强制负面三选一。<br>第 5、10、15 分钟迎战首领，第 20 分钟迎来最终战。</p></div>`,
    "small",
  );
  void saveCurrent(false);
}
function upgrade() {
  if (!world) return;
  hud();
  screen = "upgrade";
  audio.effect("level");
  modal(
    `<div class="eyebrow">星光回应了你 / 等级 ${world.s.player.level}</div><h2>${ensureDeck(world.s).active === "negative" ? "选择一项负面命运" : "选择一份馈赠"}</h2><p>${ensureDeck(world.s).active === "negative" ? "纯负面奖励：必须选择一项，普通刷新不可用。" : "三选一。让这次远征，走向不同的可能。"}</p><div class="upgrade-grid">${world.s.choices
      .map((id, i) => {
        const u = UPGRADES.find((x) => x.id === id)!;
        return `<button class="upgrade-card rarity-${u.rarity} polarity-${u.polarity}" data-action="upgrade-${id}"><div class="rarity">${RARITIES[u.rarity]} <kbd>${i + 1}</kbd></div>${u.weapon ? img("weapon." + u.weapon, "reward-icon") : '<div class="reward-symbol">✧</div>'}<h3>${u.name}</h3><p>${cardDescription(world!.s, id)} ${nextEffect(world!.s, id)}</p><small>当前 ${world!.s.player.upgrades[id] || 0} / ${u.maxStacks === null ? "∞" : u.max}</small></button>`;
      })
      .join(
        "",
      )}</div><div class="draw-toolbar">${button("refresh", `刷新 · 剩余 ${ensureDeck(world.s).refreshes} 次`, "", ensureDeck(world.s).active === "negative" || ensureDeck(world.s).refreshes < 1 ? "disabled" : "")}${button("build", "当前构筑")}</div>`,
    "wide",
  );
  void saveCurrent(false);
}
let saveRevision = 0;
async function saveCurrent(show = true) {
  if (!world) return false;
  const snapshot = structuredClone(world.s);
  const revision = ++saveRevision;
  // Hide the continue entry immediately for finished runs, even while disk writes wait.
  if (snapshot.phase === "dead" || snapshot.phase === "victory")
    saved = snapshot;
  try {
    await saveRun(snapshot);
    if (revision === saveRevision) saved = snapshot;
    saveError = "";
    if (show) notify("进度已保存，可关闭浏览器后继续。");
    return true;
  } catch (e) {
    notify((e as Error).message);
    return false;
  }
}
function start(s: Run) {
  world = new World(s);
  scene.setWorld(world);
  scene.paused = false;
  lastPhase = "playing";
  lastSave = s.time;
  hud();
  if (s.phase === "upgrade") upgrade();
  audio.unlock();
}
async function record() {
  if (!world) return;
  const s = world.s;
  const terminalSave = saveCurrent(false);
  profile.best = Math.max(profile.best, s.time);
  profile.records.unshift({
    mode: s.mode,
    time: s.time,
    kills: s.stats.kills,
    level: s.player.level,
    victory: s.phase === "victory",
    date: new Date().toISOString().slice(0, 10),
    character: s.character,
  });
  profile.records = profile.records.slice(0, 30);
  if (s.stats.bosses && !profile.unlocks.includes("首领猎人"))
    profile.unlocks.push("首领猎人");
  if (s.phase === "victory" && !profile.unlocks.includes("星林守护者"))
    profile.unlocks.push("星林守护者");
  if (s.time >= 3600 && !profile.unlocks.includes("长夜行者"))
    profile.unlocks.push("长夜行者");
  try {
    await write("profile", profile);
  } catch (e) {
    notify((e as Error).message);
  }
  await terminalSave;
}
function results() {
  const s = world!.s,
    won = s.phase === "victory";
  screen = "result";
  scene.paused = true;
  shell(
    `<main class="page result"><div class="eyebrow">${won ? "星林重归宁静" : "星火未熄，旅程未尽"}</div><div class="result-star">${won ? "✦" : "✧"}</div><h1>${won ? "远征告捷" : "此行落幕"}</h1><p>${won ? "你击败了星骸巨像。前方，仍有无尽的星夜。" : "将这次领悟带往下一场远征。"}</p><div class="stat-grid"><div><small>生存时间</small><b>${time(s.time)}</b></div><div><small>击败敌人</small><b>${s.stats.kills}</b></div><div><small>角色等级</small><b>${s.player.level}</b></div><div><small>总伤害</small><b>${Math.round(s.stats.damage).toLocaleString()}</b></div></div><div class="result-details"><section><h3>本局构筑</h3><div class="build-chips">${Object.entries(
      s.player.upgrades,
    )
      .map(
        ([id, n]) =>
          `<span>${UPGRADES.find((u) => u.id === id)?.name || ""} ×${n}</span>`,
      )
      .join("")}</div></section><section><h3>技能表现</h3>${Object.entries(
      s.stats.bySource,
    )
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(
        ([id, n]) =>
          `<div class="damage-row"><span>${WEAPONS[id as WeaponId]?.name || SKILLS[id as SkillId]?.name || "其他"}</span><b>${Math.round(n).toLocaleString()}</b><i style="width:${(n / Math.max(1, s.stats.damage)) * 100}%"></i></div>`,
      )
      .join(
        "",
      )}<p>首领 ${s.stats.bosses} · 承受伤害 ${Math.round(s.stats.taken)} · 恢复 ${Math.round(s.stats.healed)}</p></section></div><div class="result-actions">${won ? button("endless", "继续无尽星夜", "primary") : button("retry", "再启远征", "primary")}${button("home", "返回营地")}</div></main>`,
  );
}
function records() {
  screen = "records";
  scene.paused = true;
  shell(
    `<main class="page"><div class="page-heading"><div><div class="eyebrow">属于你的星图</div><h2>远征记录</h2></div>${button("back", "← 返回")}</div><div class="achievement">${profile.unlocks.length ? profile.unlocks.map((x) => `<span>✦ ${esc(x)}</span>`).join("") : "完成首领战、通关标准模式或生存一小时，可解锁纪念徽章。"}</div><div class="record-table"><table><thead><tr><th>日期</th><th>行路人</th><th>模式</th><th>生存</th><th>击败</th><th>等级</th><th>结局</th></tr></thead><tbody>${profile.records.map((r) => `<tr><td>${esc(r.date)}</td><td>${CHARACTERS.find((c) => c.id === r.character)?.name}</td><td>${r.mode === "standard" ? "标准" : "无尽"}</td><td>${time(r.time)}</td><td>${r.kills}</td><td>${r.level}</td><td>${r.victory ? "通关" : "落幕"}</td></tr>`).join("")}</tbody></table>${profile.records.length ? "" : '<div class="empty">星图还是空白。第一场远征，正等着你。</div>'}</div></main>`,
  );
}
function settingsPage() {
  screen = "settings";
  scene.paused = true;
  shell(
    `<main class="page narrow"><div class="page-heading"><div><div class="eyebrow">调整你的旅途</div><h2>游戏设置</h2></div>${button("back", "← 返回")}</div><div class="settings-panel"><label>背景音乐 <output id="music-value">${Math.round(settings.music * 100)}%</output><input id="music" type="range" min="0" max="1" step=".01" value="${settings.music}"></label><label>音效音量 <output id="sfx-value">${Math.round(settings.sfx * 100)}%</output><input id="sfx" type="range" min="0" max="1" step=".01" value="${settings.sfx}"></label><label>画面效果<select id="quality"><option value="high" ${settings.quality === "high" ? "selected" : ""}>完整 · 植被与全部特效</option><option value="low" ${settings.quality === "low" ? "selected" : ""}>简约 · 降低装饰与特效预算</option></select></label><label class="check"><input id="shake" type="checkbox" ${settings.shake ? "checked" : ""}>命中屏幕震动</label><label class="check"><input id="showStats" type="checkbox" ${settings.showStats ? "checked" : ""}>显示性能统计（FPS、敌人、投射物、特效）</label><p>画面降级仅减少装饰与特效，不改变攻击判定。<br>失去焦点会自动暂停。进度与图片只保存在本浏览器。</p>${button("apply-settings", "保存设置", "primary")}</div></main>`,
  );
}
function assetManager() {
  screen = "assets";
  scene.paused = true;
  const item = ASSET_IDS.find((a) => a.id === assetId)!,
    a = assetPack.assets[assetId];
  shell(
    `<main class="page assets-page"><div class="page-heading"><div><div class="eyebrow">让你的星林与众不同</div><h2>资源工坊</h2><p>替换外观，保留碰撞和战斗规则。支持 PNG / WebP，单张 2 MB、2048 × 2048 以内。</p></div>${button("back", "← 返回")}</div><div class="asset-layout"><section class="asset-browser"><div class="asset-toolbar">${button("export-assets", "导出资源包")}${button("import-assets", "导入资源包")}<input type="file" id="pack-file" accept="application/json,.json" hidden></div><div class="asset-grid">${ASSET_IDS.map((a) => `<button data-action="asset-${a.id}" class="asset-card ${assetId === a.id ? "selected" : ""}">${img(a.id)}<span>${a.name}</span><small>${a.group} ${assetPack.assets[a.id] ? "· 自定义" : ""}</small></button>`).join("")}</div></section><section class="asset-editor"><div class="asset-preview">${img(assetId, "preview-img")}</div><small class="mono">${item.id}</small><h3>${item.name}</h3><p>${a ? "已使用本地自定义图片" : "默认矢量美术"}</p>${button("upload-asset", "选择本地图片", "primary")}<input id="asset-file" type="file" accept="image/png,image/webp" hidden><div class="asset-fields"><label>缩放<input id="asset-scale" type="number" min="0.1" max="4" step=".1" value="${a?.scale || 1}" ${!a ? "disabled" : ""}></label><label>水平偏移<input id="asset-x" type="number" min="-128" max="128" value="${a?.x || 0}" ${!a ? "disabled" : ""}></label><label>垂直偏移<input id="asset-y" type="number" min="-128" max="128" value="${a?.y || 0}" ${!a ? "disabled" : ""}></label></div><details><summary>精灵图动画配置</summary><p>静态图填 1 帧；动画按行排列。</p><div class="asset-fields">${[
      ["frames", "帧数", a?.frames || 1],
      ["frameWidth", "帧宽", a?.frameWidth || 64],
      ["frameHeight", "帧高", a?.frameHeight || 64],
      ["fps", "帧率", a?.fps || 8],
    ]
      .map(
        ([id, label, v]) =>
          `<label>${label}<input id="asset-${id}" type="number" value="${v}" ${!a ? "disabled" : ""}></label>`,
      )
      .join(
        "",
      )}</div></details><div class="editor-actions">${button("apply-asset", "应用配置", "", !a ? "disabled" : "")}${button("reset-asset", "恢复默认", "subtle")}</div><small>资源包仅解析图片与数值配置，不执行脚本。错误图片会回退为默认外观。</small></section></div></main>`,
  );
}
function back() {
  if (world && returnScreen === "upgrade") {
    upgrade();
  } else if (world && returnScreen === "pause") {
    hud();
    pause();
  } else if (world && returnScreen === "result") results();
  else home();
}
async function reloadArt() {
  panelArt();
  await scene.reloadAssets();
}
function rememberReturnTarget() {
  if (["build", "codex", "settings", "assets", "records"].includes(screen))
    return;
  returnScreen = world
    ? world.s.phase === "upgrade"
      ? "upgrade"
      : screen === "result"
        ? "result"
        : "pause"
    : "home";
}
let codexTab = "cards";
function collectionPage(owned = false) {
  screen = owned ? "build" : "codex";
  scene.paused = true;
  const state = world?.s || createRun("standard");
  ensureDeck(state);
  if (world) void saveCurrent(false);
  shell(
    `<main class="page"><div class="page-heading"><h2>${owned ? "当前构筑" : "远征图鉴"}</h2>${button("back", "← 返回")}</div>${owned ? "" : `<div class="tabs">${button("codex-cards", "卡牌图鉴")}${button("codex-skills", "技能图鉴")}${button("codex-enemies", "怪物图鉴")}</div>`}${owned || codexTab === "cards" ? cardBrowser(state, owned) : codexTab === "skills" ? skillBrowser(state, img) : enemyBrowser(img)}</main>`,
  );
  const search = document.getElementById(
    "card-search",
  ) as HTMLInputElement | null;
  search?.addEventListener("input", () => {
    for (const el of Array.from(
      document.querySelectorAll<HTMLElement>("[data-search]"),
    ))
      el.hidden = !el.dataset.search!.includes(search.value.trim());
  });
}
async function action(id: string) {
  audio.unlock();
  if (busy) return;
  if (id.startsWith("codex-")) {
    codexTab = id.slice(6);
    collectionPage();
    return;
  }
  if (id === "build" || id === "codex") {
    rememberReturnTarget();
    collectionPage(id === "build");
    return;
  }
  if (id === "refresh") {
    if (world && refresh(world.s)) {
      upgrade();
      await saveCurrent(false);
    }
    return;
  }
  if (id.startsWith("mode-")) {
    mode = id.endsWith("endless") ? "endless" : "standard";
    home();
    return;
  }
  if (id.startsWith("character-")) {
    character = id.slice(10);
    primary = CHARACTERS.find((c) => c.id === character)!.skill;
    selection();
    return;
  }
  if (id.startsWith("upgrade-")) {
    if (world?.choose(id.slice(8))) {
      await saveCurrent(false);
      if (world.s.phase === "upgrade") upgrade();
      else {
        hud();
        scene.paused = false;
        lastPhase = "playing";
      }
    }
    return;
  }
  if (id.startsWith("asset-")) {
    assetId = id.slice(6);
    assetManager();
    return;
  }
  switch (id) {
    case "home":
      home();
      break;
    case "select":
      selection();
      break;
    case "launch": {
      primary = (document.querySelector("#primary-skill") as HTMLSelectElement)
        .value as SkillId;
      secondary = (
        document.querySelector("#secondary-skill") as HTMLSelectElement
      ).value as SkillId;
      start(createRun(mode, character, Date.now() >>> 0, primary, secondary));
      await saveCurrent(false);
      break;
    }
    case "continue":
      if (saved) start(structuredClone(saved));
      break;
    case "backup": {
      const backup = await loadRun(true);
      if (!backup) throw new Error("没有可恢复的备份，可重新开启远征。");
      if (!["playing", "upgrade"].includes(backup.phase))
        throw new Error("备份为已结束远征，请重新开始。");
      saved = backup;
      saveError = "";
      start(backup);
      notify("已恢复上次安全节点。");
      break;
    }
    case "pause":
      pause();
      break;
    case "resume":
      hud();
      scene.paused = false;
      break;
    case "save":
      await saveCurrent();
      break;
    case "save-home":
      if (await saveCurrent(false)) home();
      break;
    case "settings":
    case "assets":
    case "records":
      rememberReturnTarget();
      if (id === "settings") settingsPage();
      else if (id === "assets") assetManager();
      else records();
      break;
    case "back":
      back();
      break;
    case "retry":
      selection();
      break;
    case "endless":
      world!.continueEndless();
      lastPhase = "playing";
      hud();
      scene.paused = false;
      if (world!.s.phase === "upgrade") upgrade();
      await saveCurrent(false);
      break;
    case "apply-settings":
      settings = {
        music: Number(
          (document.getElementById("music") as HTMLInputElement).value,
        ),
        sfx: Number((document.getElementById("sfx") as HTMLInputElement).value),
        quality: (document.getElementById("quality") as HTMLSelectElement)
          .value as Settings["quality"],
        shake: (document.getElementById("shake") as HTMLInputElement).checked,
        showStats: (document.getElementById("showStats") as HTMLInputElement)
          .checked,
      };
      audio.settings = scene.settings = settings;
      await write("settings", settings);
      notify("设置已保存");
      break;
    case "upload-asset":
      document.getElementById("asset-file")!.click();
      break;
    case "import-assets":
      document.getElementById("pack-file")!.click();
      break;
    case "export-assets":
      download("星烬远征-资源包.json", JSON.stringify(assetPack));
      notify("资源包已导出");
      break;
    case "reset-asset": {
      const next = { ...assetPack.assets };
      delete next[assetId];
      await persistAssets(next);
      await reloadArt();
      assetManager();
      break;
    }
    case "apply-asset": {
      const current = assetPack.assets[assetId];
      if (!current) break;
      const num = (id: string) =>
        Number(
          (document.getElementById("asset-" + id) as HTMLInputElement).value,
        );
      const a = {
        data: current.data,
        scale: num("scale"),
        x: num("x"),
        y: num("y"),
        ...(num("frames") > 1
          ? {
              frames: num("frames"),
              frameWidth: num("frameWidth"),
              frameHeight: num("frameHeight"),
              fps: num("fps"),
            }
          : {}),
      };
      await validateAsset(a);
      await persistAssets({ ...assetPack.assets, [assetId]: a });
      await reloadArt();
      assetManager();
      notify("资源配置已应用");
      break;
    }
  }
}
app.addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest<HTMLElement>("[data-action]");
  if (!b) return;
  e.preventDefault();
  void action(b.dataset.action!).catch((e) =>
    notify(e.message || "操作失败，请重试。"),
  );
});
app.addEventListener("input", (e) => {
  const el = e.target as HTMLInputElement;
  if (["music", "sfx"].includes(el.id))
    document.getElementById(el.id + "-value")!.textContent =
      Math.round(Number(el.value) * 100) + "%";
});
app.addEventListener("change", async (e) => {
  const el = e.target as HTMLInputElement;
  if (!["asset-file", "pack-file"].includes(el.id) || !el.files?.[0]) return;
  busy = true;
  try {
    if (el.id === "asset-file") {
      const a = await fromFile(el.files[0]);
      await persistAssets({ ...assetPack.assets, [assetId]: a });
    } else {
      if (el.files[0].size > 24 * 1024 * 1024)
        throw new Error("资源包最大为 24 MB。");
      const pack = await importPack(await el.files[0].text());
      await persistAssets(pack.assets);
    }
    await reloadArt();
    assetManager();
    notify("资源已保存并应用");
  } catch (e) {
    notify((e as Error).message);
  } finally {
    busy = false;
  }
});
window.addEventListener("keydown", (e) => {
  if (screen === "upgrade" && ["1", "2", "3"].includes(e.key) && !e.repeat) {
    const id = world?.s.choices[Number(e.key) - 1];
    if (id) void action("upgrade-" + id).catch((e) => notify(e.message));
  }
});
window.addEventListener("blur", () => {
  if (screen === "game" && world) pause();
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden && screen === "game" && world) pause();
});
async function boot() {
  settings = await loadSettings();
  profile = await loadProfile();
  const warning = await loadAssets();
  audio = new AudioEngine(settings);
  scene.settings = settings;
  try {
    saved = await loadRun();
  } catch (e) {
    saveError = (e as Error).message;
  }
  new Phaser.Game({
    type: Phaser.CANVAS,
    fps: { target: 60, smoothStep: false },
    parent: "game",
    backgroundColor: "#17332e",
    scale: {
      mode: Phaser.Scale.RESIZE,
      width: window.innerWidth,
      height: window.innerHeight,
    },
    scene: [scene],
    render: { antialias: true, powerPreference: "high-performance" },
    audio: { noAudio: true },
    banner: false,
  });
  scene.onPause = () => {
    if (screen === "game") pause();
    else if (screen === "pause") {
      hud();
      scene.paused = false;
    }
  };
  scene.onFrame = (dt) => {
    audio.update(dt, screen === "game" && !scene.paused);
    if (!world) return;
    if (world.lastSound) {
      audio.effect(world.lastSound);
      world.lastSound = "";
    }
    hudTimer += dt;
    if (hudTimer > 0.1) {
      updateHud();
      hudTimer = 0;
    }
    if (world.s.phase !== lastPhase) {
      lastPhase = world.s.phase;
      if (lastPhase === "upgrade") upgrade();
      if (lastPhase === "dead" || lastPhase === "victory") {
        results();
        void record();
      }
    }
    if (world.s.time - lastSave >= 30 && screen === "game") {
      lastSave = world.s.time;
      void saveCurrent(false);
    }
  };
  home();
  if (warning) notify(warning);
}
void boot().catch(() => {
  app.innerHTML =
    '<div class="startup-error"><h1>星林暂未苏醒</h1><p>游戏初始化失败，请刷新页面。若持续失败，请使用支持 Canvas 与 IndexedDB 的现代桌面浏览器。</p><button onclick="location.reload()">重新加载</button></div>';
});
