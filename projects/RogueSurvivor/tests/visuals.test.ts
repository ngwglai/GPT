import { expect, test } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { VISUALS, cardArt } from "../src/data/visuals";
import { ASSET_IDS } from "../src/services/assets";
import {
  UPGRADES,
  CHARACTERS,
  ENEMIES,
  SKILLS,
  WEAPONS,
} from "../src/data/content";
test("every character, enemy, weapon and skill has actual generated image coverage", () => {
  for (const c of CHARACTERS)
    for (const kind of ["player", "portrait", "avatar"])
      expect(VISUALS[kind + "." + c.id]).toBeTruthy();
  for (const [prefix, data] of [
    ["enemy", ENEMIES],
    ["weapon", WEAPONS],
    ["skill", SKILLS],
  ] as const)
    for (const id of Object.keys(data))
      expect(VISUALS[prefix + "." + id]).toBeTruthy();
  for (const path of Object.values(VISUALS)) {
    expect(path).not.toContain("..");
    const file = "public/assets/" + path;
    expect(existsSync(file)).toBe(true);
    expect(readFileSync(file).subarray(0, 4).toString()).toBe("RIFF");
  }
  expect(new Set(ASSET_IDS.map((a) => a.id)).size).toBe(ASSET_IDS.length);
  for (const id of Object.keys(VISUALS))
    expect(ASSET_IDS.some((a) => a.id === id)).toBe(true);
});
test("all cards select a real icon and destiny and negative art stay distinct", () => {
  for (const u of UPGRADES) expect(VISUALS[cardArt(u)]).toBeTruthy();
  expect(cardArt(UPGRADES.find((u) => u.id === "shuffle")!)).toBe(
    "card.shuffle",
  );
  for (const u of UPGRADES.filter((u) => u.polarity === "negative"))
    expect(cardArt(u)).toBe("card.negative");
});
