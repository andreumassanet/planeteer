# Night shift — handoff

**This file is temporary. Delete it when the morning's report is written.**

You are continuing an overnight run on `atlas`. A long session was improving the
whole project and handed off here when its usage ran out. **Read `CLAUDE.md`
first, in full** — it is the map of everything and it is kept honest.

## The one hard rule: the screen stays off

The user's panel is **OLED** and they sleep with it off deliberately, to avoid
burning pixels. An agent turned it on one night and they asked, twice, that it
not happen again.

- **Never run `hyprctl dispatch dpms on`.** Never do anything to wake the panel.
- **Browser screenshots work fine with the display off — this was tested, not
  assumed.** `dpmsStatus` stays `0` through a capture, because Chrome renders
  through CDP without the compositor. So verify visually as normal: you are not
  working blind and you have no excuse to skip looking.
- If a capture ever does come back black, wake the display, take it, and **turn
  it off again immediately** with `hyprctl dispatch dpms off`.
- A guard process (`atlas-screen-guard`) turns it off anyway, but it is a
  backstop and not an excuse.
- Say in your report whether anything was verified visually or only measured.

## The second rule: do not kill processes you did not start

Three agents tonight ran an over-broad `pkill -f vite` and took down other
agents' dev servers; one tripped a security classifier for it. Start servers on
your own port, record the PID, and kill that PID.

## The third rule: append to this file, never rewrite it

It is the log as well as the handoff, and a rewrite loses the night.

## How to work

Everything in `CLAUDE.md` applies, and these in particular:

- `pnpm check` and `pnpm typecheck` must pass when you stop. If they do not,
  say so plainly rather than leaving it for someone to find.
- **Measure, do not assume**, and write the measurement next to the change. The
  whole file is built that way: a trap is recorded with the number that proves
  it, never as advice.
- Spawn subagents for anything sizeable, brief them from `CLAUDE.md`, tell each
  one which files are theirs, and coordinate between them yourself — several
  bugs this project shipped were two agents holding one number.
- `atlas.detail()` is the render-range knob, currently **0.5** on the user's
  instruction because they were running many browser windows. Its range is
  0.25–6 and `atlas.detail(3)` is the world everything was tuned against.
  **Leave it at 0.5.**

## The queue, roughly in order

1. **The boat and the plane are smaller than their pilot.** The launch's console
   tops out at 1.3 units against a 6.8 body: he cannot reach it and stands
   braced instead. The plane's fuselage is 4.4 against the same body, so the
   pilot rides at a cheat height with his shoulders proud of it. `vehicles.ts`.
2. **19 monuments stand on ground whose shelf is not their anchor's**, and 13
   overhang the coast. `pnpm check` names all of them in a table.
3. **Ribbons laid on the ground do not know the coast ramps now.** Roads,
   borders and settlement paving all lift a fixed amount off `groundRadius`,
   and at a shore with a 0.65 gradient they poke through as pale slivers.
   Reproducible at Almería, 36.83 N 2.46 W.
4. **The avatar is 35 meshes and 70 draw calls.** Merging each bone into one
   vertex-coloured buffer takes it to 13. `src/avatar.ts` says so itself.
5. **The remaining monuments**: 65 are placed, the list can grow. The recipe is
   `src/monuments/contract.ts` and the review tool is `/contact-sheet.html`.
6. **Four microstates are missing from the world** — Monaco, the Vatican,
   Gibraltar and Macao — because every ring they have falls under
   `MIN_RING_AREA` in the bake.
7. **Nobody has reviewed the whole world with everything on at once.** Eight
   large changes landed in one evening — biomes, coasts, roads, vegetation,
   settlements, clouds, the avatar, the map — and no single pass has looked at
   them together.

Anything in `CLAUDE.md`'s own **Pending** section counts too, and it is more
current than this list.

## When you stop

Write what you did, what you measured, and what you did not finish, into a
section at the bottom of this file, so the next relay or the user can pick it
up. Then leave `pnpm check` passing.

---

## Log — first review pass with everything on

*(These entries were headed with clock times I had guessed rather than read. The
times were wrong by up to twenty minutes and are gone; the order is the record.
Written down because it is the exact failure this project does not forgive — a
number in a file that nobody measured.)*

The first look at the whole world with all of tonight's work in it at once.
Screenshots taken with the panel dark throughout; `dpmsStatus` stayed 0.

**Working, and worth knowing:** lit windows read beautifully at ground level in a
German town at 02:40 local; the crowd and vehicles are placed and the **vehicle
scale now reads right** — a car beside a person on the Málaga seafront is about
waist-to-chest, which is what a car looks like; **boats are under way at sea**,
visible and moving from 380 units up; the shore ramps to sand and then to
turquoise shallows and it is the best the coast has ever looked.

**Found and handed to the agent that owns it:** from 380 units the road network
reads as a **grey web laid over the countryside** rather than as roads. 23,867
places at mean degree 4.13 is 49,287 roads, all drawn at full width whenever in
range. The fix is LOD by class — the bake already labels `trunk`/`road`/`lane` —
not fewer roads.

**Open, for whoever picks this up:** the night hemisphere from orbit is bright
(mean luma 90–100/255 over land; killing the moon only reaches 72), so the city
lights sit on lit ground. The lighting agent has been asked to take the fill
down while keeping a direction for the ramp to step across.

## Log — the craft, and one number removed

The boat and the plane were rebuilt to fit their pilot, and `PLANE_CLEARANCE`
turned out never to have cleared the floats it was named for — the strut hung
3.4 and the pontoon under it had a 1.05 radius, so the keel sat at −4.45 against
a clearance of 4 and the floats went 0.45 into the ground on every approach.

Then I removed a number: `sit` in `avatar.ts` dropped the body 0.9 and shifted
it 0.6 back, with a comment explaining both in terms of **a 4.4-unit fuselage
capsule that no longer exists**. `player.ts`'s `seatOn` was cancelling the shift
on the next line of a different file, so the two constants existed only to be
undone. `sit` now leaves the hip at the origin, which is the convention the
crowd and vehicle kits already share. **Verified by arithmetic, not by looking**
— the hip lands at `PLANE_SEAT` 1.9 either way — because `src/ocean.ts` was
mid-edit and the app would not start. Worth a glance when the tree is clean.

## Log — the night hemisphere

The lighting agent's second pass found something worth keeping. Its first
diagnosis — that ambient and the ramp floor carried the bright night side — was
wrong, and it said so: the sample window had a terminator and clouds in it.
Measured properly, same camera and same ground at 40N 100E from the ceiling,
local noon against local midnight:

```
            noon   midnight   contrast
  before   150.6      89.2      1.69
  after    147.0      51.5      2.85     day side -2.4%, night side -42%
```

**The blend was not too weak; it was aimed at the wrong record.** Every number in
`NIGHT_MOOD` is a *ground* number — what someone standing outside at midnight
can see — and its moon at 0.9 is exactly what keeps night a second look rather
than a dimmer. Carried up unchanged against a 2.6 sun it deleted the terminator.
`theme.ts` has its own `ORBIT_LOOK` now. Term by term against the old 89.2: moon
−36.3, sun leaking through `rampShadow` −12.4, ambient −3.2, hemisphere −1.4.

Windows also go to bed: a town empties to **29% of its evening** by 05:00, each
window drawing its own hour between 20:30 and 03:30 from its own seed, with 12%
that never go out. Street lamps burn till dawn, which is the council's business
and not a household's.

---

## Log — the monument overhang, and the quay that is not worth building

Screenshots taken with the panel dark throughout; `hyprctl dispatch dpms on` was
never run.

**The number today.** `pnpm check` says **12 of 65 stand over water**, down from
13, and it now prints the thing that matters: how far each one's ground stands
above that water. That was **4.1 to 21.0 units**; it is **4.0 for all twelve**.

**The quay is closed.** The 20-unit cliff it was going to fill no longer exists:
the shore ramps, and it had already put a beach under nine of the thirteen —
looked at, they read as landmarks at the water's edge. The remaining cliff was
being built by the monument's own **pad**, which is a level disc and was
overwriting the ramp: Sydney's opera house 7.1 -> 21.0 at the last land point,
the Parthenon 6.3 -> 14.2, St Peter's 4.4 -> 10.9. A shore ceiling in
`terrain.ts` costs 1,097 land triangles; a quay is `geo.ts` + `globe.ts` + the
bake and would fill in the water Mont-Saint-Michel, the Golden Gate and the moai
are made of.

**Also fixed:** `separate()` walked St Peter's 22 km onto the beach at
Fiumicino — the only monument of the 65 the pass took from seated to overhanging
— because it checked "not in the sea" and not "still seated".

**Left alone, and worth someone's time:** the Sydney Harbour Bridge and St
Peter's are 37 km and 22 km from where they belong because two 55-unit
footprints want 111 units between them. That is the compression, not a bug, but
it is the largest placement distortion in the file.

## Log — 02:05 by the clock, the sea and the knob

The sea now answers `atlas.detail()`, and the shape of the answer is a **split
with a reason rather than a compromise**: the shallows ribbon scales, the water
sphere does not. Three reasons, and the third is the one that decides it —
**when the ribbon shrinks the sphere has to carry *more* of the depth ramp, not
less**, so turning it down at low detail would damage the world in exactly the
band the ribbon had stopped covering. At the shipped 0.5 the sea is **2.6x fewer
triangles and 2.1x less memory** than it shipped an hour ago.

And it found a latent bug while sizing: **a quad laid on a sphere has two sag
directions and the second had no limit.** The bands were sized against the first;
the spans were whatever the outlines gave — median 19.4 units, p99 108, longest
sea-facing edge **1,578**, which is a quad plunging **19.5 units** below sea
level with the ocean poking up through it. One number now bounds both directions,
~1% of spans split, ~1% more triangles.

`pnpm check` now builds the sea at 0.5, so the check measures the configuration
that actually ships rather than the one a developer happened to be sitting at.

## Log — 02:22, the clouds are the worst thing in the sky

An A/B from near the ceiling, night side over Europe and Africa, `detail(0.5)`,
terminator across the Atlantic — the same frame with the deck shown and hidden.

**With it, the globe is covered in discrete grey lumps with hard black rims.**
It reads as rubble on a planet. **Without it, it is the best frame the project
has produced**: the terminator sweeping the Atlantic, Europe and Africa dark and
speckled with city lights, the Sahara pale, the sea carrying its depth ramp.

The cause is a judgement the clouds agent recorded and defended, and its own
wording contains the tell — *"the alternative is measurably worse by arithmetic,
not by experiment"*. `OutlineEffect`'s pen is **screen space**, so at 26,000
units a cell subtends about twenty pixels and the ink stops being a line around
a shape and becomes a large fraction of it. On the ground the same rule is right
and the deck looks lovely. The land gets away with it because it is one
continuous surface whose silhouette is a single long line; the deck is thousands
of small separate hulls. Same pen, different geometry, opposite outcome.

Sent back to that agent with the frames. **Not to be fixed by deleting weather
from orbit** — from the ceiling the cloud field is what you climbed to see, and
that argument still stands.

## Log — 02:41, the wire, the clouds reversed, and two shared numbers

**The data ships as bytes.** 1,236 KB gzipped to **612**, and the decode got
*cheaper* — 26 ms to 16 — because `JSON.parse` has to build 97,280 two-element
arrays and run a decimal string parser on every coordinate where the decoder
does one integer add. `pnpm check` gained a "the wire" section that re-encodes
each file and compares byte-for-byte, and asserts every number reproduces its
own decimal string: **0 moved** over 97,280 points, 23,867 places, 49,287 bows.

Consequence worth carrying: **the JS is now the first load, not the data.** One
chunk — the monument and scenery contracts — is 189 KB gzipped on its own, and
none of it is needed to draw the first frame. An agent is on it.

**The clouds reversed the judgement**, and the correction inside the correction
is the useful part: the pen was priced against a *cell* when `OutlineEffect`
hulls a **mesh**, and a bank is nine cells — the first fade was four times too
aggressive and produced white faceted masses with no line, which is the exact
"crude box under realistic shading" failure the Visual direction warns about.
Caught by looking. And the second half: **a cel ramp gives every facet a lit
side and a dark side, and a small pale thing with a lit side and a dark side is
how you draw a rock.**

Two more numbers that existed twice now exist once: `WALK_STRIDE` (copied into
`life.ts` with a comment saying `avatar.ts` would not export it) and the boat's
wheel, which `avatar.ts` was restating out of `vehicles.ts`'s *comments* — hub,
two radii, thickness and rake, four numbers across a boundary nothing checks.
`vehicles.ts` publishes `BOAT_HELM` now, the way it already published
`PLANE_SEAT`.

## Log — 02:57, the document had started lying about itself

`CLAUDE.md` is 3,750 lines and 197 traps after tonight, and its structure had
gone wrong in a way no single agent could see: **the section called "Where this
is going" contained eleven subsections all marked done.** A reader opening it to
find out what was next found the past. Renamed to *What the world does, and what
each of them cost*, with the one genuinely unbuilt thing — going online — moved
to a **Still ahead** section at the end.

The traps list also got a short orientation at its head, because 2,180 lines of
bullets with no map is a list nobody finishes, and the most common failure in it
by a distance is **a number that existed in two places at once**.

And one stale figure fixed: Pending said "about one town in twelve has the land
mesh cutting across its paving" and named a fix in `terrain.ts` that has since
been built. It is **2.7%** — 6,005 of 219,235 triangles — having been 31% before
`setDetailSites` and 1.9% after, drifting back because the gazetteer tripled the
settlements and put more of them on steep ground.

## Log — 03:18, the second wave seen in the world

The twelve new landmarks were reviewed by their author on the contact sheet.
This was the first look at any of them **in situ**, which is a different test.

- **Avenue of the Baobabs**: the trees read perfectly and the model stands on a
  bright green plate cut into western Madagascar's gold ground, with a straight
  edge all the way round. **A monument that carries its own ground was authored
  against a world where the ground was one flat colour per country**, and
  `biome.ts` arrived after most of the sixty-five. Handed to the third-wave
  agent with the caveat that it is a judgement and not a rule — the Pyramids
  carry their own pale plateau against the same gold desert and it reads *right*,
  because a limestone plateau in sand is supposed to contrast.
- **Nairobi** is the best village in the world: round huts under conical roofs,
  a minaret, acacias, a cart, and a crowd in orange, pink, yellow and purple
  that reads as individuals at 26 units.
- The **"Found …" toast fires** for a landmark added three hours ago, and at
  Giza the city is built up to the pyramids with palms and people among them —
  the best argument yet for the towns and the landmarks sharing one world.

## Log — 03:19, a correction: the handoff was never truncated

Earlier I reported that an agent had overwritten this file and destroyed the
night's log. **That was wrong and it was my own mistake.** I had served the
production build with a `cd dist` inside a compound command, and the Bash
tool's working directory persists — so the next several commands ran in `dist/`,
my `cat >> NIGHT-SHIFT.md` created a *new* file there, and the `wc -l` that
returned 14 was reading it. The real file was 286 lines and untouched the whole
time.

The rebuilt handoff I wrote went to `dist/` and is gone with it, so the
improvements in it have been re-applied to the real one above: that screenshots
work with the panel off, that nobody should kill processes they did not start,
and that this file is appended to and never rewritten.

Two lessons worth the space. **`cd` inside a compound command outlives that
command**, and every path after it means something else. And the reflex to
report a fault before confirming who owns it is worth resisting: it took one
`ls` to find out, and I told the user an agent had destroyed their file before
running it.

## Log — 03:22, first person verified in the world

The camera agent said plainly that it never had pointer lock and that the feel
was the one thing someone else had to check. **The mode itself had also never
been seen in the live world since the avatar was rebuilt**, which mattered
because the eye height is derived from `FIGURE` and the rebuild moved every
number in it.

It works: eye at head height, the player's own body hidden, the street readable
at ground level with the crowd and the buildings where they should be. Toggling
back restores the third-person framing and **leaves the body hidden until the
next frame runs**, which is the documented rAF behaviour and not a fault.

Two notes for whoever is next:

- **A crowd figure can stand in the lens.** Teleporting into a street put one a
  unit from the camera, filling half the frame. The model holds up at that
  range, which is the good news; there is no collision, so you walk through
  people. Whether that wants solving is a design question nobody has asked.
- **`atlas.rig.firstPerson = true` looks broken and is not.** Setting it and
  then waking the loop reverts it, because a synthetic `KeyV` dispatched earlier
  leaves `input.state.view` latched and `aim` consumes the edge on the next
  frame and toggles back. Call `atlas.input.endFrame()` first. I lost ten
  minutes to this and nearly filed it as a bug in the setter.

## Log — 03:24, the bundle, and a theory of mine that was wrong

**My brief for that agent was wrong and its chunk table said so.** I told it the
189 KB `contract-*.js` chunk was the monument and scenery contracts. **It is
Three.js** — Rollup names a shared chunk after one of its modules, and
`src/monuments/contract.ts` is 13.6 KB of a 2,040 KB chunk whose other 2,021 KB
is the renderer. Nothing can move it; the renderer is the second thing `start()`
builds. The 77 monument models were a different chunk entirely.

What it did instead: **the preload set went 403 KB gzipped to 245, −39%**, by
firing nine `import()`s immediately after `loadWorld` and awaiting each at the
loading stage that needs it. First frame at 250 KB/s: **12,132 ms to 11,408**,
with no overlap between the run spreads.

And the reasoning behind *where* they fire is the part worth keeping: both ends
of this load are bandwidth-bound, so starting the deferred code at the top would
make `countries.bin` late by exactly its own size. **After `loadWorld` the
network is idle and the main thread is not** — measured, the fifteen chunks land
inside a build still running, and time spent inside `start()` moved by +68 ms.

It also found that **`/flags.html` 404s in production** and left it, with the
measurement: adding it splits the renderer's chunk and costs the world's first
load 3.9 KB. That call is right. **The defect was in `README.md`, which promised
the page** — fixed there instead.

## Log — 03:27, three fetches that had no reason to be serial

`main.ts` awaited `loadPlacements`, `loadPlaces` and `loadRoads` one after
another. **None of the three depends on either of the others**; what has to be
sequential is `setFlattenSites` before `setDetailSites` before `loadWorld`, and
that is a different statement about a different pair of lines. They are one
`Promise.all` now and the ordering below is untouched.

Verified from the browser's own resource timing: **all three now start at the
same millisecond** (107) where they used to stagger, with `countries.bin`
following at 180.

**The win is latency, not bytes, and it is small here on purpose.** The load is
bandwidth-bound at any realistic speed, so this buys the gaps between requests —
a few milliseconds against a local server, and a whole round trip apiece on a
bad link, which is the connection that needs it. The bundle agent had measured
those gaps at about 4 × 50 ms and left them because it read the constraint as
"the sites must be installed before `loadWorld`". That is true and it does not
constrain the fetches.

## Log — 03:33, two more fronts opened

**Lakes.** This planet has 234 countries as their real outlines, 23,867 towns,
49,287 roads, a ramped coast, shallows, surf and depth in the sea — **and no
inland water at all.** No Great Lakes, no Caspian, no Baikal, no Victoria, no
Geneva. The sea agent listed it as the largest thing it did not do, and the
cause is deliberate: the bake keeps only outer rings, because holes are what
made Lesotho and Western Sahara unreachable. Natural Earth publishes
`ne_50m_lakes` under the same licence and in the same shape as the outlines this
world is already built from.

The brief asks for more than a blue polygon: a lake has to be water in every
sense the sea is — `countryAt` still answering, the boat mechanic making sense,
nothing built on it, a ramped shore, and depth rather than a flat disc beside a
sea that now has all of it.

**And the settlements**, which are Pending item 2 and thin rather than wrong: a
median of **9 parts** a town, twenty of an 814-place sample that build **nothing
at all**, and the paving agent's own verdict — *"Oklahoma City puts 8 buildings
in a 40-unit core, and now that there is a floor under them it reads as a car
park."* Both agents were told that the numbers in that item were measured before
the gazetteer tripled the towns and halved the gap between them, so the
threshold that item quotes has to be re-derived rather than inherited.

## Log — 03:43, arriving at a landmark now says something

**The whole project is an explorer of Earth holding the world's notable
landmarks, and until now the payoff for finding one was the words `Found Machu
Picchu` in the same grey toast that reports the render-detail knob.** A country
you merely walk across gets a card with its flag, its continent and a fact; the
thing you actually went looking for got three words.

`hud.ts` has a landmark card now — **`2 OF 77 FOUND` / *Arc de Triomphe* /
France · 50 m · 1836**, with the flag. The height and the year were already in
`monuments.source.json` and had never been shown to anyone.

Two decisions worth keeping:

- **It arrives from the right, where the country card arrives from the left.**
  Two events that feel different should not slide in from the same place: a
  border crossing says *where you now are*, and this says *what you have found*.
- **The country is the landmark's, not the ground's.** Twelve of the seventy-seven
  stand over water and the Sphinx sits 1.5 units from the Pyramids, so the
  country under your feet is not reliably theirs.

It holds for 8 s against the country card's 5.5, because a border is crossed by
walking in a straight line and will be crossed again, and this is the only card
carrying numbers somebody might want to read twice.

Verified by the real path, not by calling the method: standing at the Eiffel
Tower puts you inside the Arc de Triomphe's visit radius in this compressed
world, and the card fired on its own with the counter going 0 to 2.

## Log — 03:51, stale counts, and the difference between two kinds of number

The landmark list went 65 → 77 tonight and several files still said 65. Fixing
them needed a distinction this project's discipline turns on:

- **A present-tense claim that is now false** gets corrected. `placement.ts` said
  "65 landmarks at a couple of thousand triangles each"; `cartography.ts` sized
  its label placer against "65 landmarks and 234 countries"; `vegetation.ts` was
  wrong twice over at "7,320 settlements and 65 monuments".
- **A recorded measurement does not.** `map.ts` counts how many landmarks survive
  the pin thinning under three projections, and that table was measured when
  there were 65. Bumping the number to 77 would be inventing a measurement
  nobody took. It now says when it was taken and that the ratios are what the
  argument rests on.

Two more stale ones are in files a live agent owns — `globe.ts` ("measured over
the 65 sites") and `settlements.ts` ("65 monuments all fit in memory") — and are
left for them.

Also filled three gaps in `CLAUDE.md`'s layout: `borders.ts` and `navigation.ts`
were never listed, `hud.ts` was still described as "the place chip and the
border-crossing card" before it grew a clock and a landmark card, and
`flags.html` is now marked as the `pnpm dev`-only page it actually is.

## Log — 03:57, this project has no version control

Something I should have checked hours ago. **`atlas` is not a git repository**,
there is no backup anywhere beside it, and **eight agents have rewritten most of
it tonight** — including three that ran an over-broad `pkill` and one that
tripped a security classifier. Every measurement in `CLAUDE.md`, every landmark
model, the binary wire format and the whole night's work exist in exactly one
place on one disk.

There is a `.gitignore`, which says somebody meant to.

**Initialising a repository is the user's call and I have not made it.** What I
have done is cheap and reversible: a snapshot of `src/`, `scripts/`, `public/`
and the docs into the scratchpad — 1.9 MB — and a rolling one every twenty
minutes keeping the last twelve, stopping at 08:00.

```
  snapshots:  <scratchpad>/snapshots/atlas-HHMM.tar.gz
  stop with:  pkill -f atlas-snapshot
```

It is not a substitute for git and it is not meant to be. It is a floor under
the next hour.

## Log — 08:35, CLAUDE.md was 63,000 tokens and every agent paid it

The user found it: **`CLAUDE.md` had grown to 4,020 lines and about 63,600
tokens**, and it is the one file every agent in this project reads in full
before doing anything. Eleven agents ran last night. That is most of a session's
budget spent on detail that matters to one file each.

Split, and **nothing was rewritten or dropped** — the two big sections were
moved verbatim with `sed` line ranges rather than regenerated, which is the only
way to move 47,000 words without quietly losing a measurement:

```
  CLAUDE.md    4,020 lines / ~63,600 tokens  ->  453 / ~5,850     -91%
  docs/traps.md   all 160 traps, verbatim, in 20 named clusters
  docs/built.md   the 14 "what it does and what it cost" sections
```

What stayed in `CLAUDE.md` is what an agent must not break **without reading
anything else**: the commands, the layout, the scale table, and a new
**Invariants** section — one definition per fact, the planet's handedness,
`determinant() > 0`, `T * R * S`, what `OutlineEffect` constrains, radius versus
frustum, merged versus moving, the three scales, how to measure warm, the
re-bake order. Plus a table saying *about to touch this file -> read that
cluster*.

**The risk of this change is real and worth naming**: a trap that used to be
unavoidable is now one link away. The mitigation is that the invariants section
carries the compressed form of every trap that has bitten more than once, so the
recurring failures are still in front of everyone.

## Log — 08:43, the traffic, and the constant that was not the one to tune

The user: *"abundan los coches mucho (y van muy rapido)"*. Both true, and the
first one was being caused by a different number than the obvious one.

**Too many.** `OCCUPANCY` looks like the knob and is not. The scan gathers
candidates and then spends a per-family cap nearest-first, so on any street that
offers more cars than the cap there are *always exactly* `detailCount(ROAD_MOVERS)`
of them and the occupancy only decides which roads they come from. Measured in a
street in Ulm at the shipped detail of 0.5: 18 * 0.5^1.5 = 6.4, and the world
held **6 movers with all six on the screen at once**. `ROAD_MOVERS` 18 -> 12,
which is four at the shipped detail. The occupancy came down too, but for its
own reason: `roads.ts` already records that inside the lane reach **12% of the
ground is carriageway against 1-2% in a real country**, so a lane that is
usually occupied puts a car on every strand of that lattice. Lanes 0.3 -> 0.1,
so a village lane is usually empty and the four are on roads.

**Too fast, and the reference it had been sized against was the wrong one.** The
comment said a car "has to visibly overtake a running player (130)". The player
is the thing at the wrong scale: a run here is **19 body-lengths a second where
a real sprinter does 2.5**, and the rule did not even hold, because lanes were
110 and a running player already outran every car on one. The reference that
holds is the car against itself and against the length of street you can see:

```
                own lengths / s        to cross 300 units of visible street
  real traffic       6.0                —
  lane   110 -> 55  10.7 -> 5.3         2.7 s -> 5.5 s
  road   150 -> 78  14.6 -> 7.6         2.0 s -> 3.8 s
  trunk  190 -> 100 18.4 -> 9.7         1.6 s -> 3.0 s
```

A car crossing a village street in two seconds is a chase; in five it is
traffic. **What it gives up is that a running player now overtakes everything**,
and that is the honest consequence of the reversal rather than an oversight.

Not yet verified on screen: the lakes agent is live in `geo.ts` and `globe.ts`
and the world takes 30 s to build while its cost is unfixed, so every reload is
a minute. The arithmetic is deterministic and the look is still owed a check.

## Log — 09:40, the lakes, and what a hole in a mesh actually costs

The lakes landed overnight and cost **five times the land mesh**: 1.45 M
triangles to 7.08 M, 149 MB to 729, 4.8 s of build to 29.3, and an 892 MB heap
in a tab that used to hold 200. The brief was: fit a budget or come out.

**Where the 5.6 M went, before anything was optimised.** Three builds of the
same world — no lakes; lakes in `prepareTerrain` but the land still drawn over
them; lakes cut out — separate the shore from the hole:

```
                                        triangles     MB    build
  no lakes at all                        1.450 M     149    4.8 s
  lake-aware relief, land drawn over     1.738 M     179    6.8 s
  the lakes cut out of the land          7.082 M     729   29.3 s
```

So the shore ramp round every lake is **+288,000 triangles** and the hole is
**+5.34 M**. It is not the shore, and it is not near the lakes either:
bucketing every triangle by its distance to the nearest lake, the mesh gained
**+993,000 triangles more than three degrees from any lake at all**.

It is `ShapeUtils.triangulateShape`. Earcut bridges every hole to the outer
contour, ear-clips the slit polygon, and `refine` then squares whatever slivers
that leaves — an edge `n` times `MAX_EDGE` long splits about `3^log2(n)` times.
Canada's own ring, same terrain, holes off and on: **3,385 ear-clipper faces
refining to 63,157 triangles against 8,139 refining to 2,994,260**, longest
earcut edge 22.5 degrees to 41.9. Four rings — Canada, the United States,
Russia, China, the four with the most holes — carry 5.56 M of the 7.08.

**An island is land added to a mesh and a lake is a hole cut in one, and a hole
is not paid for by its own size.** `MIN_RING_AREA` had been copied from
`build-countries.mjs` on exactly that symmetry. 410 lakes cover **131 square
degrees of a 148,000 square degree world — 0.09% of the land**. The sweep:

```
  lakes kept   triangles     MB    build
       0        1.450 M     149    4.8 s
      20        1.556 M     160    5.2 s
      27        1.639 M     169    6.5 s
      46        1.784 M     184    6.0 s
      57        1.840 M     190    7.3 s
      88        2.087 M     215    7.3 s
     182        3.089 M     318   11.3 s
     410        7.082 M     729   29.3 s
```

Against the count and not the threshold, because the cost is per hole and the
eight counts came from sweeping the threshold both ways — raw shoelace and true
area — on the way to deciding which it should be. The MB are the `Float32`
figures they were measured with, before the quantisation below. The build column
is one run each and 46 reads faster than 27, so read the triangles.

0.5 **true** square degrees ships — the shoelace times the cosine of the ring's
own latitude, because a lon/lat shoelace overstates by two at 60N and Canada,
Finland and Russia are where the cost is. 27 lakes, the smallest 223 units
across. The Great Lakes, the Rift Valley, Baikal, Ladoga, Balkhash, Titicaca,
Nicaragua, Eyre. What goes is Geneva, Constance and every reservoir, none of
them 60 units across at 1:400. The shape argument agrees rather than fights:
`COAST_CELL` is 140 units and `buildCoastField` clears a whole one for any lake,
so a lake under that is one whose shore is wider than the lake.

**The biome failure was a real leak and it was one field answering two
questions.** `shoreDistance` gates the shore ramp *and* is `biome.ts`'s
continentality, and clearing the lakes out of the coast field made the interior
of continents coastal: **Iowa temperate rather than grassland, the Sahel
temperate rather than savanna**, because Iowa is four degrees from Lake Michigan
and the Sahel is beside Lake Volta. Two fields now, one megabyte:
`shoreDistance` is any water, `oceanDistance` is the sea. All 25 named places
land where an atlas says again.

**The other four failures.** *Roads crossing water* was the bake: `roads.bin`
predated the lakes, `pnpm roads` re-run, 200 down to 0. *Places in water* was
also the bake and the mechanism already existed — `build-places.mjs` walks any
place `countryAt` calls water back to land, and had never been run with lakes
in the world. 31 towns sat in a lake, all within 91 units of its shore and 28 of
them within 24; re-baking moved 29 onto the bank and cost **one place of
23,867** (Muriti, on an island in Lake Victoria the 1:50m outlines do not draw).
That matters rather than being cosmetic: `settlements.ts` writes down that a
town's centre "is known to be on land", and a centre in a lake lays the floor at
sea level 20 units under the country round it. *The settlement-mesh assertion*
and *the ground rising from the water* both came back on their own — the first
is at **8.38 at Villa Juárez**, which is the number `CLAUDE.md` already had.

**Then the second half, since the first landed cheap.** The land mesh was three
`Float32` attributes, 108 bytes a triangle, and `vegetation.ts` had written the
arithmetic down a year of work ago and halved its own. Normal to `Int8`, colour
to `Uint8`, `computeVertexNormals` deleted because a non-indexed mesh was
re-taking the cross product `emit` had just computed: **169 MB to 84, and 149 to
74 with no lakes on the planet.** The colour is quantised in linear space where a
uniform step widens in sRGB, so the third party was asked rather than trusted —
`pnpm check`'s "groundColorAt agrees with the colour the mesh painted" moved
from 130 of 32,131 apart, worst 1.560, to **131 of 32,133, worst 1.559**.

Verified on screen at Lake Michigan: the lakes read as water, the beach ramps
down to 5.08 units at the shore, the surf runs along it and the roads stop at
it. **Browser heap 232 MB.** At 900 units up the land is 3.27 M drawn triangles
for **1.7 ms against 1.8 with it hidden**, which is nothing, which is the whole
reason memory was the number to move.

Left alone deliberately: the small lakes are bought back by a better
triangulation and by nothing else — earcut's hole bridges are what the
refinement squares — and that is a rewrite of how the land is cut, not a
constant. `README.md` still says **77 landmarks** where `pnpm check` counts 85;
that measurement is somebody else's and has not been taken by me. And roughly
thirty comments across `src/` quote **23,867 places** where the file now holds
23,866; the live files were left alone rather than swept under another agent.

## Log — 09:18, the third wave's eight, counted

The landmark agent died with the session and never reported, so its work was
never counted. Its files are there and `pnpm check` accepts all of them:
**77 landmarks in 52 countries -> 85 in 59.**

```
  Baalbek                 LBN   the Levant
  Ziggurat of Ur          IRQ   Mesopotamia
  Gergeti Trinity Church  GEO   the Caucasus
  Elmina Castle           GHA   west Africa
  The Pitons              LCA   the eastern Caribbean
  Nan Madol               FSM   the Pacific
  Mount Yasur             VUT   Vanuatu
  Chateau Frontenac       CAN   Canada east of Toronto
```

Seven of the eight are in regions that had nothing, which is the curation rule
working: **the list is chosen by where the map is empty, not by fame.** Two of
its findings had already reached this file before it died — that a wall around a
mass is worth less than a detail on the front of it at this camera elevation,
and that a model bringing its own ground was authored against a world that no
longer exists.

`README.md` and `CLAUDE.md` corrected. The count came from `monuments.json`,
`monuments.source.json` and the model files agreeing at 85, not from the agent.

## Log — 09:25, the house lights did not light anything, and now they draw it

The user's words: *"la luz de las casas por la noche no ilumina"*. They were
right, and the behaviour was **deliberate and documented** — `docs/built.md` said
plainly that nothing here casts light on anything, because hundreds of point
lights would flatten the four-band ramp and take the cel shading with them. That
argument is untouched: **no point light was added and the ambient did not move.**

What changed is that the light is now **drawn** instead of cast, which is what a
comic does with a street at night. `settlements.ts` writes the *same two bytes*
on the town floor's own vertices that a lit window already carries — brightness
and the hour it goes out — so a pool of light goes through `lightWindows`'
terminator and `lightWindows`' bedtime with no second mechanism, and the ground's
share of the attribute was being left at zero anyway.

**It costs nothing that can be billed.** Same 140 resident towns, the emitter
list stubbed empty against the real one: identical triangle counts to the last
one, identical draw calls (it is the same merged mesh), the same 38 bytes a
vertex, and `raise` measured with `atlas.settlements.compare()` over 21 reps,
best of, moved 0.80 -> 0.80, 1.10 -> 1.10, 1.30 -> 1.50, 1.70 -> 1.90 ms against
a `BUILD_BUDGET_MS` of 3.5.

The A/B is the floor's two bytes zeroed against written, Nördlingen at 21:50
local, 1,884x987:

```
                         pixels moved   mean delta   frame luminance
  on foot, 44 back        98,848 (5.3%)     63.9      58.93 -> 61.45
  260 up, straight down  259,942 (14.0%)    85.7      68.80 -> 77.94
```

Three measurements decided the shape of it and all three are now traps:

- **A wall in this kit cannot carry a wash and it is arithmetic, not taste.** A
  `gabled-house`'s wall mass has **six distinct vertices** and every one is 4.89
  to 5.30 units from the nearest window; a `tower-block`'s eight are 5.64 to 5.81
  on a wall 22.8 units tall. Any falloff evaluated there is one number for the
  whole wall — the lantern `ctx.lit` warns about. The floor is the opposite: its
  own triangle edges run 2.56 / 10.68 / 14.14 (min, median, p90) over 40 towns.
- **A pool centred on the emitter puts its brightest part under it.** Same 140
  towns, same 116,118 floor vertices: falling from the plot centre, 58.0% of the
  floor is lit at a mean of **0.314** of peak; held to the footprint and ramped
  from the wall, 58.8% at **0.547**, and 4.1 times as many vertices near full.
- **A window's gain is not a floor's.** At the window's own clip the pools are a
  white tile: **40,393 pixels of the frame go white against 241** at the peak
  that shipped.

And a fourth that cost an hour and belongs to everyone measuring in this repo:
**`await import('/src/lights.ts')` in the browser console is a *second* module
instance** — the page's copy carries Vite's `?t=` HMR query — so writing its
shared uniforms measures nothing. The tell was a bedtime sweep that came back
5,278 pixels at all five hours; driven by the page's own loop the same sweep is
25,408 -> 5,407.

The town still goes to bed and the terminator still sweeps: the floor empties to
**40%** of its evening where the windows go to 21% (what is left is the lamps,
which are the council's), and at local noon the pools contribute **exactly zero
pixels**.

`pnpm check`, `pnpm people`, `pnpm life` and `pnpm traffic` all pass.

## Log — 09:31, the light lands, verified from the outside

Checked the lighting agent's work myself rather than taking the report: `pnpm
check` and `tsc` clean, and the A/B on the same frame over Nordlingen in January
at 21:50 — `atlas.brightness(0)` against `atlas.brightness(1)`.

It is unmistakable. With emission off the town is a flat blue-grey plan; with it
on there are warm pools across the paving, against the foot of each wall, and
the fields beyond stay dark. **What the user asked for was the thing the
documents said could not be had**, and the way through was the one the style
already implies: light is *drawn* rather than cast, so a pool is a colour on
vertices that already exist and costs **zero draw calls, zero triangles and zero
extra bytes** — the town floor's own `atlasLit` pair was being left at zero.

Two owners rather than one, which is the part worth keeping: **a lamp's pool
burns till dawn because it is the council's, and a building's spill goes out
with its brightest window because it is the household's.** Where they overlap
the brighter wins outright, because a vertex carries one bedtime and a sum has
no owner.

And a measurement trap out of it that belongs to everyone working here:
`await import('/src/lights.ts')` in the console is a **second module instance** —
the page's copy carries Vite's `?t=` HMR query — so writing its uniforms
measures nothing and a sweep comes back flat.

## Log — 10:00, the countryside stops being a lattice

The brief was the note in `docs/traps.md` that said the web of roads across the
fields *is a fact about the graph rather than about the drawing*, and that
thinning it was blocked because the streamer's cull is quantised to a 4-degree
tile. **The block was real and it was about the wrong end.** A cull at draw time
has a granularity; the bake has none and can simply not emit the edge.

**The number to move was not a road count.** A count moves with
`ROAD_CLASSES[].reach` and says nothing; the share of the ground that is
carriageway is the same disc before and after. Rasterising the ribbon inside the
lane's own 1,300-unit reach — a raster and not a length-times-width sum, because
two ribbons overlap at every junction — the Ulm disc was **25.12%** and the mean
over eight standpoints **11.45%**.

**What ships is parameter-free.** RNG is a subgraph of Gabriel, so the edges
Gabriel has that RNG does not are exactly the diagonals of the triangulation.
Drop those, but only the *lanes* — 36,611 of the 49,179 are lanes and 178 are
trunks, so thinning every class equally spends the cut where the count is not and
takes the aerial map apart — keep back anything whose loss would split the
network, and give every town a floor of two roads. No probability, no threshold.

```
                        as tested      thinned
  roads                    49,179       36,212
  mean degree                4.12         3.03
  places on one road          365          365
  components                  413          413
  largest component        14,657       14,657
  places with no road         267          267
  Ulm, carriageway         25.12%       17.01%
  roads.bin gzipped        168 KB       126 KB
```

Three things worth carrying:

**The connectivity guard is not decoration and it is worth 13 towns.** RNG
contains the minimum spanning tree of the *places*, so "keep every RNG edge"
reads like a guarantee — and 808 RNG edges went to sea, so the surviving RNG does
not span what Gabriel spanned. With the guard off: **438 components against 413,
280 places with no road against 267**. It rescues **25 lanes of 13,451** and every
connectivity number then comes out bit for bit what the untinned network had.

**The lattice was never only the graph, and the half that is left is the pen.**
The network already carries **0.078 km of road per km²** at Ulm against Germany's
real inter-urban **0.64** — eight times sparser — and it still covered a quarter
of the ground, because a lane is drawn 8.25 units wide: **3.26 m** to the car on
it and **3.28 km** on the planet it is drawn on. Draw Germany's own network with
this pen and the answer is **210%, the country paved twice over.** So 1 to 2% was
never a target this world could aim at. Of Ulm's 25 points, about 12 were graph —
the floor of a spanning forest is 13.3% — and about 13 are `ROAD_CLASSES[].width`,
which belongs to the vehicles.

**`pnpm check` re-derives both graphs rather than believing the bake.**
`proximityGraph` moved into `src/roads.ts` for the reason `roadPoint` is there,
and the check asks the shipped file to account for every candidate it does not
carry. Verified to have teeth rather than assumed: cutting one leaf road out of
the file by hand — Qingdao–Jiangshan — fails both new assertions by name.

Two numbers in `src/life.ts` are now stale and that file was not mine to touch:
its comments quote a median road of **106 units** (98 now) and a mean degree of
**4.13** (3.03), the second in the note explaining why six seeded draws find a
next hop. Neither is a bug — six draws still find one — but they are claims.

## Log — 10:06, the lattice, and the half of it that is not the graph

Checked the road thinning myself rather than from the report — decoded
`roads.bin` and re-derived the numbers: **36,212 roads, median span 98.1 units,
mean degree 3.03, and 267 places with no road, which is the number it was
before.** Connectivity did not move at all: 413 components either side, largest
14,657. The A/B frames are unmistakable — the triangulated web of diagonals over
every field becomes a network with junctions and open ground between.

The rule is worth keeping in one sentence: **RNG is a subgraph of Gabriel, so
the edges Gabriel has and RNG does not are exactly the diagonals** — 13,451 of
36,611 lanes — and dropping those without splitting the network is the whole
change. Roads and trunks are untouched, so the map from the air is identical by
design and what loosened is the knot you are standing in.

**And it found the half of the problem that is not the graph, which corrects
something I said this morning.** I quoted the 12%-against-1-2% figure as if it
were a like-for-like target. It is not:

```
  road per km2 at Ulm, this network      0.078 km/km2
  Germany's real inter-urban network     0.64  km/km2   — eight times denser
```

The network is already **eight times sparser than the real country** and still
covered a quarter of the ground, because **a lane is drawn 8.25 units wide:
3.26 m to the car on it, and 3.28 km on the planet it is drawn on.** Draw
Germany's own roads with this pen and you get **210% — the country paved twice
over.** So about 12 of the 25 points at Ulm were the graph and about 13 are
`ROAD_CLASSES[].width`, and that number is downstream of the vehicles being
placed at twice their authored scale, which is downstream of the person. Not a
constant to nudge. Written down rather than fixed.

## Log — 10:42, the camera follows you now, and the clamp was the wrong fix

The user: *"si camino con la S (hacia atras) no veo por donde voy, quiero que la
camara me siga por detras"*. The pull that swings the view back behind you was
gated on `max(0, move.y)` — zero when walking backwards — and the reason was
written down and correct as far as it went: swing the camera behind a man
walking backwards and `S` points the other way, so he turns, so the camera
swings again.

**The oscillation is not caused by the pull. It is caused by the input being
re-derived from the camera every frame**, so the clamp was answering at the
wrong end. Two changes:

- **`rig.steer` is a sampled copy of `heading`, and `WASD` is measured against
  it.** It is re-taken when the movement changes — a key down or up, or a stop —
  or when the mouse turns the view, and carried across the surface in between.
  So what a held key names is a fixed direction in the world and the camera is
  free to come round behind it. The clamp is `min(1, |move|)` now.
- **The rush.** `RETURN_MAX` is a *radius*: 32 deg/s times `velocity/RUN_SPEED`
  holds the arc at 340 units whether you walk or run. An about-face is not a
  curve — the body has already turned at `TURN_SMOOTHING` 0.09 s — so pricing it
  as an arc gave a half-turn a 340-unit radius: **11 deg/s, fourteen seconds and
  a thousand units of walking.** The ceiling opens with the error and **latches**
  once it opens, because gating on the error alone leaves a tail longer than the
  turn: 7.6 s of which 6.5 was the last fifty degrees.

Evaluated exactly as `camera.ts` evaluates it, stepping the same law at 60 Hz:

```
  about-face, walking    180 deg -> behind in 2.87 s   (was ~14)
  about-face, running    180 deg -> behind in 2.87 s
  quarter turn, walking   90 deg -> behind in 2.27 s
  held diagonal, running 41.4 deg -> behind in 2.38 s  (was: never)
  small drift, walking    10 deg -> behind in 1.60 s
```

Two consequences worth knowing. **The speed factor rides the radius half only** —
scaling the rush by speed would put the same argument on both sides of its own
exception, and it measured as one, 3.5 s at a walk against 1.2. And **a held
diagonal is now a straight line** where the trap records it as a 340-unit circle
that never converged; that trap needs correcting once this is seen on screen.

Also done: **`Tab` lists the landmarks of the country you are standing in
first.** It is a sort key and not a filter, deliberately — landmarks stand in 59
of 234 countries, so a filter would make the key do nothing in three quarters of
the world and nothing at all at sea.

## Log — 11:04, the user left, five agents running

The screen is theirs again and goes off. The OLED guard is running as
`oled-guard.sh` with its PID in `oled-guard.pid` — **kill it by that PID, never
by pattern.** I killed my own shell an hour ago with a `pkill -f
atlas-screen-guard` whose pattern matched the command running it, which is the
same over-broad-pkill lesson three agents were told about last night, arriving
by a different door.

All five agents told: the screen stays off, **and screenshots work with it off**
so nothing about verifying visually changes; share the one dev server; and if
they finish while nobody is reading, append to this file rather than only
reporting, so the work survives the session ending.

Live: the settlement size law and density, the flag overlay and the frontiers,
the fauna kit, the start menu, and the solar system. I hold `main.ts`,
`camera.ts`, `input.ts`, `index.html` and `navigation.ts` and am the one wiring
each of them in.

Owed and not yet done: **the camera change and `Tab` have not been seen on a
screen.** The turn law was evaluated exactly, stepping the same arithmetic at
60 Hz, and `tsc` is clean — but an automated tab freezes `requestAnimationFrame`
and my live traces came back as zeros. It needs a look before it is called done,
and the diagonal-is-a-circle trap in `docs/traps.md` needs correcting once it
has had one.

## Log — the settlements, and the size law under them

Two briefs that turned out to be one: **Pending 3 (the towns are thin)** and,
half way through, **the user's own sentence** — *"se nota como si el mundo
estuviera lleno de casas sin fin, no parece que haya ciudades sino casas por
todo"*. They are the same problem from two ends, and the second one is the
reason the first could not be solved by adding houses.

**First, a correction to the handoff.** The brief said last night's settlement
agent "died before it landed anything". It landed a great deal: `PLOT_PITCH`
13 → 11 with the plot sizes decoupled (`PlotOptions.plot`), the fill floor, the
green belt re-derived as a width, the civic gated on the town's size instead of
its population, gardens, and the centre-building fallback. Measured on arrival:
**median 12 parts and 5 buildings, 0 of 823 building nothing, 0 with no
building** — against the item's *9 parts and 20 empty*. The item was stale, not
the tree. `docs/traps.md` did not have those measurements; they are in the file's
own comments.

### What I changed

- **`radiusFor` is `0.465 * pop^0.36` clamped to [12, 150]**, from
  `3.97 * pop^0.1876` clamped to [10, 100]. The exponent is the whole story:
  0.1876 turned a population ratio of 1,258 into a size ratio of **3.8**.
- **The plot lattice is capped by the parts that stand on it.** `style.spacing`
  was sizing the plot and nothing checked whether the region owned a building
  big enough to use it — seven of fourteen regions had a 100% fit rate, which
  is a lattice with nothing in the kit large enough to fill it.
- **A hamlet gets no green belt, no approach and a fill of 1.** Under six cells
  a village *is* its own centre.
- **`detailRadiusFor`** floors the land mesh's refinement pad at 20 units,
  because `PAD_MIN_EDGE` is an absolute 7.33 and a 12-unit village is three of
  them across.
- **The floor is the built cells grown by one, claimed twice.** An isolated
  building no longer gets a paved halo.
- **The bake's bow limit is 0.3, from 0.5**, which is a `pnpm life` failure my
  own re-bake surfaced (below).
- Re-baked `places` and `roads`. Not `data` or `lakes` — nothing in them depends
  on the size law and another agent is live in `globe.ts`.

### The measurements that decided it

```
                        before          after
  places                23,866          29,545        (+24%, wire 266 -> 331 KB)
  roads                 36,212          42,804        (wire 128 -> 153 KB)
  radius p10/med/p90    20.4 25.4 37.6  12.0 15.2 30.9
  biggest / median      3.8x            9.9x
  built ground          62.8 Mu2        50.4 Mu2      (-20%)
  over 70% covered      57.9%           42.9%         open country, at last
  capitals absorbed     15              15            same fifteen, Hong Kong swapped for Macau
  parts / buildings     12 / 5          8 / 4         both fell on purpose
  p10 buildings         1               2             no settlement is one shed
  builds nothing        0 of 823        0 of 823
  town ground mesh-cut  2.80%           2.21%         worst 9.83 at Balikpapan
  per town, on foot     0.84 calls      0.90 calls    one town is still one draw call
  per town, triangles   1,995           1,261
  Ulm resident / tris   122 / 270,596   140 / 194,242
```

**The counter-intuitive one, and I would not have believed it without the
sweep: a steeper law absorbs *fewer* famous names.** What decides whether
Amsterdam survives Rotterdam is the size of a million-person city, not of a
twenty-million one, and a steep law with a small coefficient is smaller through
the whole middle. `0.62 p^0.35` — which grows the middle instead of the top —
loses Amsterdam, Bratislava and Rabat. The shipped law loses the same fifteen
capitals the flat one did.

**And the cap is bounded by the map before it is bounded by the frame.** The
triangle budget says a town may take a fifth of 380,000, which puts it at 150.
Independently: Beijing and Tianjin are 282 units apart, so any cap over 141
deletes Tianjin. Two bounds, take the smaller. At 200 — the first candidate —
the Pearl River Delta collapses into Guangzhou and Tianjin goes.

**`MIN_APPARENT_PIXELS` now does the job it was written for.** Over Ulm:

```
  altitude   resident   parts   triangles
  3 (foot)      140     1,705    196,370
  1,200         140     1,406    160,796
  6,000         105     3,888    458,048
  12,000         35     3,646    448,212
  23,000          9     3,119    414,648
```

Nine cities standing at the plane's ceiling, where the answer used to be zero,
because a city is now big enough to pass the pixel test from the air.

### What it cost, said plainly

- **A metropolis is a 43.7 ms hitch.** Beijing is 514 plots and 80,960
  triangles — 21% of the resident budget for one town — and `raise` builds a
  town atomically. Shanghai is 34.4 ms. It was 13.5 before. Splitting a large
  town's build across frames is the next move and is not built.
- **The budget overshoots at altitude**: 458,048 triangles against 380,000,
  because the cap is checked before a town is started and the last one admitted
  can now be 80,000 on its own. The vegetation trap in a second place.
- **+69 KB on the wire**, which is the names of 5,679 more villages.
- **`pnpm life` failed and I bounded it rather than fixed it.** A walker crossed
  Palma's coast at **101.5 units a second against a walking speed of 45** —
  the bow ripple CLAUDE.md already carries as known and unfixed, surfaced by a
  re-bake that moved a hard-bowed road into the sample. Capping the bake's bow
  at 0.3 takes it to **67.9 against a band of 70**, and costs 91 roads, 29
  components and 24 more places with no road. **Two units of margin is a bound,
  not a fix**; the honest fix is an arc-length reparameterisation of
  `roadPoint` and the next re-bake can put this back over the line.

### Files I touched that were not mine

`src/places.ts` (the user approved it mid-session), and then four one-line
consequences of it: `src/roads.ts`'s `classOf` thresholds, which are documented
as read off the size distribution and would otherwise have demoted a whole class
of road silently; `src/main.ts`'s single `setDetailSites` call, which has to
match the one `pnpm check` builds its mesh from or the game's land differs from
the checked land; `scripts/check-world.ts`'s radius assertion, which encoded the
old law's clamps and passed while the law was flat; and `scripts/build-roads.ts`
for the bow. Every one is named in the report.

Verified visually with the panel dark, through `toDataURL` into an `<img>`
overlay — the canvas itself comes back stale over CDP with the loop asleep, and
that is worth knowing: **the HUD updates in the screenshot and the WebGL frame
does not.** Frames taken at Gschwend (a village), Ulm (a town) and Beijing (a
city) at the same cameras before and after, plus Oklahoma City, Tromso, Goundam
and a hamlet at the kerb.

`pnpm check`, `pnpm typecheck`, `pnpm people`, `pnpm traffic` and `pnpm life`
all pass.

---

## The start menu: pick your spawn off the real globe — `src/menu.ts`

New files only. **I did not touch `main.ts`, `index.html` or `input.ts`** — the
exact patch for `main.ts` is at the end of this section, three insertions.

| file | what it is |
|---|---|
| `src/menu.ts` | the menu. The only file that matters. |
| `src/menu-sheet.ts` + `menu-sheet.html` | the review sheet, `/menu-sheet.html`. `pnpm dev` only, deliberately not a `vite.config.ts` build input — the `flags.html` rule. |
| `docs/traps.md` | a new *The start menu* section, eight traps with their measurements. |

### What it is

On load, the whole Earth from 2.47 radii — **the real one**: the same `scene`,
the same land mesh, the same sea, the same cloud deck, the same sun at the real
hour, drawn by the same `outline.render`. Drag to turn it. Hover a country and
its own outline lights up in gold with a name card; click it and the camera
flies down and frames it; click a town and that is where you wake up. `Esc` goes
back a stage, `Enter` or the gold **Play** button skips straight in with your
last choice.

**What I reused rather than rebuilt**, which is most of it: `globe.ts`'s
`onSphere` and the `scene` it already filled; `geo.ts`'s `countryAt` and
`toLatLon`; `world.rings` — the *same arrays the land mesh is triangulated from*,
so the highlight cannot disagree with the coastline it is drawn on;
`terrain.ts`'s `reliefAt` so the ribbon rides the mountains; `places.ts`'s
`Place`; `cartography.ts`'s `thinMarks`, `LabelSpace` and `css`, imported and not
copied; `theme.ts`'s palette; and `index.html` + `map.ts`'s card language for the
CSS. **It builds no geometry except one ribbon** and adds no material to the
world.

### The numbers

- **Interactive 10 ms after `buildLand` returns** — median of nine runs, range
  3–37 ms, measured in the sheet's own timeline as `menu interactive − land`.
  Four stages of `main.ts` and nine dynamic imports arrive underneath a globe
  the player is already turning.
- **7,436 bytes gzipped**, with everything it imports marked external because
  every one of them is already in the first load. It belongs in `deferred`; a
  static import would put 7 KB of parse in front of the first data fetch.
- **Hover costs one ribbon build, cached per country for the session**: 5.8 ms
  for Nigeria, **20.9 ms for the Russian Federation** — the worst in the world,
  once, on the frame you first cross it.
- **The highlight renders for +2 draw calls and 2× its geometry**: France's
  1,614-triangle ribbon measured +2 calls and +3,228 drawn triangles across both
  outline passes.
- The seconds either side are the machine: with five agents running, the land
  build alone swung **7.8 s to 17.6 s** over nine runs of identical code, and
  `main.ts` reached its first frame at 13,544 and 15,276 ms. **Quote the 10 ms
  and the 7.4 KB, not the seconds.**

### Handedness — `atlasMenu.verify()`

Three mirrors have shipped here and two were in map code. This menu has **no map
basis**: every mark is `Vector3.project(camera)` and every click is `unproject`,
so the basis is the camera's own `matrixWorld`. That moves the question rather
than answering it, so the witness is a third party — the gazetteer and the
outlines, neither of which has heard of this camera. Standing over Rome:

```
  screen right . east   1.0000        east is right   true   (814 < 942 < 1035)
  screen up . north     1.0000        north is up     true   (283 < 519)
  ribbon normal . up    1.0000
  Madrid -> Spain · Rome -> Italy · Athens -> Greece · Oslo -> Norway · Tunis -> Tunisia
```

`ribbon normal . up` read **-1** on the first build and nothing on the screen
could say so, because the material was `DoubleSide`. It is `FrontSide` now, so a
reversed ribbon is simply not there. Full write-up in `docs/traps.md`.

### The pointer handover

**There is nothing to hand over, and that is the design.** `input.ts` installs
its lock-requesting `click` listener on `renderer.domElement`, and `map.ts` binds
`M` on the window — and `main.ts` constructs both of them *after* `createPlayer`.
So a menu that resolves in front of `createPlayer` has no lock to release, no
keys to suppress and no second overlay to coordinate with. It is an ordering,
not a mechanism. **Move the menu after `createInput` and all three problems come
back.**

The menu hides `#loading`, `#hud` and `#hint` while it is up and restores them in
`dispose()`. It reads `#loading-stage`'s text once a frame and shows it in a
crimson corner card ("building the world · raising the monuments") until
`ready()` is called, so `main.ts` needs to publish nothing new.

### The planet-step seam — for whoever is building the solar system

`createMenu` takes `bodies: readonly MenuBody[]`. **One body and the body stage
never appears; two and it is the first thing you see** — a row of cards, then the
country stage on whichever was picked. Nothing in the file mentions Earth,
`World`, `Place` or `PLANET_RADIUS` except `earthBody`, which is the whole
adapter and is eighteen lines.

```ts
export interface MenuBody {
  id: string;                    // 'earth'
  name: string;                  // shown on the card and in the header
  note: string;                  // one line under the name
  radius: number;                // sea-level radius in world units
  centre: THREE.Vector3;         // world-space centre. Earth is the origin; you are not.
  relief(x: number, y: number, z: number): number;   // height over `radius` at a unit-sphere point
  regions: readonly MenuRegion[];                    // "countries"
  regionAt(lat: number, lon: number): number;        // 1-based into `regions`; 0 = nothing
  sites: readonly MenuSite[];                        // "cities"
}
export interface MenuRegion {
  key: string;      // join key; on Earth ADM0_A3
  name: string;
  note: string;     // one line in the hover card; on Earth the continent
  lat: number; lon: number;                          // label point, and the spawn if it has no sites
  rings: { points: number[][]; height: number }[];   // [lon, lat] pairs, implicitly closed
}
export interface MenuSite {
  name: string;
  key: string;      // joins MenuRegion.key
  lat: number; lon: number;
  weight: number;   // thinning order; on Earth, population
  capital?: boolean;
}
export function earthBody(world: World, places: readonly Place[]): MenuBody;
```

Everything camera-side is already written against `body.centre` and
`body.radius`, so a planet somewhere other than the origin needs no change here.
Add your bodies to the array; do not fork the file.

### The exact patch for `main.ts` — three insertions

**1.** one line in `deferred` (line ~114), so the chunk lands during the build:

```ts
    /** The front door. 7.4 KB gzipped; see `docs/traps.md`. */
    menu: import('./menu.ts'),
```

**2.** immediately after `scene.add(buildLand(world));` (line ~157) — this is the
line that decides time-to-first-interaction, and it must be **before** the
weather, the monuments and everything else:

```ts
  const { createMenu, earthBody } = await deferred.menu;
  const menu = createMenu({
    bodies: [earthBody(world, places.all)],
    scene,
    renderer,
    // outline.render, not renderer.render: a frame here is two passes.
    draw: (target, camera) => outline.render(target, camera),
    fallback: { lat: START.lat, lon: START.lon, name: 'Palma' },
  });
  document.body.appendChild(menu.root);
```

**3.** at the `packing your bag` stage, replacing `createPlayer(world, START.lat,
START.lon)`:

```ts
  menu.ready();
  const spawn = await menu.choose();
  const player = createPlayer(world, spawn.lat, spawn.lon);
```

and then, **after** `createInput` and `rig.snap(player, groundAt)` are done:

```ts
  menu.dispose();
```

Optional, one line, any time after `clouds` and `oceanLights` exist — it gives
the menu the moving sun, the surf and the weather. Without it the globe is drawn
with whatever `createSky` set at construction, which is a still sun and looks
fine:

```ts
  menu.beforeRender = (camera) => {
    const altitude = Math.max(1, camera.position.length() - PLANET_RADIUS);
    fog.near = Math.sqrt(2 * PLANET_RADIUS * altitude) * 0.2;
    fog.far = fogFar(altitude, PLANET_RADIUS);
    sky.update(camera.position.clone().setLength(PLANET_RADIUS), camera.position);
    setSunDirection(sky.state.sun, sky.state.solar.subsolarLon);
    clouds.update(sky.state.time, camera.position, fog);
    oceanSun.copy(sky.sun.position).normalize();
    oceanMoon.copy(sky.moon.position).normalize();
    oceanLights[0]!.intensity = sky.sun.intensity;
    oceanLights[1]!.intensity = sky.moon.intensity;
    ocean.update(camera.position, oceanLights);
  };
```

`src/menu-sheet.ts` is a working copy of all of the above if the ordering is
easier to read than to describe.

**The full API:**

```ts
createMenu(deps: MenuDeps): Menu
interface MenuDeps {
  bodies: readonly MenuBody[];
  scene: THREE.Scene;
  renderer: THREE.WebGLRenderer;   // the menu sizes it; main.ts does not until the loop starts
  draw(scene: THREE.Scene, camera: THREE.Camera): void;
  fallback: { lat: number; lon: number; name: string };
}
interface Menu {
  root: HTMLElement;                       // append it; dispose removes it
  camera: THREE.PerspectiveCamera;         // its own; rig.camera does not exist yet
  beforeRender: ((camera: THREE.PerspectiveCamera) => void) | null;
  choose(): Promise<MenuSpawn>;            // { body, region, name, lat, lon }
  ready(): void;                           // the world has finished building
  verify(): Record<string, unknown>;       // the handedness check
  dispose(): void;
}
```

`globalThis.atlasMenu` is the live instance while the menu is up, and goes away
with it — for the console, the way `atlas` is.

### Verified, with the panel dark

Screenshots at 1,884 x 931 through CDP of: the globe on arrival; a hovered
country (Mali, India, Nigeria, Romania, France, Russian Federation) with its gold
ribbon and name card; the drag turning the planet from Africa to south Asia; the
flight down; the city stage over **Spain (38 pins, 30 labelled)**, **France (48
pins, the overseas territories on the far limb)**, **Kenya (29 pins, Nairobi's
dot gold because it is the capital)** and **Nigeria**; `Esc` returning to the
globe; and the sheet's "spawning at Nairobi · Kenya · -1.283, 36.817" after a pin
click. `pnpm typecheck` clean throughout.

### What I left, and it is honest rather than hidden

- **A country under cloud is a country under cloud.** At the city stage the
  camera is 3,500–4,300 units up and the deck is at 1,000, so sometimes the
  ground you are picking over is white. The pins are DOM and always on top, so it
  is legible; it is the real weather at the real hour and I did not special-case
  it. One line in `beforeRender` hides the deck if anyone wants it gone.
- **`MAX_PINS` is 48** and it binds in large countries. France has ~250 towns and
  shows its 48 biggest.
- **The 20.9 ms Russia hover** is a one-frame hitch the first time you cross it.
  Decimating the rings for the ribbon would fix it and is not built.
- **No planet stage is built beyond the card list.** That is deliberate — the
  seam is above.
- **`menu-sheet.html` is not in `vite.config.ts`'s build inputs.** Dev only, by
  the rule written beside `flags.html`. If it should ship, the note there says
  measure the world's first load before adding an entry.

## Log — the solar system: the orbits, the scale, and Mars end to end

`src/system/` is new and nothing in `src/` imports it. Built twice back to back,
with the directory present and moved aside: **31 chunks, 1,405.76 kB raw, 453.27
kB gzipped, identical chunk for chunk and byte for byte.** Earth's first load has
not moved and cannot, because there is no edge into this graph yet.

`node scripts/check-system.ts` passes. `npx tsc --noEmit` is clean.

### 1. The orbits — Standish's elements, checked against three things that are not this file

96 numbers (eight planets, six elements and six secular rates each) in
`src/system/orbits.ts`, fitted 1800–2050. **A table in a source file, like
`flag-data.ts` and `timezone.ts`** — not an external asset.

The whole point of the checking is that **a planet in the wrong place looks
exactly like a planet in the right place**, so nothing compares the model with
itself:

```
  sidereal period, derived from the mean-longitude rate, against the published:
    mercury 87.97/87.97   venus 224.70/224.70   earth 365.26/365.26
    mars 686.98/686.98    jupiter 4332.82/4332.59   saturn 10755.88/10759.22
    uranus 30687.40/30685.40   neptune 60189.66/60189.00
    worst 0.031% (Saturn).  Kepler's third law P^2/a^3: every one within 0.13%,
    out of two columns (a and Ldot) that were fitted separately.

  Earth's perihelion  0.98330 au on 2026-01-03T18Z  (published 0.98329, 3-4 Jan)
  Earth's aphelion    1.01670 au on 2026-07-05T09Z  (published 1.01671, 3-6 Jul)

  Mars at opposition, computed against the almanac — FIVE OF FIVE ON THE DAY:
    2020-10-13T23:24  2022-12-08T05:32  2025-01-16T02:37
    2027-02-19T15:44  2029-03-25T07:23

  the sun's declination, this file against src/sun.ts, 384 samples 2020-2035:
    mean 5.4 arcsec, worst 12.5 at 2020-03-20

  Kepler's equation, worst residual over 3,200 solves: 3.6e-12 deg
```

**The opposition row is the strongest of them.** An opposition is two
heliocentric longitudes coming level, so it needs both orbits right at once —
periods, phases at J2000, eccentricities, inclinations — and it cannot be passed
with either wrong. The synodic intervals come out 785.3, 769.9, 764.5, 764.7 d:
not constant, and that they are not is Mars's 0.093 eccentricity rather than an
error.

**The `sun.ts` row cost a frame first, and it is the best find of the night.**
The two disagreed by **0.195 degrees of declination at 2035-09-15, growing with
the date** — which looks exactly like an epoch error and is not one. Standish's
elements are referred to the **J2000 mean ecliptic and equinox**, fixed at an
instant; NOAA's mean longitude carries 36000.76983 deg/century, the *tropical*
rate, with precession in it. 1.397 deg/century of drift, 0.49 deg of longitude by
2035. Add general precession and it is 5.4 arcsec. **Two self-consistent systems,
each correct in its own frame, visible only to a third party** — the mirrored
globe's fault exactly.

**The moon is in too**, which answers the question directly: `moonPosition` gives
geocentric longitude, latitude, distance and phase from the head of the lunar
theory (the evection, the variation, the annual equation, each named). **Mean
synodic month 29.52386 d against a real 29.53059**, and 357,472–406,645 km
against a real 356,500–406,700. It is a *position*, and it does not change what
`sun.ts` draws — that moon is a lantern on purpose, always full and opposite the
sun, because night on the ground needs one directional light for the ramp.

### 2. The scale — two of them, and the second is the lie every orrery tells

Written into `src/system/contract.ts` with its arithmetic.

**The surface scale is not a choice.** The avatar is 6.8 units and is a person on
every world, so km-per-unit is fixed at Earth's 0.398 and a body's walkable
radius is its real radius over that. Mars 8,512 units — a 6.9-minute lap at a
run against Earth's 12.9. Mercury is a 4.9-minute planet.

**The system scale is compressed once, linearly: 1,000 units to the au, ellipses
untouched.** Two walls force it and the first is the one to reach for:

- **Float32 makes true scale impossible, not merely empty.** At Neptune's true
  1.13e10 world units the spacing between representable numbers is **1,024 units
  — 151 avatars.** No rendering trick answers that; the orbit itself cannot be
  stored.
- Earth seen from Mars at closest approach, true scale, on this project's own
  lens: **0.153 px.**

**What is lied about is body size.** At 1,000 u/au Earth's true radius is 0.0426
units. The exaggeration is spent under one rule the check asserts — *two
neighbouring bodies' drawn radii must sum to under half the gap between their
orbits* — and a square-root law fits with room:

```
  sun / mercury   146.3 of a 307-unit gap   47.6%   <- the binding one
  mercury / venus  44.6 of 252              17.7%
  venus / earth    55.3 of 255              21.7%
  earth / mars     48.4 of 365              13.3%
```

**The Sun cannot be on that law.** It is 109 Earth radii and Mercury's perihelion
is 66 solar radii, so at `EARTH_DRAWN` = 28 the law asks for a Sun of 293 against
a perihelion of 307 — Mercury inside the star. Solving for the exponent that
holds both gives q <= 0.14, at which Jupiter is 1.4 Earths and the giants are
gone. So the Sun is capped at 129 by its own constraint and gives up its ratio:
**4.6 times Earth where it is really 109.**

**Below a size a body is a pin.** Earth's 28-unit disc from a whole-system
framing is 0.9 px, so `settlements.ts`'s inequality decides it one level up:
geometry inside `234 * radius`, a mark outside. The widest view is nine pins on
eight true ellipses, drawn from the data like `map.ts`.

### 3. Mars, end to end

Every coordinate in `bodies/mars.ts` is real, which is the only reason the check
can exist. **15 countries, 24 cities, 9 biomes**, named after the provinces every
Mars map has carried since Schiaparelli. Two are enclaves — Isidis inside Syrtis,
Marineris inside Noachis — so `nationAt`'s smallest-cap rule is exercised by the
data and not only by a unit test, the way Lesotho exercises `countryAt`.

The ground model is `biome.ts`'s shape with a different second axis, and the
substitution is not one of convenience: **a world with no water cycle has no
moisture, and Mars's second axis is dust** — the axis its own map has been drawn
in since 1659. Fifteen named places, fifteen right:

```
  Olympus Mons rock   Syrtis Major basalt   Arabia Terra dust   Boreum ice
  Ascraeus rock       Meridiani basalt      Amazonis dust       Australe ice
  Elysium Mons lava   Acidalia basalt       Hellas dust         Vastitas frost
  Valles Marineris chasma   Terra Sirenum basalt   Argyre dust
```

Relief is the real volcanoes and basins plus ridged noise, with the **crustal
dichotomy as one dot product** — the northern third five km below the southern
highlands, the largest single fact about Martian topography, one term.

### 4. The aliens — four species, and gravity is the lever

`src/system/alien.ts` is one parametric body. A `Morph` describes a species, an
`Alien` one member, `buildAlien` reads nothing else and touches no `Rng` — which
is `people.ts`'s arrangement with **the topology moving too**: leg pairs, arm
pairs, trunk segments, eyes, crown, tail.

**The lever points both ways, which is what stops four species being one with a
dial turned.** Martian at 0.38 g: 10.2 units, five heads, half its height in leg,
`depth` 0.68, four arms. Bathyd at 8.87 g and 92 atmospheres: 4.9 units, three
heads, a third in leg, `depth` **1.35**, two leg pairs. The widest and narrowest
trunks in the kit.

```
  species   builds   tris worst/median   meshes   height   worst dip
  cinder       480        488 / 440        30      5.80    -0.0000
  bathyd       672        504 / 420        26      7.00    -0.0000
  martian    1,440        488 / 408        29     12.70    -0.0000
  gale         672        472 / 416        31     14.85    -0.0000

  distinguishable at 5% of the inked area, over 240 seeds:
    martian 223 at 40 u, 221 at 120, 210 at 300      (Earth's is 779/840 = 93%)
    gale    214 / 195 / 180      bathyd 193 / 194 / 140     cinder 181 / 169 / 146
```

**And the two forks hold on all four**: 200/200 are the identical person in every
country and 200/200 are dressed differently somewhere. A country's wardrobe
colour is that country's own map colour at a chance — a rule, not a second table.

Six decorations (`wind-stone`, `dust-drift`, `iron-spire`, `frost-fan`,
`sulphur-vent`, `ice-plume`), 40–176 triangles, every one claimed by some biome
and every one deterministic.

### What a planet must expose for the start menu — the interface, for brokering

Three things and one function, all on `src/system/index.ts`. **The menu should
import nothing else from this directory**, and it must arrive through an
`import()` so Earth's first load stays where it is.

```ts
import { BODIES, body, walkable, positionOf, drawnRadius, orbitFor } from './system/index.ts';
```

- **`BODIES: readonly Body[]`** — step one. Already sorted by distance from the
  Sun (derived from the semi-major axis, not written down). Per body the menu
  wants: `id`, `name`, `kind` (`star`/`rocky`/`giant`/`moon`), `blurb` (one
  sentence for the card), `look.surface` (a `PALETTE` entry — draw the disc in
  it), `look.sky`, and `radiusKm`.
- **`Body.nations: readonly Nation[]`** — step two. `{ id, name, lat, lon,
  radius (degrees), color, note }`. A **spherical cap**, not an outline: there is
  no `countries.bin` for Mars and there is not going to be one. Resolve a point
  with `nationAt(body, lat, lon)`, which returns the **smallest containing cap**
  — the same rule `countryAt` uses for Lesotho inside South Africa.
- **`Body.settlements: readonly Settlement[]`** — step three.
  `{ id, name, lat, lon, population, nation }` — the same shape `places.bin`
  decodes to, so menu code written against Earth's places works unchanged.
- **`positionOf(id, date): {x,y,z}`** — where it actually is, in the orrery's
  frame and units, if the menu wants today's system rather than a diagram.
  `orbitFor(orbitId, date)` gives the ellipse as a closed polyline.

**Two things the menu must NOT have to know.** It must not know the scale —
`drawnRadius(body)` and `AU_UNITS` are the orrery's business. And it must not
carry a list of what is walkable: **`walkable(body)`** answers from the data, so
the Sun greys out without a hard-coded id.

**Earth's row is deliberately empty of nations and settlements**, and that is the
seam the menu has to respect: for Earth the menu should ask `geo.ts`'s
`countryAt` and `places.bin`, which are exact over real cartography. Everywhere
else it asks this file. One branch, on `body.id === 'earth'`, and
`walkable`/`nations.length` both signal it.

### What is NOT built — honestly

- **Nothing renders.** There is no orrery mesh, no pin field, no ellipse
  geometry. Every number above is headless. The `Vec3`s and the drawn radii are
  there for whoever builds it.
- **No per-body `PLANET_RADIUS`.** `globe.ts` holds one module constant that
  fog, the plane's ceiling, the streamers and the land mesh all derive from, and
  making it per-world is that file's change and not mine. `surfaceRadiusOf` is
  declared and asserted so it cannot rot; **Earth is still the only world you can
  stand on.**
- **Jupiter, Saturn and Uranus have no rows**, and neither does the Moon as a
  body (its *position* exists). Adding one is a file: physical facts, a `look`, a
  `makeGround` spec, some caps and a `Morph`.
- **No `pnpm system` in `package.json`** — that file is held by the coordinator.
  It wants `"system": "node scripts/check-system.ts"`.
- **The relief ceiling of 12% of a body's radius is a number to falsify, not a
  measurement.** Nothing stands on another world to falsify it with. It is aimed
  at the cloud deck's limb finding (Earth is at 4.25% and reads smooth).
- **`main.ts`, `sun.ts`, `index.html` and `package.json` were not touched**, as
  instructed. No dev server was started and no Chrome tab was opened: all of this
  is headless, so there was nothing to look at.
- **Three species have no place to stand and one has no world drawn.** The
  cinder, the bathyd and the gale are built and measured and there is no ground
  under any of them.

### One argument with the brief

The brief's order was orbits, scale, one planet, then the rest — and it is the
right order; I followed it. The one thing I would change: **the scale decision
needed the orbits to exist before it could be argued**, because the float32 wall
is a fact about `AU / KM_PER_UNIT` and I could not state it until the au was in
the same file as `PLANET_RADIUS`. In practice they were one step, not two, and
the write-up in `contract.ts` was the last thing written rather than the first.

## Log — the flags on the land, and the frontiers nobody could see

Two jobs, both the user's own words: *"una opcion modificable para que la tierra
en los paises tenga por encima la bandera del pais... un poco bajada"* and
*"no veo la frontera que te dije para separar paises... que sea una discontinua
gruesa"*. Files touched: `src/globe.ts`, `src/borders.ts`, a new
`src/land-flags.ts`, and `docs/traps.md`. **Nothing in `main.ts`, `input.ts` or
`index.html`** — the toggle is reachable with no wiring at all, and the one line
I would like added is at the bottom of this entry.

`npx tsc --noEmit` and `node scripts/check-world.ts` both pass. `npx vite build`
confirms the initial preload is **241 KB over ten chunks**, unchanged.

### What made the frontiers invisible, measured before anything was changed

They were all there. `createBorders` was building **147,958 triangles from
39,440 frontier edges against 62,963 coastal ones, and 92.1% of them at full
width** — the geometry was correct and complete. Three things, none of them a
bug in the data:

- **The band was a shadow.** Each ring shaded 26 units *inward* from the line in
  its own ground colour at 62%, fading back to the ground, so a frontier was a
  52-unit trough of darker earth. `scenery/ground.ts` already had the sentence:
  *a dark neutral on the ground is not a road, it is a shadow*. Same failure, one
  file over.
- **The line was priced as if it were the pen.** `OutlineEffect` is screen space
  and holds four pixels at any range; a world quad is `937 * w / range`, so 2.4
  units is 37 px standing on it and **1.9 px at the on-foot fog, 1.9 px again
  from 1,200 units up** — which is the altitude you would actually be looking for
  a border from.
- **It was drawn twice.** **18,361 of 39,153 frontier edges (46.9%) are held by
  both countries**, and each ring ran its dash phase from its own point 0 in the
  opposite direction, so where one drew a gap the other drew a dash.

### What it is now

A **7-unit dashed ink line, drawn once**, and no shading at all: **37,578
triangles against 147,958, built in 239 ms against 1,407** with `coastEdges`
warm in both, 2.7 MB against 10.7. The country-coloured band is **deleted**
rather than tuned — the flag fill says whose ground it is, and two things saying
the same thing is how the weaker one survives.

Three smaller things fell out and are in `docs/traps.md` with their numbers:
ownership goes to the lower ring index so one ring owns a whole shared run and
the phase stays unbroken; **287 "frontier" edges were on lake rings** and drew an
international border round a lakeshore (a lake's `country` is 0); and a quad
corner 3.5 units off the line is *in the lake*, so the ground is sampled on the
line and the shore fade is gated on the lower of a piece's two ends — the lowest
drawn vertex went from `LIFT` above **sea level** to 19.50.

### The flag overlay

`src/land-flags.ts`. **No texture and no asset**: `flags.ts` already draws all
234 flags from the vector specs in `flag-data.ts`, so one is rasterised into a
scratch canvas *on the CPU*, read back once, and used to pick the colour of each
land triangle. What ships to the card is the same `Uint8` vertex-colour
attribute the land mesh always had — no second mesh, no second material, no
shader hook, **no extra draw call and no extra triangle**.

**The projection.** A flag is a rectangle and a country is not one box: Spain's
box over *all* its rings runs lat 27.6 to 43.8, which squeezes the mainland into
the top half of its own flag. So a country is a **family** of rings around its
largest one, and any ring whose centre falls more than 0.35 box-widths outside
it flies a whole flag of its own. The threshold sits in a gap you could drive a
lorry through — Mallorca 0.000, Menorca 0.062, Corsica 0.071, Crete 0.218,
Hokkaido 0.244 against Svalbard 0.52, Alaska 0.57, **the Canaries 0.90–1.05**,
the Azores 4.90–6.65 — and nothing named changes side anywhere between 0.25 and
0.50. So the Balearics continue the mainland's bands exactly as the reference
picture draws them, **and each Canary island flies its own complete flag**, which
is the thing the user noticed was missing. Verified at 25 named places.
Longitudes are unwrapped before the box is taken, which is what puts Chukotka
back on Russia's flag (1.33 box-widths outside wrapped, **0.03** unwrapped) and
what stops Fiji and the Chathams tearing. Antarctica's box is 359.4 degrees wide,
so it is sampled at the flag's own middle column — a cap has no east-west axis.

**The opacity is 0.60 and it was solved, not chosen.** The yardstick is the cel
ramp's own faintest step: `DAY_MOOD` is `0.45 0.633 0.817 1.0` and ambient plus
hemisphere are not routed through it, so the smallest step the light itself makes
arrives as **16.6% of relative luminance**. All 228 flags were rasterised at the
size the land samples them: the median edge inside a flag is 0.79 and **0.41 at
the tenth percentile**, so the p10 flag clears 16.6% at opacity **0.40**. The
land mesh's own colour attribute, p5 to p95 within each of 167 countries, has a
median spread of **0.62** (Spain 0.62, Russia 1.04, Norway 1.19, Chile 1.20), so
the median country still out-steps the light up to **0.73**. 0.60 is where the
two margins are equal: `0.60 × 0.41 = 0.246` against `0.40 × 0.62 = 0.248`. And
the middle of the window is the *worst* place for identity — red at 0.40 over
Castile's green is a muddy brown that reads as neither.

**The cel banding cannot be lost at any opacity** and that is worth saying
plainly: the bands are the ramp *multiplying* the diffuse, so changing the
diffuse changes what is stepped, never whether it steps. What a wash costs is the
biome, which is why the ceiling above is about the biome and not about the ramp.

**Cost.** Off: **zero**. `globe.ts` reaches the module through a dynamic
`import()`, so neither it nor `flags.ts` nor the 2,091 lines of `flag-data.ts`
are in the initial graph — confirmed by `vite build`: `land-flags` is its own
3.96 kB chunk and `flags` a 41.7 kB one shared with `hud.ts` and `map.ts`, and
the preload is still 241 KB over ten chunks. On: a one-time bake of **185–228
ms** (612 flag boxes, 1,644,225 of 1,644,313 triangles painted), then 21.4 MB of
side buffers — one copy of the colour attribute plus four bytes a triangle — and
after that **1 ms to turn off and 38 ms to turn on again**, measured. Turning
them off restores the mesh's colours byte for byte. No draw call, no triangle,
no frame cost. `buildLand` records **1,556 pairs of integers, 61 KB**, so the mesh
can be walked by ring — a country index per triangle would have been 2.5 MB paid
whether or not anyone presses the key.

### The one line I want, and the key

`buildLand` already hangs the toggle on the mesh, so this works today with no
wiring:

```js
atlas.scene.getObjectByName('land').userData.flags(true)
```

For the HUD I would like it published as `atlas.flags`, which is two lines in
`main.ts` — keep the mesh in a variable and add one entry to the `atlas` object:

```ts
const land = buildLand(world);            // line ~154, was scene.add(buildLand(world))
scene.add(land);
// ...in the atlas object, beside `borders`:
flags: (on?: boolean | number) => landFlags(world, land, on),
```

`landFlags` is exported from `./globe.ts` and is already imported there. It is
**async** (it awaits the chunk on the first call) and resolves to
`{ on, opacity, families, painted, triangles, megabytes, buildMs }`.

- `atlas.flags()` — read the state, builds nothing
- `atlas.flags(true)` / `atlas.flags(false)` — on at the last opacity, off
- `atlas.flags(0.45)` — on, and set the opacity; the honest window is 0.40 to 0.73

**Key: `B`** — *banderas*, and free: the legend holds W A S D, Shift, Space, C,
F, E, V, M, Tab and `[` `]`, and B is not among them. The legend row I would add:

```
B  flags
```

### Owed, and written down rather than fixed

- **`pnpm check` does not know about either of these.** The frontier assertions
  are the old ones and still pass; nothing asserts the flag families. The obvious
  one is the named-place table I ran by hand — the Balearics continue Spain and
  the Canaries do not — and `flagFamilies(world)` is exported for exactly that.
  I did not add it because `scripts/check-world.ts` was not mine tonight.
- **Towns, roads and vegetation are not flagged.** They take their colour from
  `groundColorAt`, which the overlay deliberately does not touch, so with flags on
  a settlement is an unflagged patch on a flagged country. It reads as an object
  standing on a map, which is defensible, but it is a decision and not an
  oversight.
- **The overlay breaks the `groundColorAt`-agrees-with-the-mesh law while it is
  on.** That law is asserted by `pnpm check`, which builds the mesh and never
  toggles, so nothing fails — but anything that later samples the mesh's colours
  expecting the biome will be wrong while the flags are up.
- **A few US rings in the Alaskan panhandle join the lower-48 family** and push
  its box to lon -136.6 / lat 58.4, which shifts the stripes over the lower 48 a
  little. It is the honest consequence of one margin and I left it.

## Land animals — `src/fauna/`, and herds in `src/life.ts`

The user's ask: *"Faltan animales terrestres, solo he visto aves. en el desierto
podria haber camellos."* Overrules the documented refusal in `CLAUDE.md`, so the
kit was built to the bar that sentence set rather than to the cheapest one.

**All of it is done and green.** `pnpm fauna` — 46 checks, all pass.
`node scripts/check-life.ts` still passes. `npx tsc --noEmit` clean.

### Files

```
  src/fauna/contract.ts     scale, the gait law, KINDS, Animal, validateAnimal, the context
  src/fauna/body.ts         one parametric quadruped: legs, poses, the re-seat
  src/fauna/regions.ts      BY_BIOME (climate) + RANGE (range map) + FAUNA_STYLES
  src/fauna/index.ts        the registry over parts/
  src/fauna/parts/*.ts      camel, cattle, horse, llama, reindeer, sheep
  scripts/check-fauna.ts    504 builds, a 128-phase gait sweep, the world, ASCII silhouettes
  fauna-sheet.html          the review sheet — dev only, like flags.html
  src/fauna-sheet.ts
```

Edited: `src/life.ts` (the `herd` family), `docs/traps.md` (new cluster *The
fauna*), `docs/built.md` (new section *Fauna*, and its "animals are absent on
purpose" paragraph corrected), `CLAUDE.md` (Pending 5, Layout, Commands, the
read-before table, `atlas.life.stats`).

### THE ONE THING I NEED WIRED — `package.json`

I did not touch it. Please add, next to `"life"`:

```json
    "fauna": "node scripts/check-fauna.ts",
```

Nothing in `main.ts` or `index.html` needs to change: `life.ts` takes the animal
registry through `LifeOptions.animals`, exactly as it takes `vehicles`, and with
it absent the herd scan is gated off and the world is unchanged. **To turn the
animals on**, `main.ts`'s `createLife(...)` call needs one more option, beside
the existing `vehicles`:

```ts
// with the other deferred imports:
const fauna = await import('./fauna/index.ts');
// and in the createLife options object, next to `vehicles`:
animals: fauna.ANIMALS,
```

`src/fauna/index.ts` uses `import.meta.glob`, so it belongs in the **deferred**
set with the other registries — nothing in the first frame needs it.
`vite.config.ts` needs nothing: the sheet is dev-only on purpose, following
`flags.html`'s recorded reasoning.

### What it cost, and the two bugs I fixed in someone else's numbers

- A herd is **one draw call for five animals**. Ulm at detail 1: **8 herds, 41
  animals, 9 meshes, 12,200 triangles**. As movers that would be 41 meshes.
- **`slantRange(altitude, 0)` is the altitude, not zero**, so `CEILING.road`,
  `.foot`, `.water` and `.air` in `life.ts` had never actually switched a family
  off — they re-admitted the disc directly under the aircraft, which is the
  radius bug `view.ts` exists to have deleted. `rangeFor` returns a hard zero
  now. This changes the other three families as well as mine, and it makes
  `built.md`'s *at 3,000 units up there is nothing at all* true rather than
  nearly true.
- The herd keep-out around a settlement started at `radiusFor(pop) + 40` and
  **left zero herds around Ulm at the shipped detail**. It is +12.

### The cactus question, answered

The user also asked *"¿y cactus no hay?"*. Measured headless over the real
`vegetation.ts`: **no, they could not reasonably have seen one, and it is not
close.** Standing dead centre in the Chihuahuan — the best spot on the planet —
the world holds **3 cacti at the shipped detail 0.5, nearest 485 units away**.
Anywhere a player actually goes it is a flat 0.

**The range map is not the problem and the cover is not either.** The dominant
term is the *classifier*: `biomeAt` returns **temperate at 71 of 121 probes over
the Sonoran** (32.0 N, -112.5 W) and desert at **zero**, so Arizona is a
broadleaf woodland in this world and the desert plant list is never reached
there. Over 11,832 equal-area land samples, desert-in-a-cactus-region is
**2.24% of the planet's land**, and North America contributes **five points**,
all in the Trans-Pecos. `zonalMoisture` is a pure function of latitude with no
continentality or rain-shadow term.

**That is a `biome.ts` change and `biome.ts` is not mine**, so I have not made
it. It also has to pay `pnpm check`'s 25 named places. The cheap alternative, if
the classifier is off the table, is the *weight* and not the cover: cactus is
third in `BIOMES.desert.plants`, which `floraFor`'s geometric weights make
**12.25%** of an already-0.03 cover — one cactus per **247 units** of desert
ground, against that file's own trap that a plant every 260 units reads as
noise. Reordering to `['cactus', 'boulder', 'palm-tree']` takes it to 60.5%, one
per ~111 units, and costs the Old World almost nothing (Sahara goes from
boulder 67%/palm 33% to 69%/31%). That is arithmetic, not a measurement — I did
not build the reordered variant.

**Incidental, and someone should look:** `atlas.detail(0.25)` — the documented
bottom of the range — builds **zero vegetation tiles anywhere**. Reach 288 units
against a level-3 tile 1,396 across.

### What I left, deliberately

- **Nothing moves.** Every animal placed is standing. The walk is built, swept
  and on the sheet; a moving herd wants the walker's baked-phase machinery,
  which is already in `life.ts` for the crowd. This was the right order: the
  merged static herd is the cheap half and the visible half.
- **Nothing is wild.** Six livestock species; the savanna gets zebu cattle and
  no zebra. Africa's megafauna is the obvious next wave and it is a bigger
  modelling job than a proportion table.
- **Nothing lies down.** `lie` is the cheapest remaining pose and would do most
  for a field reading as lived-in.
- **The horse's head is big and its neck reads flat** at 15 units on the sheet.
  It is inside every cap and I did not chase it.

## Log — 11:23, the front door is wired, and the optional block was not optional

Wired the menu into `main.ts` — the three insertions the agent left, plus the
one it called optional. **It is not optional and the failure is worth keeping:**
wired without `menu.beforeRender`, the globe came back as a **flat mauve ball**.
Not a bug in the menu — `fog.far` doing exactly what it says. Every fog number
in this project is calibrated for a camera standing on the planet, where the
land's horizon is about 1,400 units at eye height, and the menu's camera is 2.47
radii out, near 39,000. Forty times its own range is a solid wash.

That also moved the ocean-light vectors up beside the clouds, because the menu
draws the same world **before the frame loop that used to own them exists**.

With it: the real Earth from space, biome colours, the Sahara gold against the
Sahel band, real weather, the terminator across the Atlantic limb, stars. The
front door is the world at the hour it actually is.

Also: **the detail knob was left at 1.2207 and is back to 0.5.** The standing
instruction while agents are running is 0.5, and with a metropolis now costing a
43.7 ms build that is not a cosmetic difference.

### Owed from the settlements landing, in priority order

- **A metropolis is a 43.7 ms hitch.** Beijing is 514 plots and 80,960
  triangles, 21% of the budget for one town, and `raise` builds atomically.
- **The bow ceiling came down 0.5 -> 0.3 and cost 91 roads, 29 components and 24
  more towns with no road** — data damaged to bound a *mover's* artefact. The
  trade is small and was measured and disclosed, so it stands for now, but the
  honest fix is named: arc-length reparameterisation. **And it is safer than it
  sounds — reparameterising does not move the curve, only the rate along it, so
  the path the bake tested for water is unchanged.** It can be done entirely in
  `life.ts` with a small monotone table per route, which keeps "nothing
  integrates" intact.
- The build budget overshoots at altitude, 458,048 against 380,000, because the
  cap is checked before a town is started.

## Log — 11:40, all five landed and are wired; one does not work

Wired this morning: the start menu into `main.ts` (four insertions, not three —
see 11:23), the flag overlay on `B` with its legend row, the fauna registry into
`createLife`, and `pnpm fauna` and `pnpm system` into `package.json`. **Every
check passes**: world, fauna, life, traffic, people, system, and `tsc`.

Seen on screen and confirmed by me rather than by a report:

- **The front door.** The real Earth from space, biome colours, weather, the
  terminator, stars. It is the best thing in the project.
- **The flags.** `atlas.flags(true)` paints 612 families in 209 ms for **no draw
  call and no triangle** — it repaints the colour attribute the mesh already
  had. Morocco red, Portugal green-and-red, the Sahara's gold still reading
  through at 0.60.
- **The frontiers, at last.** Thick dashed ink across the Sahara where three
  countries meet. They were never missing: they were a 52-unit trough of
  *darker earth*, which is the same failure `scenery/ground.ts` already writes
  down about roads — a dark neutral on the ground is a shadow, not a line — and
  they were drawn twice, 46.9% of frontier edges being held by both countries
  with each running its dash phase from its own end.

**And one that does not work: no herd appears in the browser, anywhere.** Sahara,
Ireland, the Pampas and Mongolia all read `herd 0, animals 0` at detail 0.5, 1
and 3, while `pnpm fauna`'s 46 checks pass headless. Every input I could check by
hand at the failing spot is right — ground, biome, `BY_BIOME`, region, density,
`nativeHere`, the registry, and the page really does fetch all six part files.
The lead is that **`lastScanMs` reads 1.9 ms** and `life.group` holds one mesh:
a scan that had walked its herd cells could not be that cheap, so the branch is
not being entered. Handed back to its author with the measurements, and with the
observation that this is the one streamer in the project that **cannot be
interrogated from the console** — every other one can, which is why every other
one gets diagnosed in a minute.

Also worth knowing for anyone poking at this repo: **`window.atlas` does not
exist until you leave the start menu.** That is new this morning and it will
catch the review sheets and every console session.

### Follow-up: "no herd ever appears in the browser" — it does; the reading was stale

**The wiring you did is correct and nothing needed changing.** Verified in the
running page after waking the render loop:

```
  atlas.life.herds  -> registry 6, range 517, cells 195, chanced 53, inRange 16,
                       land 16, stocked 16, dense 15, clearOfTown 11, offered 11,
                       admitted 3
  atlas.life.stats  -> road 4, foot 4, herd 3, animals 11, birds 11
  atlas.life.group  -> herd:g-2.85, herd:g-1.88, herd:g-6.86
```

**I have photographed them.** Cream zebu cattle with dark horns, standing in the
savanna outside a village east of Nairobi, at ordinary game framing:
`/tmp/claude-chrome-screenshots-GG5J8l/screenshot-1788601478394-25.png`

**What actually happened.** `requestAnimationFrame` is frozen while the tab is
hidden — `CLAUDE.md` records this — so `atlas.goTo` moved the player and
`life.update` never ran. In my own session, before the first screenshot, *every*
counter read 0 including `birds` and `lastScanMs`. Four `goTo` calls with no
screenshot between them return the same frame four times.

**The tell was in your own table and neither of us read it: `birds 24` at all
four places.** How many birds a place has is `BIOMES[id].cover` — 0.03 in the
Sahara against 0.5 in Ireland — so an identical bird count at four biomes is not
a scan that ran, it is a scan that did not. Headless the same build gives 4 / 14
/ 3 / 28.

Neither of your two suspects was it, for the record: `rangeFor(HERD_REACH,
CEILING.herd)` is fine because the ceiling is on *altitude* and the reach is on
*ground distance* — they are different quantities, and it measured 517 at the
spawn. And `bestiary` gets the option correctly — `registry` reads 6.

**What I kept from it**, because you were right that this one could not be
interrogated:

- **`atlas.life.herds`** — a counter per gate, in the order the scan applies
  them, because `stats.herd` reads 0 whether the registry is empty, the range is
  zero, the ground is wet, the biome is bare or the budget is full, and those are
  five bugs with one symptom.
- **`herds.frame`** — an update counter, so a reading that cannot advance says so
  itself. **Read it first.**
- `pnpm fauna` now asserts the cold-arrival latency, which was the other
  plausible story and is killed by the number: **first bird on frame 1, first
  herd on frame 2**, all herds by frame 4. A herd has to be served out of
  `BUILD_BUDGET_MS` where the flock needs no pool at all, so the two could have
  diverged; they do not.
- New trap in `docs/traps.md`, and `atlas.life.herds` added to `CLAUDE.md`'s
  debugging list.

To read it yourself: click **Play**, take **one screenshot** to wake the loop,
then read `atlas.life.herds`. Without the screenshot every number is zero.

## Log — 11:48, a correction: the herds were there and my measurement was not

The entry above says no herd appears in the browser. **That is wrong and it was
my own measurement that was broken.** `requestAnimationFrame` is frozen while a
tab is hidden — this file's own parent, `CLAUDE.md`, records it, and I quoted it
in this session — so four `goTo` calls with no screenshot between them returned
the same stale frame four times and `life.update` never ran once.

Verified myself just now, after one screenshot to wake the loop: **2 herds, 8
animals**, and a cream zebu with dark horns standing in savanna between acacias
east of Nairobi.

**The tell was in my own table and I published it without reading it.** I
reported `birds 24` at the Sahara, Ireland, the Pampas and Mongolia — four
biomes whose `cover` runs from 0.03 to about 0.5, and which give 4 / 14 / 3 / 28
birds headless. **An identical count at four different biomes is not a scan that
found the same thing; it is a scan that did not run.** I read four zeros as the
signal and ignored the one number that was neither zero nor varying.

What came out of it is worth more than the bug. `atlas.life.herds` now counts
every gate in the order the scan applies them —

```
  registry 6 · altitude 203 · ceiling 900 · range 517 · cells 195 · chanced 53
  inRange 16 · land 16 · stocked 16 · dense 15 · clearOfTown 11 · offered 11
  admitted 3
```

— because `stats.herd` reads 0 whether the registry is empty, the range is zero,
the ground is wet, the biome is bare or the budget is full: **five bugs, one
symptom.** And `herds.frame` is an update counter, so a reading taken against a
frozen loop now says so itself instead of looking like data. Read it first.

Both of my suspects were wrong, and one deserves recording: `CEILING.herd` at
900 against a `HERD_REACH` of 950 is not a contradiction, because **the ceiling
is on altitude and the reach is on ground distance** — different quantities that
happen to share a unit.
