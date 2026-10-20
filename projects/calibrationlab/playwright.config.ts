import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  use: {
    baseURL: "http://127.0.0.1:4190",
    trace: "retain-on-failure",
    launchOptions: process.env.CHROMIUM_PATH
      ? { executablePath: process.env.CHROMIUM_PATH }
      : {},
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run preview -- --port 4190 --strictPort",
    url: "http://127.0.0.1:4190",
    reuseExistingServer: false,
  },
});
