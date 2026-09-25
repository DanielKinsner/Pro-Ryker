import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { port: 5210, strictPort: false },
  preview: { port: 5211 },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 4000,
    assetsInlineLimit: 0,
  },
  optimizeDeps: { exclude: ['@dimforge/rapier3d-compat'] },
});
