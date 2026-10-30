import type { Stat } from "./expedition";
export const LEGACY_MODIFIERS: Record<string, { stat: Stat; amount: number }> =
  {
    vitality: { stat: "maxHp", amount: 25 },
    stride: { stat: "speed", amount: 15 },
    critical: { stat: "crit", amount: 0.07 },
    renew: { stat: "regen", amount: 0.4 },
    magnet: { stat: "magnet", amount: 55 },
    haste: { stat: "cooldown", amount: -0.08 },
    power: { stat: "attack", amount: 0.12 },
  };
