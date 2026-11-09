import type { Stat } from "./expedition";
export const LEGACY_MODIFIERS: Record<string, { stat: Stat; amount: number }> =
  {
    vitality: { stat: "maxHp", amount: 40 },
    stride: { stat: "speed", amount: 22 },
    critical: { stat: "crit", amount: 0.1 },
    renew: { stat: "regen", amount: 0.65 },
    magnet: { stat: "magnet", amount: 85 },
    haste: { stat: "cooldown", amount: -0.12 },
    power: { stat: "attack", amount: 0.2 },
  };
