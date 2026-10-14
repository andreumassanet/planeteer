import { defineConfig } from 'vite';

export default defineConfig({
  server: { port: 5174, open: false },
  build: {
    rollupOptions: {
      // `index.html` is the only entry.
      input: { main: 'index.html' },
    },
    // No `manualChunks`: Rollup already splits along the dynamic imports in
    // `src/app/deferred.ts`, and the deferred chunks are fetched together.
  },
});
