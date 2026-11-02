import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests",
  testMatch: "*.spec.ts",
  timeout: 45000,
  expect: { timeout: 10000 },
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:4174",
    viewport: { width: 1440, height: 900 },
    headless: true,
    launchOptions: {
      // Full Chromium's modern headless mode avoids legacy Shell
      // context/Skia mailbox failures; keep the same WebGL and media coverage.
      ...(!process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
        ? { channel: "chromium" }
        : {}),
      ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
        ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
        : {}),
      args: [
        "--no-sandbox",
        "--use-angle=swiftshader",
        "--enable-unsafe-swiftshader",
      ],
    },
    screenshot: "only-on-failure",
    // DOM/network diagnostics need no continuous GPU readback on software CI.
    trace: { mode: "retain-on-failure", screenshots: false },
  },
  webServer: {
    command: "npm run preview -- --port 4174 --strictPort",
    port: 4174,
    reuseExistingServer: !process.env.CI,
  },
});
