import { environment } from "../core/environment";
import { MAPS } from "../data/maps";
import { VISUALS, artUrl } from "../data/visuals";
import Phaser from "phaser";
import type { Settings, Input, Vec, Zone } from "../core/types";
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
  private ground?: Phaser.GameObjects.TileSprite;
  private decoded = new Map<string, Promise<HTMLImageElement>>();
  private builtins?: Promise<void>;
  private background!: Phaser.GameObjects.Graphics;
  private graphics!: Phaser.GameObjects.Graphics;
  private danger!: Phaser.GameObjects.Graphics;
  private friendly!: Phaser.GameObjects.Graphics;
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
    // Keep only the two safety textures needed before any world is painted.
    // Other legacy vectors are created lazily if their generated image is absent.
    for (const id of ["ui.gem", "map.ground"])
      this.textures.addCanvas(id, defaultArt(id));
    this.background = this.add.graphics().setDepth(-2);
    this.graphics = this.add.graphics().setDepth(0);
    this.danger = this.add.graphics().setDepth(12);
    this.friendly = this.add.graphics().setDepth(5);
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
    this.builtins ??= Promise.all(
      Object.keys(VISUALS)
        .filter(
          (id) =>
            !id.startsWith("portrait.") &&
            !id.startsWith("avatar.") &&
            !id.startsWith("card.") &&
            id !== "ui.world" &&
            !id.startsWith("skill.") &&
            !id.endsWith(".preview"),
        )
        .map(async (id) => {
          try {
            const url = artUrl(id)!;
            if (!this.decoded.has(url)) this.decoded.set(url, decodeImage(url));
            const image = await this.decoded.get(url)!;
            if (!this.textures.exists("builtin:" + id))
              this.textures.addImage("builtin:" + id, image);
          } catch {
            /* Original vector fallback remains available. */
          }
        }),
    ).then(() => {
      this.needsPaint = true;
    });
    await this.builtins;
    const rev = ++this.assetRevision;
    this.ground?.setVisible(false).setTexture("map.ground");
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
    this.needsPaint = true;
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
        custom && this.textures.exists("custom:" + id)
          ? "custom:" + id
          : this.textures.exists("builtin:" + id)
            ? "builtin:" + id
            : id;
    if (!this.textures.exists(key))
      this.textures.addCanvas(key, defaultArt(id));
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
      .setDepth(
        id === "ui.gem"
          ? -0.1
          : id.startsWith("map.")
            ? -0.5
            : id.startsWith("player.")
              ? 10
              : 2 + p.y / 10000,
      );
    sprite.setFlipX(
      id.startsWith("player.") && this.keys.A.isDown && !this.keys.D.isDown,
    );
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
      .setDepth(8)
      .setAlpha(0.85);
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
  private zonePath(
    g: Phaser.GameObjects.Graphics,
    z: Zone,
    x: number,
    y: number,
  ) {
    const h = z.shape;
    if (h?.kind === "bar") {
      const ca = Math.cos(h.angle),
        sa = Math.sin(h.angle);
      for (const [i, [a, b]] of [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ].entries()) {
        const px = x + ((a * h.length) / 2) * ca - b * z.r * sa,
          py = y + ((a * h.length) / 2) * sa + b * z.r * ca;
        if (i === 0) g.moveTo(px, py);
        else g.lineTo(px, py);
      }
    } else if (h?.kind === "fan") {
      g.moveTo(x, y);
      g.arc(x, y, z.r, h.angle - h.halfAngle, h.angle + h.halfAngle, false);
    } else {
      g.moveTo(x + z.r, y);
      g.arc(x, y, z.r, 0, Math.PI * 2, false);
    }
    g.closePath();
  }
  private draw() {
    const w = this.world!,
      s = w.s,
      p = s.player,
      g = this.graphics,
      W = this.scale.width,
      H = this.scale.height;
    const low = this.settings.quality === "low";
    const busy = low || s.enemies.length > 110 || s.bullets.length > 220;
    this.used = 0;
    this.textUsed = 0;
    g.clear();
    const sx = (x: number) => x - this.cx + W / 2,
      sy = (y: number) => y - this.cy + H / 2;
    this.background.clear().fillStyle(0xcddfc8).fillRect(0, 0, W, H);
    const env = environment(s),
      map = MAPS[env.mapId];
    const groundId = map.ground,
      customGroundId = assetPack.assets[groundId] ? groundId : "map.ground";
    const groundKey = this.textures.exists("custom:" + customGroundId)
      ? "custom:" + customGroundId
      : this.textures.exists("builtin:" + groundId)
        ? "builtin:" + groundId
        : this.textures.exists("builtin:map.ground")
          ? "builtin:map.ground"
          : undefined;
    if (groundKey) {
      this.ground ??= this.add
        .tileSprite(0, 0, W, H, groundKey)
        .setOrigin(0)
        .setDepth(-1);
      this.ground.setVisible(true);
      if (this.ground.texture.key !== groundKey)
        this.ground.setTexture(groundKey);
      if (this.ground.width !== W || this.ground.height !== H)
        this.ground.setSize(W, H);
      this.ground.setTileScale(assetPack.assets[customGroundId]?.scale || 1);
      this.ground.tilePositionX =
        this.cx - W / 2 - (assetPack.assets[customGroundId]?.x || 0);
      this.ground.tilePositionY =
        this.cy - H / 2 - (assetPack.assets[customGroundId]?.y || 0);
    } else this.ground?.setVisible(false);
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
            this.sprite(
              hash > 0.96
                ? map.decor[0]
                : hash > 0.92
                  ? map.decor[1]
                  : map.decor[2],
              { x: x + 36, y: y + 25 },
              hash > 0.92 ? 44 : 28,
            );
        }
      }
    g.lineStyle(8, 0x7e9f80, 0.8);
    g.strokeRect(sx(0), sy(0), LIMITS.world, LIMITS.world);
    for (const rock of s.rocks) {
      const crystal =
        rock.crystalId && env.crystals.find((x) => x.id === rock.crystalId);
      this.sprite(
        crystal ? "map.cavern.crystal" : map.rock,
        rock,
        rock.r * 2.7,
        0,
        1,
        crystal
          ? crystal.type === "xp"
            ? 0xffe7a0
            : crystal.type === "blast"
              ? 0xffa6c7
              : undefined
          : undefined,
      );
      if (crystal) {
        g.lineStyle(
          2,
          crystal.type === "xp"
            ? 0xffe173
            : crystal.type === "blast"
              ? 0xff7999
              : 0x88daff,
          0.85,
        );
        g.strokeCircle(sx(rock.x), sy(rock.y), rock.r + 4);
      }
    }
    for (const candy of env.candies) {
      this.sprite("map.candy." + candy.kind, candy, 35);
      this.label(
        (
          {
            speed: "移速+",
            haste: "攻速+",
            heal: "回复",
            xp: "经验",
            slow: "减速",
            weak: "伤害−",
          } as Record<string, string>
        )[candy.kind] || "糖果",
        candy.x - 16,
        candy.y - 32,
        candy.kind === "slow" || candy.kind === "weak" ? "#ffabd5" : "#fff0b0",
        12,
      );
    }
    for (const f of env.fields) {
      const color =
        f.kind === "eclipse"
          ? 0xff687f
          : f.kind === "shield"
            ? 0x79d8ff
            : 0xffd896;
      this.sprite(
        "map.magicCircle",
        f,
        f.r * 2,
        s.time * 0.1,
        f.delay > 0 ? 0.13 : 0.3,
      );
      g.fillStyle(color, f.delay > 0 ? 0.07 : 0.14);
      g.fillCircle(sx(f.x), sy(f.y), f.r);
      g.lineStyle(3, color, 0.8);
      g.strokeCircle(sx(f.x), sy(f.y), f.r);
      this.label(
        f.kind === "eclipse"
          ? "⚠ 月蚀"
          : f.kind === "shield"
            ? "星辉护盾"
            : "月光强化",
        f.x - 30,
        f.y - f.r - 16,
        f.kind === "eclipse" ? "#ffb3c1" : "#f9edca",
        12,
      );
    }
    for (const gem of s.gems) {
      if (assetPack.assets["ui.gem"])
        this.sprite("ui.gem", gem, gem.value > 40 ? 22 : 14, 0, 0.6);
      const x = sx(gem.x),
        y = sy(gem.y),
        r = gem.value > 40 ? 7 : 4;
      g.fillStyle(0xdfff38, 0.18 + 0.08 * Math.sin(s.time * 3 + gem.x));
      g.fillCircle(x, y, r + 5);
      g.fillStyle(0x24301a, 1);
      g.fillCircle(x, y, r + 2);
      g.fillStyle(0xe2ff40, 1);
      g.fillCircle(x, y, r);
      g.fillStyle(0xffffdf, 1);
      g.fillCircle(x - 1, y - 1, 1.5);
    }
    for (const drop of s.rewardDrops || []) {
      const x = sx(drop.x),
        y = sy(drop.y),
        color = drop.kind === "positive" ? 0xffdc8a : 0xef83c1;
      g.fillStyle(0x172b2d, 1);
      g.fillRoundedRect(x - 15, y - 19, 30, 38, 5);
      g.lineStyle(3, color, 1);
      g.strokeRoundedRect(x - 15, y - 19, 30, 38, 5);
      g.lineBetween(x - 7, y, x + 7, y);
      if (drop.kind === "positive") g.lineBetween(x, y - 7, x, y + 7);
    }
    for (const z of s.zones) {
      if (z.enemy) continue;
      const x = sx(z.x),
        y = sy(z.y),
        color = z.enemy
          ? 0xff867c
          : SKILLS[z.kind as keyof typeof SKILLS]?.color || 0xa0eac8;
      g.fillStyle(color, z.delay > 0 ? 0.09 : 0.18);
      g.fillCircle(x, y, z.r);
      g.lineStyle(4, 0xb7eaff, z.delay > 0 ? 0.85 : 0.65);
      g.strokeCircle(x, y, z.r);
      if (z.enemy && z.delay > 0) {
        g.lineStyle(2, 0xffd4a1, 0.8);
        g.strokeCircle(x, y, z.r * Math.max(0.05, 1 - z.delay / 1.6));
      }
      if (z.kind === "crystalBeam" && z.delay <= 0)
        this.sprite("projectile.crystal", z, 50, 0, 0.8);
      if (!z.enemy && assetPack.assets["skill." + z.kind])
        this.sprite("skill." + z.kind, z, z.r * 2, 0, 0.6);
      else if (!z.enemy && (z.kind === "bloom" || z.kind === "ward"))
        this.sprite("effect." + z.kind, z, z.r * 2, 0, 0.25);
    }
    for (const e of s.enemies) {
      const bob =
        Math.sin(s.time * (e.kind === "runner" ? 12 : 5) + e.id) * 0.04;
      this.sprite(
        e.kind === "mimic" && !e.behavior?.awakened
          ? "enemy.mimicDormant"
          : "enemy." + e.kind,
        e,
        e.r * 2.7 * (1 + bob),
        e.kind === "crab"
          ? (e.behavior?.facing || 0) - Math.PI / 2
          : e.charge
            ? Math.sin(s.time * 35) * 0.06
            : 0,
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
      if (e.kind === "mimic" && !e.behavior?.awakened) {
        g.fillStyle(0xeb8ca7, 0.9);
        g.fillCircle(sx(e.x) + e.r + 12, sy(e.y) - e.r - 8, 3);
      }
      if (e.behavior) {
        const b = e.behavior;
        if (b.target && b.warning > 0) {
          g.lineStyle(3, 0xff8da5, 0.85);
          g.strokeCircle(
            sx(b.target.x),
            sy(b.target.y),
            e.kind === "ghost" ? 40 : 175,
          );
        }
        if (b.shield > 0 || b.reflecting > 0) {
          g.lineStyle(3, b.shield > 0 ? 0x86dfff : 0xe492ff, 0.9);
          g.strokeCircle(sx(e.x), sy(e.y), e.r + 8);
        }
        if (e.kind === "crab") {
          g.lineStyle(5, 0xffc474, 0.9);
          g.beginPath();
          g.arc(
            sx(e.x),
            sy(e.y),
            e.r + 8,
            b.facing - Math.PI / 3,
            b.facing + Math.PI / 3,
          );
          g.strokePath();
        }
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
      this.sprite(
        assetPack.assets["skill.ward"] ? "skill.ward" : "effect.ward",
        p,
        94,
        s.time * 0.08,
        0.23,
      );
      g.lineStyle(2, 0xa3e4ef, 0.6);
      g.strokeCircle(W / 2, H / 2, 43 + Math.sin(s.time * 3) * 2);
    }
    if (p.dash > 0) {
      g.lineStyle(14, 0xa7ead6, 0.3);
      g.lineBetween(W / 2, H / 2, W / 2 - p.dx * 60, H / 2 - p.dy * 60);
    }
    this.sprite(
      "player." + s.character,
      p,
      80 * (1 + Math.sin(s.time * 7) * 0.025),
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
            ? "lance"
            : b.kind;
      this.sprite(
        "projectile." + id,
        b,
        b.r * 3 + 5,
        Math.atan2(b.vy, b.vx) +
          (this.textures.exists("builtin:projectile." + id) &&
          !assetPack.assets["projectile." + id]
            ? 0
            : Math.PI / 2),
        b.enemy ? 1 : 0.75,
        !b.enemy
          ? 0xdbffff
          : b.enemy && !assetPack.assets["projectile.enemy"]
            ? b.status
              ? 0xff6633
              : 0xff6677
            : undefined,
      );
    }
    const danger = this.danger;
    danger.clear();
    this.friendly.clear();
    for (const b of s.bullets)
      if (!b.enemy) {
        const x = sx(b.x),
          y = sy(b.y);
        const speed = Math.max(1, Math.hypot(b.vx, b.vy));
        this.friendly.lineStyle(5, 0x123b60, 1);
        this.friendly.lineBetween(
          x,
          y,
          x - (b.vx / speed) * 14,
          y - (b.vy / speed) * 14,
        );
        this.friendly.lineStyle(2.5, 0x50e9ff, 1);
        this.friendly.lineBetween(
          x,
          y,
          x - (b.vx / speed) * 14,
          y - (b.vy / speed) * 14,
        );
        this.friendly.lineStyle(5, 0x123b60, 1);
        this.friendly.strokeCircle(x, y, b.r + 1);
        this.friendly.lineStyle(2, 0x50e9ff, 1);
        this.friendly.strokeCircle(x, y, b.r + 1);
        this.friendly.fillStyle(0xf1ffff, 0.85);
        this.friendly.fillCircle(x, y, Math.max(1.5, b.r * 0.4));
      }

    // Canvas fills each stage as one nonzero path: overlapping hazards must
    // not accumulate opacity and conceal the player or the remaining gaps.
    for (const warning of [true, false]) {
      danger.fillStyle(0xff4020, warning ? 0.035 : 0.1);
      danger.beginPath();
      for (const z of s.zones)
        if (z.enemy && z.delay > 0 === warning) {
          const x = sx(z.x),
            y = sy(z.y);
          this.zonePath(danger, z, x, y);
        }
      danger.fillPath();
    }
    for (const z of s.zones)
      if (z.enemy) {
        const x = sx(z.x),
          y = sy(z.y);

        danger.lineStyle(6, 0x351426, 0.95);
        danger.beginPath();
        this.zonePath(danger, z, x, y);
        danger.strokePath();
        danger.lineStyle(3, z.delay > 0 ? 0xffb32c : 0xff4828, 1);
        danger.beginPath();
        this.zonePath(danger, z, x, y);
        danger.strokePath();
        if (z.shape && (z.shape.vx || z.shape.vy)) {
          danger.lineStyle(2, 0xffe7a5, 0.8);
          danger.lineBetween(x, y, x + z.shape.vx * 0.6, y + z.shape.vy * 0.6);
        }
        if (z.delay > 0 && !z.shape) {
          danger.lineStyle(2, 0xfff1bc, 0.9);
          danger.strokeCircle(x, y, z.r * Math.max(0.06, 1 - z.delay / 1.6));
        }
      }
    for (const b of s.bullets)
      if (b.enemy) {
        const x = sx(b.x),
          y = sy(b.y),
          r = Math.max(3, b.r);
        if (b.motion && b.motion.wait > 0) {
          const speed = Math.max(1, Math.hypot(b.vx, b.vy));
          danger.lineStyle(3, 0xffbd58, 0.85);
          danger.strokeCircle(x, y, r + 5);
          danger.lineBetween(
            x,
            y,
            x + (b.vx / speed) * 65,
            y + (b.vy / speed) * 65,
          );
          continue;
        }
        if (b.motion && b.motion.track > 0) {
          danger.lineStyle(2, 0xffeeb0, 1);
          danger.strokeRect(x - r - 3, y - r - 3, (r + 3) * 2, (r + 3) * 2);
        }
        danger.fillStyle(0x321122, 1);
        danger.fillCircle(x, y, r + 3);
        danger.fillStyle(0xff4820, 1);
        danger.fillCircle(x, y, r + 1);
        danger.fillStyle(0xfff4ad, 1);
        danger.fillCircle(x, y, Math.max(1.5, r * 0.45));
        danger.lineStyle(2, 0xffab38, 1);
        const speed = Math.max(1, Math.hypot(b.vx, b.vy));
        danger.lineBetween(
          x - (b.vx / speed) * (r + 3),
          y - (b.vy / speed) * (r + 3),
          x - (b.vx / speed) * (r + 7),
          y - (b.vy / speed) * (r + 7),
        );
      }
    for (const f of env.fields)
      if (f.kind === "eclipse") {
        danger.lineStyle(6, 0x351426, 1);
        danger.strokeCircle(sx(f.x), sy(f.y), f.r);
        danger.lineStyle(3, f.delay > 0 ? 0xffb32c : 0xff4828, 1);
        danger.strokeCircle(sx(f.x), sy(f.y), f.r);
      }
    danger.lineStyle(2, 0xffffe5, 0.85);
    danger.strokeCircle(sx(p.x), sy(p.y), 21);
    const limit = busy ? 25 : 90;
    for (const e of w.effects.slice(-limit)) {
      const a = e.life / e.maxLife;
      if (e.kind === "heal") this.sprite("effect.heal", e, 32, 0, a * 0.8);
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
        a * 0.35,
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
