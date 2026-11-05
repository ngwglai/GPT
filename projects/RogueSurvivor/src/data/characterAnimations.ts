/** Presentation only. Timings never change collisions, skill release or combat cooldowns. */
export const CHARACTER_ACTIONS = {
  idle: { frames: 8, fps: 8, loop: true, priority: 0 },
  run: { frames: 8, fps: 12, loop: true, priority: 1 },
  cast: { frames: 8, fps: 12, loop: false, priority: 2 },
  dash: { frames: 8, fps: 16, loop: false, priority: 3 },
  hurt: { frames: 8, fps: 20, loop: false, priority: 4 },
  revive: { frames: 8, fps: 8, loop: false, priority: 5 },
  defeat: { frames: 8, fps: 6, loop: false, priority: 6 },
} as const;
export type CharacterAction = keyof typeof CHARACTER_ACTIONS;
export const ACTION_NAMES: Record<CharacterAction, string> = {
  idle: "待机",
  run: "奔跑",
  dash: "闪避",
  cast: "施法",
  hurt: "受伤",
  defeat: "战败",
  revive: "复活",
};
export const FRAME_SIZE = 192;
export const actionDuration = (action: CharacterAction) =>
  CHARACTER_ACTIONS[action].frames / CHARACTER_ACTIONS[action].fps;
export const CHARACTER_SHEETS = Object.fromEntries(
  ["ranger", "knight", "mage"].flatMap((character) =>
    Object.keys(CHARACTER_ACTIONS).map((action) => [
      `animation.${character}.${action}`,
      `v1.6/characters/${character}/${action}.webp`,
    ]),
  ),
);
export function animationId(character: string, action: CharacterAction) {
  return `animation.${character}.${action}`;
}
