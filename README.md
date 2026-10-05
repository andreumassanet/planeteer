<p align="center">
  <img src=".github/assets/banner.jpg" alt="A light plane climbing over a coastal town, a balloon below it, a mountain across the bay" width="100%">
</p>

<h1 align="center">planeteer</h1>

<p align="center">
  <b>The whole Earth, walkable, in an inked comic style.</b><br>
  Every country from its real outline, 9,796 towns where real towns are,<br>
  101 landmarks — and you cross it on foot, by boat, by plane, or by rocket to the next planet.
</p>

<p align="center">
  <a href="https://github.com/andreumassanet/planeteer/actions/workflows/check.yml"><img src="https://github.com/andreumassanet/planeteer/actions/workflows/check.yml/badge.svg" alt="check"></a>
  <img src="https://img.shields.io/badge/Three.js-r182-000000?style=flat-square&logo=threedotjs&logoColor=white" alt="Three.js">
  <img src="https://img.shields.io/badge/TypeScript-strict-3178c6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/Vite-646cff?style=flat-square&logo=vite&logoColor=white" alt="Vite">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-2e509e?style=flat-square" alt="MIT"></a>
</p>

<p align="center">
  <a href="#the-planet">The planet</a> ·
  <a href="#the-landmarks">The landmarks</a> ·
  <a href="#getting-around">Getting around</a> ·
  <a href="#day-night-and-weather">Day, night and weather</a> ·
  <a href="#the-map">The map</a> ·
  <a href="#the-other-worlds">The other worlds</a> ·
  <a href="#running-it">Running it</a>
</p>

<p align="center">
  <img src=".github/assets/dusk.gif" alt="The Eiffel Tower and the Arc de Triomphe from above as the sun sets: the light goes amber, then blue, and the tower, the windows and the street lamps come on" width="100%">
</p>

Planeteer is a browser game about one thing: going and looking. The planet is
built from real data — Natural Earth's coastlines and frontiers, GeoNames'
towns, a sun that stands where the real one does — and everything on it is
generated from that data deterministically, so every browser builds the same
world and nothing about it has to be sent over the wire. It is drawn as a comic:
black ink round every shape, flat bands of light, one warm sun.

## The planet

<p align="center">
  <img src=".github/assets/climb.gif" alt="The camera rising from a traveller standing in the grass by the Colosseum, over the town, over Italy, until the whole planet turns with every country in its own colour" width="100%">
</p>

**The land is the countries' own outlines**, triangulated into a constrained
Delaunay mesh of 1.3 million triangles, given a relief, a shore that ramps into
the sea and 26 lakes cut out of it. The sea has a floor you can dive to, with
reefs and kelp where the water is warm enough for them. Towns stand where real
towns stand and are as big as their population says; roads join them gate to
gate, bridges cross narrow water, and a railway runs between the big cities.
Between them is countryside — woods, fields, farms, windmills, herds grazing —
all a pure function of where you are.

**Climb, and the world turns into a map of itself.** As you rise, each
country's colour fades in over its land, the frontiers are drawn and the names
come up; by orbit it is a political globe.

## The landmarks

<p align="center">
  <img src=".github/assets/landmarks.jpg" alt="Nine landmarks from above, each in its town: the Eiffel Tower, the Colosseum, the Golden Gate Bridge, Hagia Sophia, the Forbidden City, Mount Fuji, Chichen Itza, the Sydney Opera House and Big Ben" width="100%">
</p>

**101 landmarks in 74 countries, every one modelled in code** — the Eiffel Tower
to Great Zimbabwe, Uluru to the Moai of Rapa Nui. Each stands at its real
coordinates, and the town round it yields: it
paves the ground under it, keeps its roads off it and builds round it. Walk up
to one and a card tells you which it is, when it was built and one thing worth
knowing about it; the list was chosen by where the map was empty, not only by
fame.

<p align="center">
  <img src=".github/assets/orbit.gif" alt="The camera circling the Taj Mahal and its town, with the roads running out across the desert" width="100%">
</p>

## Getting around

<p align="center">
  <img src=".github/assets/fly.gif" alt="A light plane taking off from a grass strip, climbing over a bay and banking over towns, fields and a balloon" width="100%">
</p>

**Nobody owns a vehicle; they stand in the world.** A car a few lengths out of
a town's gate, a launch at its quay, a light plane at the end of a mown strip, a
helicopter in a field, bicycles on a rack, a horse, a jet ski, a sailboat, a
yellow submarine moored over a reef — fifteen kinds, each with its own handling,
sound and seats. Walk up, press <kbd>E</kbd>, and where you leave it is where
it stays. Jump out of a plane and a parachute opens. On foot you walk, run,
jump, swim and dive, and the people in the towns stop, turn and talk to you in
their own language, with the English underneath.

**Online, it is one shared planet**: other travellers appear where they are,
seats are taken for real, and there is a chat for the whole world.

## Day, night and weather

<p align="center">
  <img src=".github/assets/night-and-weather.jpg" alt="Left, a city at night under Tokyo Tower, its windows lit; right, rain driving across a field outside Paris" width="100%">
</p>

**The sky is the real one.** The sun is at its true position for where you
stand and the clock reads the local time zone; at night the world goes dark and
what you see by is street lamps, lit windows and headlights. The weather is one
function of place and time that reads the cloud deck itself — so it rains only
under a cloud you can see, snow lies above the real snowline, and every player
sees the same storm. Music plays now and then in the style of the region you
are in — twenty styles, composed as you go.

## The map

<p align="center">
  <img src=".github/assets/map.jpg" alt="The world map over the Mediterranean, with towns, roads and landmark pins" width="100%">
</p>

**<kbd>M</kbd> opens the planet on one sheet**, painted from the world's own
definitions — the same coasts, towns, roads and buildings that stand on the
ground — down to every block of a town. Click a pin and the minimap's wedge
points you there. A passport collects a stamp for every country you set foot
in.

## The other worlds

<p align="center">
  <img src=".github/assets/worlds.jpg" alt="Left, the solar system menu with every planet at its real position today; right, the traveller walking down a street on Mars" width="100%">
</p>

**The menu is the solar system as it is today** — every body at its real
orbital position, with its real distance and light time. Earth is the main
world, but the others can be walked too, with towns, craft and a saucer
parked here and there; a rocket on a pad beside an airstrip is the way up from
Earth.

## How it is made

- **[Three.js](https://threejs.org)**, and nothing else at runtime. `MeshToonMaterial`
  stepping a four-band ramp, and an outline pass for the ink.
- **TypeScript + [Vite](https://vite.dev).** The scripts run on Node's own type
  stripping, no build step.
- **Baked data.** Bake scripts turn Natural Earth and GeoNames into compact
  binary files under `public/data/`, with one module holding both the writer and
  the reader so they cannot drift apart; `scripts/sources.json` records where
  each source came from and its hash.
- **CC0 models where they are better** — people, vehicles, animals, plants and
  city buildings from Kenney, Quaternius and others, re-baked and drawn with the
  world's own ramp and ink. The terrain, the far towns, the regional buildings
  no pack has and every landmark are generated in code.
- **Headless checks for what a screenshot cannot show.** Thirty-odd scripts —
  `pnpm check`, `traffic`, `ground`, `weather`, `sky`, `railway`… — assert the
  world against its data: that New York is in the United States, that no town
  overlaps another, that a road never crosses the sea, that a foot stands on
  the ground that is drawn. CI runs them, the build and a real browser on
  every push.
- **A small relay** on Cloudflare Workers with a Durable Object (`server/`) for
  presence, seats and the chat. The world itself is never sent.

## Running it

Node 22.18 or newer, and pnpm.

```bash
pnpm install
pnpm dev          # http://localhost:5174
pnpm build        # typecheck, then build into dist/
pnpm check        # the world, headless: data, mesh, landmarks, places
```

`?at=lat,lon` skips the menu and lands there — `?at=48.86,2.29` for Paris —
and `?time=` sets the sky's clock. The baked data is committed, so the bakes
(`pnpm data`, `places`, `roads`…) only need running if you change them; `pnpm
sources` fetches their inputs.

## Keys

Every key can be rebound in Settings (<kbd>O</kbd>).

- <kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> move, <kbd>Shift</kbd>
  runs, <kbd>Space</kbd> jumps, <kbd>C</kbd> dives
- <kbd>E</kbd> gets into a vehicle, talks to someone, sits on a bench;
  <kbd>Q</kbd> sounds the horn
- <kbd>V</kbd> first person, the mouse wheel zooms
- <kbd>M</kbd> the map, <kbd>J</kbd> the passport, <kbd>B</kbd> the map layer,
  <kbd>H</kbd> hides everything, <kbd>P</kbd> saves a picture

## Credits

Countries and lakes from [Natural Earth](https://www.naturalearthdata.com)
(public domain). Towns and country facts from
[GeoNames](https://www.geonames.org), under
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Stars from the
Bright Star Catalogue (Hoffleit & Warren 1991, via the CDS, Strasbourg). Models
and sounds by [Kenney](https://kenney.nl), [Quaternius](https://quaternius.com),
Kay Lousberg and CreativeTrio, all CC0 — each `public/models/*/LICENSE.txt`
names its packs. The palette is borrowed from
[Bruno Simon's folio](https://github.com/brunosimon/folio-2025), and the inked
look owes a lot to [Messenger](https://messenger.abeto.co).

## License

Copyright © 2026 Andreu Massanet — the code is released under the
[MIT License](LICENSE). The data and models in `public/` carry their own terms,
listed at the end of [LICENSE](LICENSE).
