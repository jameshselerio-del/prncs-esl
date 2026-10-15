import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: 'web',
  envDir: '..',
  // Relative base so the build works under GitHub Pages' /<repo>/ path.
  base: './',
  plugins: [react()],
  build: {
    outDir: '../dist/web',
    emptyOutDir: true,
  },
  test: {
    root: '.',
    include: ['shared/**/*.test.ts', 'backend/**/*.test.ts', 'scripts/**/*.test.mjs', 'web/**/*.test.{ts,tsx}'],
  },
});
