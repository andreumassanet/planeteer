import { defineConfig } from 'vite';

export default defineConfig({
  server: { port: 5174, open: false },
  build: {
    rollupOptions: {
      // **The world is the only entry, and the review sheets in `sheets/`
      // are deliberately not here.** They are development tools — the monuments
      // on a grid, the kit's 1,848 variants, a street of vehicles, the body from
      // twelve angles, the craft a player can take with the hero in every seat
      // — and `pnpm dev` serves every one of them with no config at all,
      // because Vite resolves any HTML under the root on request. In
      // production they are a 404, which is the one kind of breakage nobody
      // working in dev can see, so it is written here rather than left to be
      // discovered.
      //
      // Listing them was tried and measured twice, and both measurements say the
      // same thing. `sheets/flags.html` alone took the **world's** first load from
      // 244.5 KB gzipped to 248.4, because `sheets/flags.ts` needs a small
      // corner of Three and Rollup splits the Three chunk in two to serve it.
      // The four that were still listed here on 2026-09-08 cost the same shape
      // of thing and more of it: with them the world's first load was **249.2
      // KB gzipped across 10 chunks**, and with the world alone **245.6 KB in
      // one** — 3.6 KB and nine round trips, paid by the page everyone opens for
      // pages nobody opens in production. Those are that day's sizes: the
      // world's own main chunk had grown to 279.6 KB gzipped by the morning of
      // 2026-09-21 and 293.2 by its evening (the soundscape, the key table, the
      // fades and the HUD's new cards), and the sheets' cost was not re-measured. If a sheet is ever wanted online,
      // give it its own build rather than another entry beside this one.
      input: { main: 'index.html' },
    },
    // There is no `manualChunks` here and that is a decision. Rollup already
    // splits on the graph `main.ts` gives it — see `deferred` in `src/main.ts`,
    // which is what actually moved 155 KB gzipped out of the first load — and a
    // hand-written grouping would have to agree with the review sheets as
    // well, each of which reaches a different part of the same kits. The
    // deferred set is fifteen small chunks; measured at 250 KB/s they are all
    // requested in one go and the extra round trips cost about 46 ms of a
    // 674 ms download, inside a build that lasts seconds.
  },
});
