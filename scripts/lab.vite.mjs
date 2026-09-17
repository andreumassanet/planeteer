// The lab's build: the world and `sheets/lab.html`, previewed with the raw CC0
// packs served at /lab-assets/ from ../.cache/assets, which the bakes read and
// the repo does not ship.
//
//   npx vite build --config scripts/lab.vite.mjs
//   npx vite preview --config scripts/lab.vite.mjs     # http://localhost:5393/sheets/lab.html?set=kit
//
// A preview and not `pnpm dev`: the dev server aborts in a headless Chrome, and
// the lab's screenshots are taken headless (`scripts/shot.mjs`). The sets that
// read only the baked kit (`kit`, `town-kit`, `young`, `jump`) work anywhere.
import { createReadStream, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';

const ROOT = normalize(join(import.meta.dirname, '..'));
const CACHE = normalize(join(ROOT, '../.cache/assets'));
const TYPES = {
  '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.bin': 'application/octet-stream', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.json': 'application/json', '.obj': 'text/plain', '.mtl': 'text/plain', '.fbx': 'application/octet-stream',
};

const labAssets = {
  name: 'lab-assets',
  configurePreviewServer(server) {
    server.middlewares.use('/lab-assets', (req, res, next) => {
      const path = normalize(join(CACHE, decodeURIComponent(req.url.split('?')[0])));
      if (!path.startsWith(CACHE)) return next();
      try {
        const stat = statSync(path);
        if (!stat.isFile()) return next();
        res.setHeader('content-type', TYPES[extname(path).toLowerCase()] ?? 'application/octet-stream');
        res.setHeader('content-length', stat.size);
        createReadStream(path).pipe(res);
      } catch {
        next();
      }
    });
  },
};

export default {
  root: ROOT,
  logLevel: 'warn',
  plugins: [labAssets],
  build: {
    outDir: join(ROOT, 'dist/lab'),
    emptyOutDir: true,
    chunkSizeWarningLimit: 5000,
    rollupOptions: { input: { main: join(ROOT, 'index.html'), lab: join(ROOT, 'sheets/lab.html') } },
  },
  preview: { port: 5393, strictPort: true },
};
