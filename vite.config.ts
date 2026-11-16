import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

/**
 * The Physics lab bundles the sealed reference fixture. Its `knownLimits` notes are verification-process prose that
 * the game never shows, so the build drops them (the source file stays untouched; node tests read it directly).
 */
function stripFixtureNotes(): Plugin {
  return {
    name: 'strip-fixture-notes',
    enforce: 'pre',
    transform(code, id) {
      if (!id.split('?')[0].endsWith('reference/fixtures/scenarios.json')) return null;
      const data = JSON.parse(code) as { scenarios?: Record<string, unknown>[] };
      for (const sc of data.scenarios ?? []) delete sc.knownLimits;
      return { code: JSON.stringify(data), map: null };
    },
  };
}

export default defineConfig({
  plugins: [stripFixtureNotes()],
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  build: {
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('node_modules/three/')) return 'three';
          return undefined;
        },
      },
    },
  },
});
