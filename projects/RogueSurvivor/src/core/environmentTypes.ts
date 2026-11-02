import type { Vec, WeaponId } from "./types";
import type { MapId } from "../data/maps";
export type BuffKind =
  | "speed"
  | "haste"
  | "heal"
  | "xp"
  | "slow"
  | "weak"
  | "curseHaste"
  | "curseCooldown"
  | "moon";
export interface Crystal extends Vec {
  id: number;
  hp: number;
  type: "blast" | "xp" | "ice";
}
export interface Candy extends Vec {
  id: number;
  kind: BuffKind;
  life: number;
}
export interface MagicField extends Vec {
  id: number;
  kind: "moon" | "eclipse" | "shield";
  r: number;
  delay: number;
  life: number;
  tick: number;
}
export interface EnvironmentState {
  targets: Partial<Record<WeaponId, number>>;
  schema: 1;
  mapId: MapId;
  crystals: Crystal[];
  destroyed: number[];
  candies: Candy[];
  fields: MagicField[];
  buffs: { kind: BuffKind; life: number }[];
  nextCandy: number;
  nextField: number;
  rule: number;
  hint: boolean;
}
export const emptyEnvironment = (
  mapId: MapId = "forest",
): EnvironmentState => ({
  targets: {},
  schema: 1,
  mapId,
  crystals: [],
  destroyed: [],
  candies: [],
  fields: [],
  buffs: [],
  nextCandy: 3,
  nextField: 4,
  rule: 0,
  hint: false,
});
