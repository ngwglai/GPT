import { defineConfig } from "vite";
export default defineConfig({
  base: "./",
  build: {
    rollupOptions: {
      input: { main: "index.html", ai: "ai.html" },
      output: { manualChunks: { phaser: ["phaser"] } },
    },
  },
  server: { host: "0.0.0.0" },
  test: { include: ["tests/**/*.test.ts"], testTimeout: 30000 },
});
