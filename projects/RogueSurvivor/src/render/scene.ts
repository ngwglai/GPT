import Phaser from "phaser";
import type { Settings, Input, Vec } from "../core/types";
import { World } from "../core/world";
import { ASSET_IDS, assetPack, decodeImage } from "../services/assets";
import { defaultArt } from "./art";
import { ENEMIES, SKILLS, LIMITS } from "../data/content";
export class GameScene extends Phaser.Scene {
  world?: World;
  settings!: Settings;
  paused = true;
  ready = false;
  showWorld = false;
  needsPaint = true;
  onFrame?: (dt: number) => void;
  onPause?: () => void;
  private background!: Phaser.GameObjects.Graphics;
  private graphics!: Phaser.GameObjects.Graphics;
  private sprites: Phaser.GameObjects.Sprite[] = [];
  private labels: Phaser.GameObjects.Text[] = [];
  private used = 0;
  private textUsed = 0;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private accumulator = 0;
  private cx = 1800;
  private cy = 1800;
  private queued = { dash: false, skills: [false, false, false] };
  private assetRevision = 0;
  constructor() {
    super("expedition");
  }
  create() {
    for (const a of ASSET_IDS) this.textures.addCanvas(a.id, defaultArt(a.id));
    this.background = this.add.graphics().setDepth(-2);
    this.graphics = this.add.graphics().setDepth(0);
    this.keys = this.input.keyboard!.addKeys(
      "W,A,S,D,Q,E,R,SPACE,ESC",
    ) as Record<string, Phaser.Input.Keyboard.Key>;
    this.input.keyboard!.on("keydown", (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (["INPUT", "SELECT", "TEXTAREA"].includes(tag)) return;
      if (e.code === "Escape" && !e.repeat) this.onPause?.();
      if (this.paused) return;
      if (e.code === "Space") this.queued.dash = true;
      const i = ["KeyQ", "KeyE", "KeyR"].indexOf(e.code);
      if (i >= 0 && !e.repeat) this.queued.skills[i] = true;
    });
    this.scale.on("resize", () => {
      this.needsPaint = true;
    });
    this.ready = true;
    void this.reloadAssets();
  }
  setWorld(w: World) {
    this.needsPaint = true;
    this.world = w;
    this.cx = w.s.player.x;
    this.cy = w.s.player.y;
    this.accumulator = 0;
    this.queued = { dash: false, skills: [false, false, false] };
  }
  async reloadAssets() {
    this.needsPaint = true;
    if (!this.ready) return;
    const rev = ++this.assetRevision;
    for (const sprite of this.sprites)
      sprite.setVisible(false).setTexture("ui.gem");
    for (const a of ASSET_IDS) {
      const key = "custom:" + a.id;
      if (this.textures.exists(key)) this.textures.remove(key);
      const custom = assetPack.assets[a.id];
      if (!custom) continue;
      try {
        const img = await decodeImage(custom.data);
        if (rev !== this.assetRevision) return;
        if (custom.frames)
          this.textures.addSpriteSheet(key, img, {
            frameWidth: custom.frameWidth!,
            frameHeight: custom.frameHeight!,
            endFrame: custom.frames - 1,
          });
        else this.textures.addImage(key, img);
      } catch {
        /* Default key remains. */
      }
    }
  }
  inputState(): Input {
    const k = this.keys,
      ptr = this.input.activePointer;
    return {
      x: Number(k.D.isDown) - Number(k.A.isDown),
      y: Number(k.S.isDown) - Number(k.W.isDown),
      aim: {
        x: ptr.x - this.scale.width / 2 + this.cx,
        y: ptr.y - this.scale.height / 2 + this.cy,
      },
      ...this.queued,
    };
  }
  private sprite(
    id: string,
    p: Vec,
    size: number,
    angle = 0,
    alpha = 1,
    tint?: number,
  ) {
    const x = p.x - this.cx + this.scale.width / 2,
      y = p.y - this.cy + this.scale.height / 2;
    if (
      x < -size ||
      y < -size ||
      x > this.scale.width + size ||
      y > this.scale.height + size
    )
      return;
    const custom = assetPack.assets[id],
      key =
        custom && this.textures.exists("custom:" + id) ? "custom:" + id : id;
    let sprite = this.sprites[this.used];
    if (!sprite) {
      sprite = this.add.sprite(0, 0, key);
      this.sprites.push(sprite);
    }
    this.used++;
    sprite
      .setVisible(true)
      .setTexture(key)
      .setPosition(x + (custom?.x || 0), y + (custom?.y || 0))
      .setDisplaySize(size * (custom?.scale || 1), size * (custom?.scale || 1))
      .setRotation(angle)
      .setAlpha(alpha)
      .setDepth(2 + p.y / 10000);
    sprite.clearTint();
    if (tint) sprite.setTint(tint);
    if (custom?.frames && key.startsWith("custom:"))
      sprite.setFrame(
        Math.floor((this.world?.s.time || 0) * (custom.fps || 8)) %
          custom.frames,
      );
  }
  private label(
    text: string,
    x: number,
    y: number,
    color = "#e6f9e9",
    size = 14,
  ) {
    let t = this.labels[this.textUsed];
    if (!t) {
      t = this.add.text(0, 0, "", {
        fontFamily: "system-ui, sans-serif",
        fontSize: size,
        color,
        stroke: "#14262d",
        strokeThickness: 3,
      });
      this.labels.push(t);
    }
    this.textUsed++;
    t.setVisible(true)
      .setText(text)
      .setPosition(
        x - this.cx + this.scale.width / 2,
        y - this.cy + this.scale.height / 2,
      )
      .setColor(color)
      .setFontSize(size)
      .setDepth(8);
  }
  update(_time: number, delta: number) {
    if (!this.ready) return;
    const dt = Math.min(delta / 1000, 0.1);
    if (this.world && !this.paused && this.world.s.phase === "playing") {
      this.accumulator += dt;
      let steps = 0;
      while (this.accumulator >= 1 / 60 && steps++ < 6) {
        this.world.step(1 / 60, this.inputState());
        this.queued = { dash: false, skills: [false, false, false] };
        this.accumulator -= 1 / 60;
      }
    } else {
      this.accumulator = 0;
      this.queued = { dash: false, skills: [false, false, false] };
    }
    if (this.world && this.showWorld && (!this.paused || this.needsPaint)) {
      this.cx = this.world.s.player.x;
      this.cy = this.world.s.player.y;
      this.draw();
      this.needsPaint = false;
    }
    this.onFrame?.(dt);
  }
  private draw() {
    const w = this.world!,
      s = w.s,
      p = s.player,
      g = this.graphics,
      W = this.scale.width,
      H = this.scale.height;
    const low =
      this.settings.quality === "low" ||
      s.enemies.length > 110 ||
      s.bullets.length > 220;
    this.used = 0;
    this.textUsed = 0;
    g.clear();
    const sx = (x: number) => x - this.cx + W / 2,
      sy = (y: number) => y - this.cy + H / 2;
    this.background.clear().fillStyle(0x17332e).fillRect(0, 0, W, H);
    if (assetPack.assets["map.ground"]) {
      this.sprite("map.ground", p, Math.max(W, H));
      this.sprites[this.used - 1]?.setDepth(-1);
    }
    g.lineStyle(1, 0x779c80, 0.055);
    for (
      let x = Math.floor((this.cx - W / 2) / 100) * 100;
      x < this.cx + W / 2;
      x += 100
    ) {
      g.lineBetween(sx(x), 0, sx(x), H);
    }
    for (
      let y = Math.floor((this.cy - H / 2) / 100) * 100;
      y < this.cy + H / 2;
      y += 100
    )
      g.lineBetween(0, sy(y), W, sy(y));
    for (
      let x = Math.floor((this.cx - W / 2) / 140) * 140;
      x < this.cx + W / 2 + 140;
      x += 140
    )
      for (
        let y = Math.floor((this.cy - H / 2) / 140) * 140;
        y < this.cy + H / 2 + 140;
        y += 140
      ) {
        const hash = Math.abs(Math.sin(x * 12.9 + y * 7.2));
        g.fillStyle(0x547956, 0.22);
        g.fillEllipse(sx(x + hash * 90), sy(y + hash * 90), 50 + hash * 30, 18);
        if (!low) {
          g.lineStyle(2, 0x75a080, 0.22);
          g.lineBetween(sx(x), sy(y), sx(x + 3), sy(y - 8));
          g.lineBetween(sx(x + 3), sy(y - 8), sx(x + 8), sy(y - 2));
          if (hash > 0.85)
            this.sprite("map.flower", { x: x + 36, y: y + 25 }, 28);
        }
      }
    g.lineStyle(8, 0x7e9f80, 0.8);
    g.strokeRect(sx(0), sy(0), LIMITS.world, LIMITS.world);
    for (const rock of s.rocks) this.sprite("map.rock", rock, rock.r * 2.7);
    for (const gem of s.gems)
      this.sprite("ui.gem", gem, gem.value > 40 ? 22 : 14);
    for (const z of s.zones) {
      const x = sx(z.x),
        y = sy(z.y),
        color = z.enemy
          ? 0xff867c
          : SKILLS[z.kind as keyof typeof SKILLS]?.color || 0xa0eac8;
      g.fillStyle(color, z.delay > 0 ? 0.09 : 0.18);
      g.fillCircle(x, y, z.r);
      g.lineStyle(z.enemy ? 3 : 2, color, z.delay > 0 ? 0.7 : 0.4);
      g.strokeCircle(x, y, z.r);
      if (z.enemy && z.delay > 0) {
        g.lineStyle(2, 0xffd4a1, 0.8);
        g.strokeCircle(x, y, z.r * Math.max(0.05, 1 - z.delay / 1.6));
      }
      if (!z.enemy && assetPack.assets["skill." + z.kind])
        this.sprite("skill." + z.kind, z, z.r * 2, 0, 0.6);
    }
    for (const e of s.enemies) {
      const bob =
        Math.sin(s.time * (e.kind === "runner" ? 12 : 5) + e.id) * 0.04;
      this.sprite(
        "enemy." + e.kind,
        e,
        e.r * 2.7 * (1 + bob),
        e.charge ? Math.sin(s.time * 35) * 0.06 : 0,
        e.hit > 0 ? 0.55 : 1,
        e.hit > 0
          ? 0xffffff
          : e.freeze > 0
            ? 0x91dafa
            : e.burn > 0
              ? 0xffb888
              : undefined,
      );
      if (e.freeze > 0 || e.burn > 0 || e.slow > 0) {
        g.lineStyle(
          2,
          e.freeze > 0 ? 0x9eeaff : e.burn > 0 ? 0xffa36f : 0xbcc6ff,
          0.75,
        );
        g.strokeCircle(sx(e.x), sy(e.y), e.r + 2);
      }
      if (e.elite) {
        g.lineStyle(2, 0xffd285, 0.85);
        g.strokeCircle(sx(e.x), sy(e.y), e.r + 5);
      }
      if (e.charge) {
        g.lineStyle(3, 0xff8e7c, 0.7);
        g.lineBetween(
          sx(e.x),
          sy(e.y),
          sx(e.x + e.charge.x * 220),
          sy(e.y + e.charge.y * 220),
        );
      }
      if (e.hp < e.maxHp && !ENEMIES[e.kind].boss) {
        g.fillStyle(0x0a2025, 0.8);
        g.fillRect(sx(e.x) - 18, sy(e.y) - e.r - 14, 36, 4);
        g.fillStyle(e.elite ? 0xf2c37c : 0xa4d9b0);
        g.fillRect(
          sx(e.x) - 18,
          sy(e.y) - e.r - 14,
          36 * Math.max(0, e.hp / e.maxHp),
          4,
        );
      }
    }
    if (p.shield > 0) {
      g.lineStyle(2, 0xa3e4ef, 0.6);
      g.strokeCircle(W / 2, H / 2, 29 + Math.sin(s.time * 3) * 2);
    }
    if (p.dash > 0) {
      g.lineStyle(14, 0xa7ead6, 0.3);
      g.lineBetween(W / 2, H / 2, W / 2 - p.dx * 60, H / 2 - p.dy * 60);
    }
    this.sprite(
      "player." + s.character,
      p,
      66 * (1 + Math.sin(s.time * 7) * 0.025),
      0,
      p.invincible > 0 && Math.floor(s.time * 20) % 2 ? 0.55 : 1,
    );
    for (const key of ["orbit", "drone"] as const) {
      if (!p.weapons[key]) continue;
      const count =
        key === "orbit"
          ? 2 + (p.upgrades.satellite || 0) + (p.weapons.orbit === 5 ? 2 : 0)
          : 2 + (p.upgrades.swarm || 0);
      for (let i = 0; i < count; i++) {
        const a =
            s.time * (key === "orbit" ? 2 : 1) + (i * Math.PI * 2) / count,
          r = key === "orbit" ? 95 + (p.upgrades.satellite || 0) * 12 : 50;
        this.sprite(
          "weapon." + key,
          { x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r },
          key === "orbit" ? 27 : 24,
          a,
        );
      }
    }
    for (const b of s.bullets) {
      const id = b.enemy
        ? "enemy"
        : b.kind === "fragment"
          ? "bow"
          : b.kind === "lance"
            ? "ember"
            : b.kind;
      this.sprite(
        "projectile." + id,
        b,
        b.r * 3 + 5,
        Math.atan2(b.vy, b.vx) + Math.PI / 2,
      );
    }
    const limit = low ? 25 : 90;
    for (const e of w.effects.slice(-limit)) {
      const a = e.life / e.maxLife;
      if (e.text) {
        this.label(
          e.text,
          e.x,
          e.y - 22 - (1 - a) * 30,
          e.kind === "critical" ? "#ffd488" : "#eef7d5",
          e.kind === "critical" ? 18 : 12,
        );
        continue;
      }
      g.lineStyle(
        3,
        e.kind === "hurt"
          ? 0xff8e83
          : e.kind === "fire"
            ? 0xffb383
            : e.kind === "ice"
              ? 0xa9dfff
              : 0xbcebd1,
        a * 0.8,
      );
      g.strokeCircle(sx(e.x), sy(e.y), e.r * (1 - a * 0.4));
    }
    // A minimal minimap always shows boundaries and living bosses.
    if (W > 700) {
      const mx = W - 158,
        my = 100;
      g.fillStyle(0x0b2028, 0.75);
      g.fillRoundedRect(mx, my, 130, 130, 12);
      g.lineStyle(1, 0x8eb49b, 0.25);
      g.strokeRoundedRect(mx, my, 130, 130, 12);
      g.fillStyle(0xb5efce);
      g.fillCircle(
        mx + 7 + (p.x / LIMITS.world) * 116,
        my + 7 + (p.y / LIMITS.world) * 116,
        3,
      );
      for (const e of s.enemies)
        if (ENEMIES[e.kind].boss) {
          g.fillStyle(0xffb289);
          g.fillCircle(
            mx + 7 + (e.x / LIMITS.world) * 116,
            my + 7 + (e.y / LIMITS.world) * 116,
            4,
          );
        }
    }
    for (let i = this.used; i < this.sprites.length; i++)
      this.sprites[i].setVisible(false);
    for (let i = this.textUsed; i < this.labels.length; i++)
      this.labels[i].setVisible(false);
    if (this.settings.shake && w.shake > 0 && !this.paused)
      this.cameras.main.shake(70, 0.002, false);
  }
}
