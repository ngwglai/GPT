import { defineConfig } from "vitest/config";
export default defineConfig({
  base: "./",
  plugins: [
    {
      name: "local-development-csp",
      transformIndexHtml(html, context) {
        // Vite injects styles and uses a local HMR socket only during development.
        // Built files retain the strict no-connect policy from index.html.
        return context.server
          ? html
              .replace("style-src 'self';", "style-src 'self' 'unsafe-inline';")
              .replace(
                "connect-src 'none';",
                "connect-src 'self' ws://127.0.0.1:*;",
              )
          : html;
      },
    },
  ],
  test: { include: ["tests/**/*.test.ts"] },
});
