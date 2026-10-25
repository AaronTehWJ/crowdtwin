import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

export default defineConfig(({ mode }) => ({
  server: { proxy: { '/api': loadEnv(mode, process.cwd(), '').API_PROXY_TARGET || 'http://127.0.0.1:4000' } },
  test: { environment: 'jsdom', include: ['test/**/*.test.{ts,tsx}'], restoreMocks: true },
}));
