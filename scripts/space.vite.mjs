// The space kit sheet's own build, for a headless screenshot: `pnpm dev`
// serves `sheets/space.html` with no config, but the dev server aborts in a
// headless Chrome, so a shot is taken against a preview of this build.
//
//   npx vite build --config scripts/space.vite.mjs
//   npx vite preview --config scripts/space.vite.mjs     # http://localhost:5394/sheets/space.html
//
// It reads only what `pnpm space-kit` wrote under public/models/space/.
import { join, normalize } from 'node:path';

const ROOT = normalize(join(import.meta.dirname, '..'));

export default {
  root: ROOT,
  logLevel: 'warn',
  build: {
    outDir: join(ROOT, 'dist/space'),
    emptyOutDir: true,
    chunkSizeWarningLimit: 5000,
    rollupOptions: { input: { space: join(ROOT, 'sheets/space.html') } },
  },
  preview: { port: 5394, strictPort: true },
};
