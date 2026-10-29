import { defineConfig } from "vite";
export default defineConfig({
  base: "./",
  build: {
    rollupOptions: { output: { manualChunks: { phaser: ["phaser"] } } },
  },
  server: { host: "0.0.0.0" },
  test: { include: ["tests/**/*.test.ts"], testTimeout: 30000 },
});
