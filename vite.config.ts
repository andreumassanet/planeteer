import { defineConfig } from 'vite';

export default defineConfig({
  server: { port: 5174, open: false },
  build: {
    rollupOptions: {
      // The world, and the review sheets that stand between everything else and
      // the world: monuments on the contact sheet, the settlement kit on the
      // scenery sheet, the vehicles on the traffic sheet. Dev serves them all with no config; only the production
      // build needs to be told the extra entries exist.
      //
      // **`flags.html` is deliberately not here and it is not free either way.**
      // It is served by `pnpm dev` like every other sheet and it is a 404 in
      // production, which is the one kind of breakage nobody working in dev can
      // see. Adding it was tried and measured: `flags-page.ts` needs a small
      // corner of Three, so Rollup splits the Three chunk in two to serve it and
      // the *world's* first load goes **244.5 KB gzipped to 248.4** — 3.9 KB
      // paid by the page everyone opens, for a page nobody opens in production.
      // If it is ever wanted online, give it its own build rather than another
      // entry beside this one.
      input: {
        main: 'index.html',
        contactSheet: 'contact-sheet.html',
        scenerySheet: 'scenery-sheet.html',
        avatarSheet: 'avatar-sheet.html',
        trafficSheet: 'traffic-sheet.html',
      },
    },
    // There is no `manualChunks` here and that is a decision. Rollup already
    // splits on the graph `main.ts` gives it — see `deferred` in `src/main.ts`,
    // which is what actually moved 155 KB gzipped out of the first load — and a
    // hand-written grouping would have to agree with the five review sheets as
    // well, each of which reaches a different part of the same kits. The
    // deferred set is fifteen small chunks; measured at 250 KB/s they are all
    // requested in one go and the extra round trips cost about 46 ms of a
    // 674 ms download, inside a build that lasts seconds.
  },
});
