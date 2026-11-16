import { defineConfig } from "@playwright/test";
import base from "./playwright.config";
// A real 16-minute game can exceed routine UI test budgets on software rendering.
// Run explicitly when changing the spectator clock/controller, before deployment.
export default defineConfig({
  ...base,
  testMatch: "ai-completion.long.ts",
});
