# atlas

An explorer of Earth. A walkable planet holding the world's notable landmarks —
on foot, by boat and by plane, with no loading screen between them and no map
screen you have to earn. Three.js and TypeScript, no engine, and no asset larger
than the code that generates it.

```sh
pnpm install
pnpm dev        # http://localhost:5174
```

`W` `A` `S` `D` move · mouse look · `Shift` run · `Space` jump · `E` go ashore ·
`F` fly and land · `V` first person · `M` the map · `Tab` pick a landmark ·
`[` `]` render detail

## What is in it

| | |
|---|---|
| countries, as their real outlines | **234**, 1,583 rings, 102,793 points |
| the land you walk on | **1,644,313 triangles**, built from those outlines in 6.2 s |
| towns and cities, with real names | **29,545**, of which 9,734 are built |
| roads joining them | **17,238**, none of which crosses water |
| lakes cut out of the land | **27**, every one over half a true square degree |
| landmarks, each a hand-written file | **85** in 59 countries |
| kit parts — houses, trees, people, vehicles | 22 scenic, 18 vehicles, 6 animals, a crowd |
| all of that, on the wire | **604 KB**, and 17 ms to decode |
| the code that has to arrive first | **245.6 KB** gzipped, 182 of it Three |

The sun is where the sun actually is. The chip at the top tells you the town you
are in and the civil time of the country it is in. Walk into the sea and you are
in a boat; press `F` and you are in a plane, and climbing high enough opens the
fog until the whole globe is in the lens — which is why there is no separate map
screen, only a chart on `M` for the half of the planet you cannot see from up
there.

Walk up to a landmark and it introduces itself: which one of the eighty-five
this is, the country, how tall it stands and the year it was finished. Crossing
a border does the same from the other side of the screen, with the flag and a
fact about the country. At night the towns light their windows, and go to bed —
by five in the morning a town is at 29% of its evening, and what is still burning
is the street lamps, which are the council's and not a household's.

## How it is built

**The data is real and the geometry is generated.** Every coordinate comes from
a public dataset; every triangle is written in code. There is no modelling tool
anywhere in this repo and no texture, mesh or font is loaded at runtime.

**The land is the country outlines themselves** — triangulated with Three's own
ear clipper, projected onto the sphere, displaced by a relief field and given a
coast that ramps down into the water. The ocean underneath is a plain icosphere.
The consequence is the point: **the coast you can see and the coast `countryAt`
reports are the same array**, so snapping a landmark to a shoreline is exact
rather than approximate.

**One definition of everything.** `reliefAt` is the only answer to how high the
ground is, `biomeAt` to what it is made of, `radiusFor` to how big a town is,
`groundColorAt` to what colour the ground is. The mesh and the player's feet read
the same functions, because the alternative — two definitions that agree today —
is most of the bug list below.

**The shading is cel**: `MeshToonMaterial` on a four-band ramp with an
inverted-hull ink outline. That is not only taste. Outlines and flat bands are
what make it viable to generate hundreds of buildings in code: a crude box under
realistic light looks like a mistake, and the same box with an ink line around it
looks like a decision.

**The palette is 24 colours** taken from Bruno Simon's folio-2025, and
everything in the world is painted out of it. One source is what makes objects
written by different hands look like one place.

**The data ships as bytes, not as JSON.** The outlines, the towns and the roads
are integers at the precision the bakes round to — delta-coded along a coastline,
split into byte planes where they are not ordered, gzipped by the bake rather
than by the CDN. It took the first load from **1,251 KB to 604**, and because a
varint is cheaper to walk than a number is to parse, decoding all three is
**17 ms against 26** for the JSON it replaces. Both halves of the format are one
file, `src/pack.ts`, and every bake decodes its own output and refuses to write
if a single coordinate moved.

**And the code in front of it waits for nothing it does not need.** A module in
the initial graph has to arrive *and be parsed* before `main.ts` runs a line, so
the browser was fetching eighty-five landmark models, three whole kits, a crowd
and 234 flags before it asked for the first byte of coastline. None of them is
touched until the fifth stage of the loading screen, and the four stages in front
of them are seconds of ocean, land and weather. They are nine `import()`s now,
fired once the data is in and awaited at the stage that needs them, which lands
them inside the build: **403 KB gzipped down to 244** when it was measured on
2026-09-05, and on a link capped at 250 KB/s the first frame arrived at **11.4 s
against 12.1**, and at 100 KB/s **16.5 against 18.0**. The world has grown since
and the review sheets have left the build; the same first load is **245.6 KB in
one chunk** today. Nothing is lazy once you are playing — every one is awaited
before the world appears, so there is no landmark that pops in the first time you
fly near it.

**It is checked, not eyeballed.** `pnpm check` builds the whole world headlessly
and asserts a hundred and two things: that Reykjavík is in Iceland, that the
planet is right-handed, that the coastal cliffs face the sea, that no road
crosses water, that every clock reads its real local time, that 25 named places
land in the biome an atlas says they are in. Every bug worth writing down below was found by
a table, not by a screenshot.

## Decisions that cost a bug

**The country index is not rasterised.** The first version drew countries into a
canvas encoding the index in the colour and read the pixels back. Shorter, and
wrong: `fill()` antialiases, so every coastal pixel blended its index with its
neighbour's. New York reported "China" and Sydney "Argentina" — both coastal, and
the coast is exactly where the cities and the landmarks are. It is exact
point-in-polygon now, 2 µs a query.

**You cannot draw an island by point-sampling a sphere.** The planet used to be
one icosphere whose vertices were pushed outward wherever a point-in-polygon test
said "land". Those vertices sat 43.8 km apart, so Mallorca came out as two
triangles and Ibiza fell between them and did not exist. Drawing Ibiza that way
needs 9.9 million faces. Building the land from the polygons instead cost *fewer*
triangles than it replaced, and every island down to Formentera is there.

**And the data has to have the island in it.** At 1:110m, Spain is a single
polygon — no Balearics, no Canaries. No filter tuning recovers what is not in the
file. The same lesson came back years later in a different costume: the towns
were sparse because Natural Earth's populated places is a *cartographic* file
that gives Spain 48 entries, and the fix was a gazetteer, not a smarter filter.

**The planet was mirrored for months and nothing in it could tell.** Every
conversion used `z = +cos(lat)·sin(lon)`, which puts east where west belongs. A
mirrored globe is perfectly self-consistent — the countries are in the right
places relative to each other, the landmarks land in the right countries, the map
agrees with the mesh — so every check passed and only the shape of Italy gave it
away. It is fixed in all fifteen conversions and asserted now. It has since
turned up twice more in code written after the fix: the flat pads under the
landmarks were being cut at the opposite longitude, and the minimap had east and
west swapped since the day it was written.

**A reflected matrix turns an instanced mesh into a solid ink blob.** An
`InstancedMesh` whose matrices have negative determinant renders entirely in the
outline colour, because a reflection flips the winding and the inverted hull ends
up in front of the thing it was meant to outline. What makes it a trap rather
than a bug is that ordinary meshes cannot show it: `setFromRotationMatrix`
silently discards the reflection. The same wrong basis looks fine on one mesh and
is catastrophic on ten thousand.

**Relief is temperature.** Adding a new octave of terrain noise cooled the whole
planet, because the noise had a non-zero mean and the biome model takes warmth
from latitude *minus* elevation. Scotland turned boreal and the Canadian Shield
turned to tundra. Measure a relief term's mean before adding it, and subtract it.

**A cab is sized off the elbows.** A seated person is 1.96 across the hips, 2.60
across the shoulders and 3.91 across the elbows, and the number to build to is
none of those — it is 4.27, the widest the character generator can draw. Size a
cab off the shoulders and every occupant's arms are through the doors, and
nothing in the model or the validator notices, because the seat is legal and the
roof clears.

There are **303** of these in `docs/traps.md`, each with the measurement that
proves it, grouped by the files they govern. It is the most useful file in the
repo.

## Data and credits

**Country outlines, and the shape of the planet itself: [Natural Earth] 1:50m —
public domain.** The land mesh *is* those outlines, triangulated and projected.

**Settlements: [GeoNames] `cities5000` and `countryInfo` — © GeoNames, licensed
under [CC BY 4.0].** 29,545 towns and cities with real names, coordinates and
populations, thinned so that no two are built on the same ground. Everything
inhabited stands where GeoNames says people live.

GeoNames' licence asks for attribution and this is it, alongside the credit on
the loading screen. Nothing is modified beyond what `scripts/build-places.mjs`
documents: rows are dropped, coordinates are rounded to three decimals,
populations to three significant figures, and places that fall in the sea against
a 1:50m coastline are moved to the nearest land. Natural Earth asks for nothing
and gets a credit anyway.

Time zones come from the platform's own `Intl`, so this repo ships zone *names*
and not a single line of daylight-saving arithmetic.

[Natural Earth]: https://www.naturalearthdata.com/
[GeoNames]: https://www.geonames.org/
[CC BY 4.0]: https://creativecommons.org/licenses/by/4.0/

## Working on it

```sh
pnpm check      # the whole world, headless — 102 assertions
pnpm scenery    # the kit: budgets, tones, silhouettes, determinism
pnpm people     # the crowd: silhouettes, dress, determinism
pnpm traffic    # the vehicles: distinctness, fit, budgets
pnpm fauna      # the animals: the gait, the floor, where a herd stands
pnpm life       # the movers: routes, the walk, a day of clock
pnpm system     # the orbits against the almanac, and the scale
pnpm typecheck
pnpm data       # re-bake the outlines      (only when the source changes)
pnpm lakes      # re-bake the lakes         (always after `pnpm data`)
pnpm places     # re-bake the settlements
pnpm roads      # re-join them; always after `pnpm places`
pnpm monuments  # re-snap the landmarks to the coast
```

Seven review sheets live in `sheets/` and `pnpm dev` serves every one:
`/sheets/monuments.html` for the landmarks, `/sheets/scenery.html` for the kit and
the crowd, `/sheets/traffic.html` for the vehicles, `/sheets/fauna.html` for the
animals, `/sheets/avatar.html` for the player, `/sheets/menu.html` for the front
door and `/sheets/flags.html` for all 234 flags. Each renders its subject at the
size it is really seen at, because almost every mistake in this project has been
a thing that looked fine on a turntable.

**None of them is in the production build**, and that is measured rather than
assumed. A sheet reaches a different corner of the same code the world uses, so
listing one makes Rollup split the graph to share it: with the four that used to
be listed, the *world's* own first load is 249.2 KB gzipped across ten chunks,
and with the world alone it is 245.6 in one. `vite.config.ts` carries the
measurement. If a sheet is ever wanted online it should get its own build rather
than another entry beside the world's.

`window.atlas` is exposed for poking at:

```js
atlas.goTo(48.86, 2.29)              // the Eiffel Tower
atlas.detail(3)                       // more world, further away
atlas.sky.setTime('2026-09-05T05:20:00Z')
atlas.sky.setRate(600)                // ten minutes a second
atlas.world.countryAt(35.7, 139.7)
```

`CLAUDE.md` is the contract — the invariants, the scale table, and a map of
where to read before touching something — and it is deliberately short, because
every agent working on this repo reads it in full. The evidence lives beside it:
`docs/traps.md` is 303 bugs this project actually shipped, and `docs/built.md`
is what each finished system does and what it cost. All three are kept honest: a
number in a comment is meant to be true, and several of them are assertions in
`pnpm check` for exactly that reason.
