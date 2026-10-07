import { defineConfig } from 'vite';

export default defineConfig({
  server: { port: 5174, open: false },
  build: {
    rollupOptions: {
      // The world, `index.html`, is the only entry.
      input: { main: 'index.html' },
    },
    // There is no `manualChunks` here and that is a decision. Rollup already
    // splits on the graph `main.ts` gives it — see `deferred` in `src/main.ts`,
    // which is what actually moved 155 KB gzipped out of the first load — and a
    // hand-written grouping would only restate it. The deferred set is fifteen
    // small chunks; measured at 250 KB/s they are all requested in one go and
    // the extra round trips cost about 46 ms of a 674 ms download, inside a
    // build that lasts seconds.
  },
});
