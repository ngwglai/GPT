(() => {
  "use strict";

  const STORAGE_KEY = "localMahjongAudioSettingsV1";
  const DEFAULT_SETTINGS = {
    bgmEnabled: true,
    sfxEnabled: true,
    voiceEnabled: true,
    bgmVolume: 0.45,
    sfxVolume: 0.75,
    voiceVolume: 0.85,
  };

  class AssetManager {
    constructor(url = "/assets/manifest.json") {
      this.url = url;
      this.manifest = { version: 1 };
      this.failedImages = new Set();
    }

    async load() {
      try {
        const response = await fetch(this.url, { cache: "no-store" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        this.manifest = await response.json();
      } catch (error) {
        console.warn("[assets] manifest unavailable; CSS/text fallback remains active", error);
        this.manifest = { version: 1 };
      }
      return this.manifest;
    }

    resolve(...path) {
      let node = this.manifest;
      for (const part of path) {
        if (node == null || typeof node !== "object" || !(part in node)) return null;
        node = node[part];
      }
      if (typeof node !== "string" || !node) return null;
      const url = /^(?:https?:|data:|blob:|\/)/.test(node) ? node : `/assets/${node.replace(/^\.\//, "")}`;
      return this.failedImages.has(url) ? null : url;
    }
  }

  class AudioManager {
    constructor(assets) {
      this.assets = assets;
      this.settings = this.loadSettings();
      this.bgm = null;
      this.currentBgmKey = null;
    }

    loadSettings() {
      try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
        return { ...DEFAULT_SETTINGS, ...(saved && typeof saved === "object" ? saved : {}) };
      } catch (_) {
        return { ...DEFAULT_SETTINGS };
      }
    }

    saveSettings() {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings)); } catch (_) {}
    }

    setSetting(key, value) {
      if (!(key in DEFAULT_SETTINGS)) return;
      if (key.endsWith("Volume")) value = Math.max(0, Math.min(1, Number(value) || 0));
      else value = Boolean(value);
      this.settings[key] = value;
      if (key === "bgmVolume" && this.bgm) this.bgm.volume = value;
      if (key === "bgmEnabled" && !value) this.stopBgm();
      this.saveSettings();
    }

    playOneShot(url, volume) {
      if (!url) return null;
      try {
        const audio = new Audio(url);
        audio.volume = volume;
        audio.play().catch(() => {});
        return audio;
      } catch (_) {
        return null;
      }
    }

    playSfx(key) {
      if (!this.settings.sfxEnabled) return;
      this.playOneShot(this.assets.resolve("sfx", key), this.settings.sfxVolume);
    }

    playVoiceAction(key) {
      if (!this.settings.voiceEnabled) return;
      this.playOneShot(this.assets.resolve("voice", "actions", key), this.settings.voiceVolume);
    }

    playVoiceTile(type) {
      if (!this.settings.voiceEnabled) return;
      this.playOneShot(this.assets.resolve("voice", "tiles", String(type)), this.settings.voiceVolume);
    }

    playVoiceWin(key) {
      if (!this.settings.voiceEnabled) return;
      this.playOneShot(this.assets.resolve("voice", "wins", key), this.settings.voiceVolume);
    }

    playBgm(key) {
      if (!this.settings.bgmEnabled || this.currentBgmKey === key) return;
      const url = this.assets.resolve("bgm", key);
      if (!url) return;
      this.stopBgm();
      try {
        this.bgm = new Audio(url);
        this.bgm.loop = true;
        this.bgm.volume = this.settings.bgmVolume;
        this.currentBgmKey = key;
        const track = this.bgm;
        track.play().catch(() => {
          if (this.bgm === track) this.stopBgm();
        });
      } catch (_) {
        this.bgm = null;
        this.currentBgmKey = null;
      }
    }

    stopBgm() {
      if (this.bgm) {
        this.bgm.pause();
        this.bgm.currentTime = 0;
      }
      this.bgm = null;
      this.currentBgmKey = null;
    }
  }

  class AnimationManager {
    flashSeat(seat, kind = "action") {
      if (seat == null) return;
      const node = document.getElementById(`seat-${seat}`);
      if (!node) return;
      const cls = `event-${kind.toLowerCase().replace(/[^a-z0-9_-]/g, "-")}`;
      if (node.eventCue) node.classList.remove(node.eventCue);
      clearTimeout(node.eventCueTimer);
      node.classList.remove("event-flash", cls);
      void node.offsetWidth;
      node.classList.add("event-flash", cls);
      node.eventCue = cls;
      node.eventCueTimer = setTimeout(() => node.classList.remove("event-flash", cls), 560);
    }

    flashCenter(kind = "action") {
      const node = document.getElementById("center");
      if (!node) return;
      node.classList.remove("event-flash");
      void node.offsetWidth;
      node.classList.add("event-flash");
      setTimeout(() => node.classList.remove("event-flash"), 520);
    }
  }

  class NotificationManager {
    show(message, duration = 1400) {
      if (!message) return;
      let node = document.getElementById("presentationToast");
      if (!node) {
        node = document.createElement("div");
        node.id = "presentationToast";
        node.className = "presentation-toast";
        node.setAttribute("role", "status");
        node.setAttribute("aria-live", "polite");
        document.body.appendChild(node);
      }
      node.textContent = message;
      node.classList.add("show");
      clearTimeout(this.timer);
      this.timer = setTimeout(() => node.classList.remove("show"), duration);
    }
  }

  class PresentationEventBus {
    constructor(audio, animations, notifications) {
      this.audio = audio;
      this.animations = animations;
      this.notifications = notifications;
      this.listeners = new Map();
    }

    on(type, listener) {
      if (!this.listeners.has(type)) this.listeners.set(type, new Set());
      this.listeners.get(type).add(listener);
      return () => this.listeners.get(type)?.delete(listener);
    }

    emit(event, context = {}) {
      this.defaultPresentation(event, context);
      for (const listener of this.listeners.get(event.type) || []) listener(event, context);
      for (const listener of this.listeners.get("*") || []) listener(event, context);
    }

    defaultPresentation(event, context) {
      const seatName = context.seatName || (seat => `${seat}`);
      const tileName = context.tileName || (type => `${type}`);
      const p = event.payload || {};
      const seat = event.player;
      const actionVoice = {
        CHI: "chi", PENG: "peng", GANG: "gang", GOLD_SHELVED: "gold_shelved",
        TING_DECLARED: "ting"
      };

      if (event.type === "ROUND_STARTED") {
        this.audio.playBgm("game");
        return;
      }
      if (event.type === "DICE_ROLLED") {
        this.audio.playSfx("dice");
        this.animations.flashCenter("dice");
        this.notifications.show(`${seatName(seat)}家掷骰：${p.dice?.[0] ?? "?"} + ${p.dice?.[1] ?? "?"}`);
        return;
      }
      if (event.type === "TILE_DRAWN") {
        this.audio.playSfx("draw");
        this.animations.flashSeat(seat, "draw");
        return;
      }
      if (event.type === "TILE_DISCARDED") {
        this.audio.playSfx("tile_drop");
        this.audio.playVoiceTile(p.tile_type);
        this.animations.flashSeat(seat, "discard");
        return;
      }
      if (event.type in actionVoice) {
        this.audio.playSfx(event.type.toLowerCase());
        this.audio.playVoiceAction(actionVoice[event.type]);
        this.animations.flashSeat(seat, event.type);
      }
      if (event.type === "CHI") this.notifications.show(`${seatName(seat)}家 吃`);
      if (event.type === "PENG") this.notifications.show(`${seatName(seat)}家 碰`);
      if (event.type === "GANG") this.notifications.show(`${seatName(seat)}家 杠`);
      if (event.type === "TING_DECLARED") this.notifications.show(`${seatName(seat)}家 报听`);
      if (event.type === "ORPHAN_PICKED") {
        this.animations.flashSeat(seat, event.type);
        this.notifications.show(`${seatName(seat)}家 拾幺牌`);
      }
      if (event.type === "GOLD_SHELVED") this.notifications.show(`${seatName(seat)}家 上金`);
      if (event.type === "HU") {
        const pattern = p.patterns?.[0];
        this.audio.playSfx("hu");
        if (pattern && this.audio.assets.resolve("voice", "wins", pattern)) this.audio.playVoiceWin(pattern);
        else this.audio.playVoiceAction("hu");
        this.audio.playBgm("result");
        this.animations.flashSeat(seat, "hu");
        this.notifications.show(`${seatName(seat)}家 胡 ${p.tile_type != null ? tileName(p.tile_type) : ""}`, 2200);
      }
      if (event.type === "ROUND_DRAW") {
        this.audio.playSfx("round_draw");
        this.audio.playBgm("result");
        this.animations.flashCenter("draw");
        this.notifications.show("本局流局", 2200);
      }
    }
  }

  const assets = new AssetManager();
  const audio = new AudioManager(assets);
  const animations = new AnimationManager();
  const notifications = new NotificationManager();
  const bus = new PresentationEventBus(audio, animations, notifications);

  function bindAudioSettings() {
    const bindings = [
      ["bgmEnabled", "checked"], ["sfxEnabled", "checked"], ["voiceEnabled", "checked"],
      ["bgmVolume", "value"], ["sfxVolume", "value"], ["voiceVolume", "value"],
    ];
    for (const [id, prop] of bindings) {
      const node = document.getElementById(id);
      if (!node) continue;
      node[prop] = prop === "checked" ? Boolean(audio.settings[id]) : String(audio.settings[id]);
      const eventName = prop === "checked" ? "change" : "input";
      node.addEventListener(eventName, () => {
        audio.setSetting(id, prop === "checked" ? node.checked : Number(node.value));
        if (id === "bgmEnabled" && node.checked) startTableBgm();
      });
    }
  }

  function atTable() {
    const lanTable = document.getElementById("gameTable");
    return document.body.classList.contains("game-mode") || Boolean(lanTable && !lanTable.classList.contains("hidden"));
  }

  function startTableBgm() {
    if (!atTable() || audio.currentBgmKey) return;
    const resultMusic = document.querySelector(".result-box") && assets.resolve("bgm", "result");
    audio.playBgm(resultMusic ? "result" : "game");
  }

  function bindPanels() {
    const panels = [...document.querySelectorAll(".top-details")];
    document.addEventListener("click", event => {
      for (const panel of panels) {
        if (panel.open && !panel.contains(event.target)) panel.open = false;
      }
      startTableBgm();
    });
    document.addEventListener("keydown", event => {
      if (event.key !== "Escape") return;
      const panel = panels.find(details => details.open);
      if (panel) {
        panel.open = false;
        panel.querySelector("summary").focus();
      }
    });
  }

  document.addEventListener("error", event => {
    const image = event.target;
    if (!image.classList?.contains("asset-image")) return;
    assets.failedImages.add(image.getAttribute("src"));
    image.remove();
  }, true);

  function applyArt() {
    const properties = [
      ["--home-art", assets.resolve("backgrounds", "home")],
      ["--lobby-art", assets.resolve("backgrounds", "lobby")],
      ["--table-felt", assets.resolve("table", "felt")],
      ["--page-art", assets.resolve("table", "background")],
    ];
    for (const [name, path] of properties) {
      if (path) document.body.style.setProperty(name, `url(${JSON.stringify(path)})`);
    }
  }

  let ready;
  function init() {
    ready ||= assets.load().then(() => {
      applyArt();
      bindAudioSettings();
      bindPanels();
    });
    return ready;
  }

  window.MahjongPresentation = { assets, audio, animations, notifications, bus, init };
  if (document.body.hasAttribute("data-art-preview")) init();
})();
