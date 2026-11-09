import { CHARACTER_SHEETS } from "./characterAnimations";
import { WORLD_VISUALS } from "./worldVisuals";
/** Original generated art, independent of all collision and rule data. */
export const VISUALS: Record<string, string> = {
  ...WORLD_VISUALS,
  ...CHARACTER_SHEETS,
  "portrait.ranger": "v1.6/characters/ranger/portrait.webp",
  "player.ranger": "v1.6/characters/ranger/fallback.webp",
  "avatar.ranger": "v1.6/characters/ranger/avatar.webp",
  "enemy.crawler": "enemies/crawler.webp",
  "portrait.knight": "v1.6/characters/knight/portrait.webp",
  "player.knight": "v1.6/characters/knight/fallback.webp",
  "avatar.knight": "v1.6/characters/knight/avatar.webp",
  "portrait.mage": "v1.6/characters/mage/portrait.webp",
  "player.mage": "v1.6/characters/mage/fallback.webp",
  "avatar.mage": "v1.6/characters/mage/avatar.webp",
  "enemy.runner": "enemies/runner.webp",
  "enemy.archer": "enemies/archer.webp",
  "enemy.seer": "enemies/seer.webp",
  "enemy.shaman": "enemies/shaman.webp",
  "enemy.guard": "enemies/guard.webp",
  "enemy.bomber": "enemies/bomber.webp",
  "enemy.warden": "enemies/warden.webp",
  "enemy.witch": "enemies/witch.webp",
  "enemy.titan": "enemies/titan.webp",
  "weapon.bow": "weapons/bow.webp",
  "weapon.blade": "weapons/blade.webp",
  "weapon.ember": "weapons/ember.webp",
  "weapon.orbit": "weapons/orbit.webp",
  "weapon.drone": "weapons/drone.webp",
  "skill.fire": "effects/fire.webp",
  "skill.ice": "effects/ice.webp",
  "skill.lance": "effects/lance.webp",
  "skill.ward": "effects/ward.webp",
  "skill.bloom": "effects/bloom.webp",
  "skill.storm": "effects/storm.webp",
  "card.shuffle": "cards/shuffle.webp",
  "card.treasure": "cards/treasure.webp",
  "card.negative": "cards/negative.webp",
  "card.lucky": "cards/lucky.webp",
  "ui.gem": "ui/gem.webp",
  "map.rock": "maps/rock.webp",
  "map.flower": "maps/flower.webp",
  "map.tree": "maps/tree.webp",
  "map.obelisk": "maps/obelisk.webp",
  "projectile.bow": "effects/bow.webp",
  "projectile.ember": "effects/ember.webp",
  "projectile.drone": "effects/drone.webp",
  "projectile.enemy": "effects/enemy.webp",
  "effect.bloom": "effects/bloom.webp",
  "effect.ward": "effects/ward.webp",
  "projectile.lance": "effects/enemy.webp",
  "projectile.blade": "effects/bow.webp",
  "projectile.orbit": "effects/enemy.webp",
  "card.common": "cards/lucky.webp",
  "card.rare": "effects/ice.webp",
  "card.epic": "effects/storm.webp",
  "card.mechanism": "effects/lance.webp",
  "map.ground": "maps/grass.webp",
  "ui.world": "ui/world.webp",
};
export const artUrl = (id: string) =>
  VISUALS[id] ? `${import.meta.env.BASE_URL}assets/${VISUALS[id]}` : undefined;
export function cardArt(u: {
  id: string;
  polarity: string;
  rarity: number;
  weapon?: string;
  maxStacks: number | null;
}) {
  const coreIcons: Record<string, string> = {
    crystal_fracture: "skill.ice",
    ember_cycle: "weapon.ember",
    blood_hunt: "skill.lance",
    orbit_resonance: "weapon.orbit",
    star_chain: "skill.fire",
    final_judgment: "skill.storm",
    star_focus: "weapon.bow",
    twin_resonance: "weapon.drone",
    frostfire: "skill.ice",
    glass_comet: "skill.ward",
    crit_damage: "skill.lance",
    boss_hunter: "enemy.titan",
    burning_judge: "weapon.ember",
  };
  return (
    coreIcons[u.id] ||
    (u.id === "shuffle"
      ? "card.shuffle"
      : u.polarity === "negative"
        ? "card.negative"
        : u.id.startsWith("chest_")
          ? "card.treasure"
          : u.weapon
            ? "weapon." + u.weapon
            : u.id === "reroll"
              ? "card.lucky"
              : u.maxStacks !== null
                ? "card.mechanism"
                : "card." +
                  (["common", "rare", "epic", "epic"][u.rarity] || "common"))
  );
}
