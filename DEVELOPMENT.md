# Developing atlas

Use Node.js 22.18 or later and the pnpm version pinned in `package.json`:

```sh
npm install --global pnpm@11.3.0
pnpm install --frozen-lockfile
pnpm dev
```

The development server opens at <http://localhost:5174>. The review pages under
`/sheets/` are available there; they are deliberately excluded from production.

The world data, audio and models in `public/` are committed. A fresh checkout
can run without downloading or rebuilding their original sources. See
`scripts/sources.json` and `pnpm sources` when changing those assets.

## Checks

Run the same checks as CI:

```sh
pnpm typecheck
pnpm input
pnpm check
pnpm traffic
pnpm scenery
pnpm people
pnpm life
pnpm fauna
pnpm system
pnpm solids
pnpm build
pnpm browser
```

`pnpm check` validates the world and its baked data. `pnpm input` tests keyboard
event sequences without a browser. The other headless checks cover the model
kits, animation, orbits and collisions; the crowd check can take several minutes.

`pnpm browser` requires Chrome or Chromium and runs three checks:

- `pnpm shot`: browser-driver failures, timeouts, interruption and cleanup.
- `pnpm ui`: keyboard focus, modal controls and unavailable pointer lock.
- `pnpm graphics`: the built world's startup, settings, map, shaders and WebGL.

The UI and graphics checks start and stop their own local servers. Build first
so the graphics check uses the latest code. To select a different browser:

```sh
CHROME_BIN=/usr/bin/chromium pnpm browser
```

The default executable is `google-chrome-stable`. `pnpm graphics URL` can also
check an already running production preview.

## Captures

With `pnpm preview` running:

```sh
node scripts/shot.mjs --url 'http://localhost:4173/?at=39.5696,2.6502' \
  --wait 60000 --shot /tmp/atlas.png --log
```

`--eval` accepts an expression and awaits its result. An evaluation failure
returns a nonzero exit code. `--timeout` sets the total deadline in milliseconds
(120000 by default); browser profiles are removed when the command finishes.
Set `SHOT_PROFILE_DIR` if the default temporary filesystem has limited space.
