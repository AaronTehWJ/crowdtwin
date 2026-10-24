import { defineConfig } from 'vitest/config';

export default defineConfig({
  server: { proxy: { '/api': 'http://127.0.0.1:4000' } },
  test: { environment: 'jsdom', include: ['test/**/*.test.{ts,tsx}'], restoreMocks: true },
});
