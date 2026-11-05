import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: [
      'tests/neighborhood-insights.test.ts',
      'tests/**/*.vitest.test.ts',
      'src/**/*.test.ts',
    ],
  },
});
