import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      thresholds: {
        statements: 55,
        branches: 75,
        functions: 75,
        lines: 55,
      },
      exclude: [
        'node_modules/**',
        'dist/**',
        '**/*.test.ts',
        'prisma/**',
      ],
    },
  },
});
