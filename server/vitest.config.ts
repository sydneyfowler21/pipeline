import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    globalSetup: './test/global-setup.ts',
    setupFiles: ['./test/setup.ts'],
    fileParallelism: false,
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    hookTimeout: 30_000,
    testTimeout: 30_000,
  },
});
