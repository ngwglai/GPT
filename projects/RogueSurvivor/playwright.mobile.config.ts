import { defineConfig } from "@playwright/test";
import base from "./playwright.config";
export default defineConfig({
  ...base,
  testMatch: [
    "mobile.spec.ts",
    "reforge.spec.ts",
    "respite.spec.ts",
    "mimics.spec.ts",
    "enemy-growth.spec.ts",
  ],
  use: { ...base.use, baseURL: "http://127.0.0.1:4175", launchOptions: {} },
  projects: [
    { name: "webkit", use: { browserName: "webkit", launchOptions: {} } },
  ],
  webServer: {
    command: "npm run preview -- --port 4175 --strictPort",
    port: 4175,
    reuseExistingServer: !process.env.CI,
  },
});
