# atlas — roadmap

What the project needs, in the order it needs it. The detail behind each
decision lives in `CLAUDE.md`; this file is the status board.

## Where it stands — paused mid-fan-out

**63 of 65 monuments have a model file.** `npx tsc --noEmit` clean,
`node scripts/check-world.ts` passing on every count, `pnpm monuments` re-run so
the footprint separation is current.

### Two are not written at all

`guggenheim-bilbao` and `kinderdijk`. Nothing exists for them; the registry
finds monuments by glob, so adding one file each is the whole job. The briefs
that were being worked from:

- **Guggenheim Bilbao** — the hardest shape left. No repetition and no symmetry,
  which is the opposite of the Sydney Opera House's problem (a series of similar
  shells). Its file records three approaches tried; read it first.
- **Kinderdijk** — the monument is *the line of mills*, not a mill. Rows of
  repeated objects with index-driven variation are solved in `stonehenge.ts` and
  `moai-rapa-nui.ts`; still water is solved in `golden-temple.ts`.

### Four landed but were stopped mid-polish

These pass `validate` and typecheck, so the world is consistent — but their
authors were still iterating when the session was paused, and each had already
named the problem it was about to fix. Worth a look before anything else:

| file | what its author last said was wrong |
|---|---|
| `table-mountain.ts` | "the bayed caps crenellated the skyline" — was restoring one straight lip with a continuous brow band |
| `perito-moreno.ts` | "the mass is still a box: its east end is a flat gable and the benches are a flat roof" — was about to bow the plan and sink the benches |
| `moeraki-boulders.ts` | "the bank still reads as three buildings and the hollows aren't legible" |
| `niagara-falls.ts` | had just finished planning and was writing; no complaint recorded |

`charles-bridge.ts` also landed and its author reported no outstanding problem.

### Resuming

1. `pnpm dev`, open `/contact-sheet.html`, and look at the four above.
2. Write the two missing files (one file each, nothing else — see the recipe in
   `src/monuments/contract.ts`).
3. `pnpm monuments` then `pnpm check` after any new footprint lands — the bake
   spreads overlapping monuments apart using the footprints declared in the
   model files, so a new one makes the previous separation stale. `pnpm check`
   asserts exactly that and its failure message says so.
4. Then the full review of 65 on the sheet.

## Done

- **The ground.** 1:50m data (234 countries, 1,556 rings, 97,280 points), land
  built from the real outlines instead of point-sampled off an icosphere. Exact
  coasts, every island down to Formentera. Antarctica and the antimeridian
  special cases deleted rather than ported.
- **Scale.** `PLANET_RADIUS` 4000 -> 16000, every tessellation limit derived from
  a chord-sag budget so the next change is one line. Mallorca went from 59 units
  across to 235.
- **Terrain relief.** One pure `reliefAt` in `terrain.ts`, used by both the mesh
  and the ground under the player's feet. 782,000 triangles, ~1 ms a frame, with
  flat pads under every monument.
- **Movement and travel.** Mouse look, camera-relative `WASD`, jump, a
  distance-driven walk cycle. Walk into the sea and you are in a boat; `F` takes
  off and one held key climbs until the whole globe is in frame.
- **Flags and arrival.** 234 countries, 139 flags drawn in full and 93 with the
  emblem honestly tagged as reduced. Crossing a border is a card with the flag
  and a fact derived from the outlines.
- **Finding and keeping.** Monument pins and a bearing on the minimap, a visited
  set that persists in `localStorage`, and a counter.
- **The monument system.** A contract that refuses to build anything breaking
  it, a glob registry, and a contact sheet that renders every monument against
  its budgets. 65 landmarks placed, snapped to the coast, spread clear of each
  other's footprints, and verified to sit in the country they claim.

## Next, when the last files land

1. Review the full sheet of 65 and send back anything that does not read.
2. Terrain relief under a monument is flattened to a 90-unit disc; a few sites
   (Machu Picchu, Everest) would look better with the pad shaped rather than
   flat.
3. Polish: the loading screen, the border-crossing card's timing, and the
   coastline's ink from orbit (see the non-indexed-normals trap in `CLAUDE.md`).

## Minimum bar

The list of things that, missing any one of them, this is not finished.

| # | Must have | Why it is on this list |
|---|---|---|
| 1 | Islands you can stand on, Mallorca included | An Earth without islands is not an Earth |
| 2 | Coasts that match `countryAt` exactly | Monuments snap to the coast; a mismatch puts them in the sea |
| 3 | Movement with mouse look and an animated avatar | It is the whole verb of the game |
| 4 | ~60 monuments, recognisable at a glance | The point of the project |
| 5 | A way to find them (minimap + compass) | A planet with no map is a walking simulator |
| 6 | Arrival feedback: name, country, flag, one fact | Reaching a monument has to *land* |
| 7 | Travel that is not walking (plane) | 3.5 min per lap on foot, and monuments are far apart |
| 8 | 60 fps on a laptop with the whole world loaded | Portfolio piece: it will be opened on unknown hardware |

Nice to have, in rough order of value: terrain relief, boat, day/night, weather,
a monument counter / "visited" state, sound, shareable permalinks to a place.

---

## 1. Ground

### 1.1 Move to Natural Earth 1:50m

Measured, not guessed:

| | 110m (now) | 50m | 10m |
|---|---|---|---|
| Source | 838 KB | 3.0 MB | 13.3 MB |
| Features | 177 | 242 | — |
| Rings | 288 | 1,620 | — |
| Points | ~25 k | 99,432 | — |
| Spain | **1 polygon** | **12 polygons** | — |

At 50m Spain is: mainland, Mallorca (34 pts), Menorca, Ibiza, Formentera, and
seven Canary islands. That is the fix for the islands, and 50m is the right
step — 10m is 4x the data for detail nobody will see from the ground.

Two things in the bake must change with it:

- `MIN_RING_AREA = 0.35` **must drop to ~0.01**. At 0.35 the new data still
  loses Menorca (0.067), Ibiza (0.060) and every Canary island (max 0.185).
  Mallorca (0.389) would survive by a hair. 900 of the 1,620 rings are under
  0.05 sq deg — that is where the archipelagos live.
- `PRECISION = 2` (~1 km) is fine for the mainland and coarse for a 20 km
  island. Consider 3 for rings under some area.

Expected baked size ~1.1-1.5 MB (110m went 838 KB -> 164 KB, a 5x squeeze).
Fine over the wire, gzipped much less.

### 1.2 Replace the icosphere land with extruded polygons

**This is the significant architectural change in the whole document.**

Today the planet is one icosphere at `DETAIL = 160` (518,420 faces) whose
vertices are pushed out wherever a point-in-polygon test says "land". The
coast is therefore quantised to the vertex grid: 43.8 km. Anything smaller
than that vanishes, and the coastline is a staircase.

Instead:

- **Ocean**: a plain icosphere at radius `R`. Its own chord sag must stay under
  `LAND_HEIGHT`: `R(1-cos(t/2)) < 14` gives `t < 9.6 deg`, so `DETAIL = 7`
  already suffices. Use ~24 for smoothness — **12,500 faces**.
- **Land**: triangulate each ring in lon/lat, project the vertices to
  `R + LAND_HEIGHT`, and build side walls down to `R`. Split any triangle whose
  edge spans more than ~6.8 deg so it does not sink below the sphere
  (`R(1-cos(t/2)) < LAND_HEIGHT/2`). Only continent-sized triangles need it.

Cost at 50m: ~96 k top triangles (n-2 per ring) + ~199 k wall triangles =
**~295 k**, against 518 k today. Less geometry, and:

- Islands appear at their real size, down to Formentera.
- The coast is the actual outline. No staircase, no saw teeth.
- `LAND_HEIGHT` is freed from the "must be under a triangle edge" rule, so the
  coast can become a real cliff — which is exactly what `OutlineEffect` draws
  best. The style gets better, not worse.
- The visible coast and `countryAt` become *the same data*, so snapping a
  monument to land is exact instead of approximate.

**No new dependency**: Three ships a triangulator, `THREE.ShapeUtils.triangulateShape`,
which runs in Node too — so this can happen in `build-countries.mjs` and ship
pre-triangulated, or at load time. Prefer the bake: load time drops.

Two known edge cases, both already understood in `geo.ts`:

- **Antarctica** — the ring encircles the pole and never closes. Close it by
  appending points along lat -90 before triangulating.
- **The antimeridian** — rings crossing +/-180 must be shifted into [0, 360)
  before triangulating (`geo.ts` already computes a `wrapped` flag), or split.

### 1.3 Terrain relief

Land is a flat plate. From the ground the interior of a continent is a desert of
nothing. Once land is real geometry, displacing its vertices is one function.

Open decision: procedural noise (asset-free, keeps the repo rule) versus a baked
elevation raster (real Himalayas, but an external asset). Recommendation: noise,
with a handful of hand-placed ranges where it matters for recognition
(Himalaya, Andes, Alps, Rockies).

---

## 2. How it feels to move

The controller is mathematically right — rotating about the right axis, no pole
singularity — and that part should not be touched. What is missing is
everything above it.

| Problem now | Fix |
|---|---|
| Tank controls: `A`/`D` rotate the body | Mouse look with pointer lock; `WASD` relative to the camera; the avatar turns toward its movement direction |
| Speed is a step function, 0 -> 45 instantly | Accelerate and damp over ~0.25 s |
| Camera pitch is locked | Let it look up — monuments are tall, and you cannot see the top of one |
| The avatar is a capsule that slides | Legs and arms on a sine driven by distance travelled, plus a bob. Cheapest transformation of feel in the whole project |
| No jump | Trivial: integrate along `up`, the radial height loop is already there |
| Camera can clip through land | Push it in when the ray to the player hits ground |
| No lean | Roll the avatar into turns |

### Bugs and inconsistencies found while reading

- `src/main.ts:93` and `src/geo.ts` (the `fetch` error) are **in Spanish**.
  CLAUDE.md says everything in the repo is English.
- `src/main.ts` `goTo()`: `.setLength(player.position.length())` reads the length
  of the vector it has just overwritten, so it is always ~1. It only survives
  because `update()` re-sets the length afterwards — using the **old** height,
  so teleporting from land to ocean starts at the wrong altitude for a moment.
  It can also produce a NaN heading if the new `up` is parallel to the old
  `forward`.
- `player.speed` is written every frame and never read.

---

## 3. The monument contract

The gate. Nothing gets generated in parallel before this exists, or the files
will not compose.

```ts
interface MonumentContext {
  THREE: typeof import('three');
  palette: typeof PALETTE;      // only these colours
  toon(color: number): Material; // the shared factory, nobody makes their own
}

interface Monument {
  id: string;        // 'eiffel-tower'
  name: string;      // 'Eiffel Tower'
  iso: string;       // 'FRA'
  lat: number; lon: number;
  realHeight: number;  // metres, for the info card
  footprint: number;   // units, radius of the base
  build(ctx: MonumentContext): THREE.Group;
}
```

Rules the contract must pin down:

- **The Group faces +Z, base at y = 0**, and stays inside `footprint`.
- **Only `PALETTE` colours, only `ctx.toon`.** This is what makes 60 files by 60
  agents look like one world. It is the single most important rule.
- **No external assets.** Primitives only — that is why the toon style was
  chosen in the first place.
- **A triangle budget** (~1,500?) so a hundred of them do not sink the frame.
- **Scale, and this needs a decision.** `PLANET_RADIUS = 4000` for a 6,371 km
  Earth is roughly 1:1600. At true scale the Eiffel Tower is 0.2 units — a
  speck. At avatar scale (the avatar is ~6.5 units) it would be 1,155 units,
  a quarter of the planet's radius. Neither works. **Proposal: tiers, not real
  metres.** Small 30 units, medium 60, large 100, Eiffel/Burj tier 140. Against
  a 6.5-unit avatar, 100 units reads as monumental without being absurd.

Also needed before step 4:

- **A monument dataset**: name, iso, lat/lon, real height, year, one fact. ~60
  to start.
- **Coast snapping.** Even at 50m a coastal city can land in the sea. Every
  monument's position must be snapped to the nearest land point at bake time and
  the result stored, not recomputed at runtime.
- **Streaming.** Only build the monuments within some radius of the player. This
  is required regardless of the budget, and it is easier to design in now than
  to retrofit.
- **One reference implementation checked in first** — the Eiffel Tower — plus a
  contact sheet page that renders every monument on a grid, so a bad one is
  obvious at a glance.

## 4. Volume: the fan-out

Once the contract holds and three exemplars exist, the rest is genuinely
parallel: one agent, one monument, one file, no shared state. Batch them by
continent so the review is coherent, and review against the contact sheet rather
than file by file. The failure mode to watch is not a broken build — it is 60
monuments that each look fine alone and do not look like the same world, which
is what the palette rule and the shared `toon()` exist to prevent.

## 5. What turns it into a place

- **Minimap.** We already have every country outline in memory. Draw them to a
  2D canvas in an orthographic azimuthal projection centred on the player: a
  small globe that turns as you walk, with pins for monuments. No second render
  pass, and exact by construction.
- **Flags.** Must be generated in code (repo rule). Most flags are bands,
  crosses, cantons, discs and triangles — a compact spec covers ~120 of them
  well; the rest (UK, US, Brazil, Mexico, Portugal) need hand-drawing. Open
  decision: flag colours are *not* palette colours, and that exception has to be
  deliberate. Where they appear: the country card, and a flagpole at monuments.
- **The border-crossing moment.** Today the HUD swaps a text label every 150 ms.
  Making the crossing an event — a card sliding in with the flag, the country
  name and a fact — is one of the cheapest large wins available.
- **Plane and boat.** The plane is the map: `view.height` in `main.ts` is
  already the lever and the fog already opens up with altitude, so taking off
  and seeing the whole planet needs no separate map screen.
- **Visited state.** A counter and a list of what you have found gives the whole
  thing a reason to keep walking.
