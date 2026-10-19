import type { Domain, State } from "./types";

export function inDomain(value: unknown, domain: Domain): boolean {
  if (domain.type === "int")
    return (
      typeof value === "number" &&
      Number.isSafeInteger(value) &&
      value >= domain.min &&
      value <= domain.max
    );
  if (domain.type === "bool") return typeof value === "boolean";
  return typeof value === "string" && domain.values.includes(value);
}
export function stateKey(state: State, names: string[]): string {
  return JSON.stringify(names.map((name) => state[name]));
}
export function canonicalState(state: State, names: string[]): State {
  return Object.fromEntries(names.map((name) => [name, state[name]]));
}
