import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: '/GPT/entropylab/',
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.{ts,tsx}'],
    restoreMocks: true,
  },
});
