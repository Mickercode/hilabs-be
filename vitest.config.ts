import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Vite resolves tsconfig path aliases natively, so the vite-tsconfig-paths plugin is not
  // needed. It also peers on TypeScript 5 while this project is on 6, which left the lockfile
  // unresolvable by `npm ci` on CI.
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['**/*.spec.ts'],
  },
});
