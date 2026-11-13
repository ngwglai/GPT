import { defineConfig } from 'vitest/config';
import { cloudflareTest } from '@cloudflare/vitest-plugin';
export default defineConfig({
  plugins: [cloudflareTest({ wrangler: { configPath: './wrangler.jsonc' }, miniflare: { bindings: { MCP_ACCESS_TOKEN: 'test-access-token-at-least-32-characters', BILI_SESSDATA: '', BILI_JCT: '', BILI_BUVID3: '' } } })],
  test: { testTimeout: 15000 }
});
