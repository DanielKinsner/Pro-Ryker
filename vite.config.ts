import { defineConfig, type Plugin } from 'vite';
import { rmSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Never ship licensed/private files from public/: the ViralHog clip (always stripped) and the
 * purchased model binaries (stripped unless INCLUDE_MODELS=1; production loads them from
 * VITE_MODEL_BASE instead). The small fit/manifest JSON files stay.
 */
function stripPrivate(): Plugin {
  let outDir = 'dist';
  return {
    name: 'strip-private-assets',
    apply: 'build',
    configResolved(c) {
      outDir = c.build.outDir;
    },
    closeBundle() {
      const media = join(outDir, 'media');
      if (existsSync(media)) rmSync(media, { recursive: true, force: true });
      const models = join(outDir, 'assets', 'models');
      if (process.env.INCLUDE_MODELS !== '1' && existsSync(models)) {
        for (const f of readdirSync(models)) if (/\.(glb|gltf|bin)$/i.test(f) || f === 'provenance.json') rmSync(join(models, f));
      }
    },
  };
}

export default defineConfig({
  base: './',
  server: { port: 5210, strictPort: false },
  preview: { port: 5211 },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 4000,
    assetsInlineLimit: 0,
  },
  plugins: [stripPrivate()],
  optimizeDeps: { exclude: ['@dimforge/rapier3d-compat'] },
});
