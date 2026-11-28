import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    environment: 'node',
    restoreMocks: true,
    // Starting the app on an in-memory database takes a few seconds on a slow build machine.
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
