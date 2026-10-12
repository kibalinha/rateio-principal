import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.spec.ts'],
    exclude: ['e2e/**', 'node_modules/**', 'dist/**'],
  },
});
