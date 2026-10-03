/**
 * The Selenites: the people of the Moon, **entirely invented**, named for the
 * ones H. G. Wells put in its caverns in 1901 and housed where real geology
 * says a people could be housed — the lava tubes. GRAIL's gravity maps allow
 * tubes kilometres wide under the maria, and the orbiters have photographed the
 * skylights where their roofs fell in; in the shade under the Mare
 * Tranquillitatis pit's overhang the temperature holds near 17 °C through a
 * fortnight of day and a fortnight of night (Diviner's measurement, 2022),
 * against +120 and −170 on the surface. So the Selenites live down there and come up to
 * the porch, and a town on this world is a porch.
 *
 * **The body has an argument, as the Martian's does.** A sixth of a g makes
 * every step a bound, and a bounding animal's problem is not holding itself up
 * but *landing*: so four legs and a low, wide, barrel body, for the same
 * reason the Lunar Module stood on four legs splayed wide and not on two. They
 * come up to a visitor's chest. Four eyes, two pairs: a big pair for the dark
 * of the tubes and the earthlit night, a small pair for the glare of day. A
 * frill at the back of the head, which on a world with no air to carry sound
 * is how they *hear*: they press it to the rock, and talk through the ground.
 *
 * **What they make** is in their architecture: heaps of regolith over vaults,
 * which is what a real lunar habitat would be (a metre of soil stops the
 * radiation); collars round the skylights with winches over them; dishes that
 * gather earthlight in the long night; and tall lanterns, because the one
 * colour every Selenite loves is the blue of the planet hanging in their sky.
 */

import * as THREE from 'three';
import type { Species } from '../../../system/contract.ts';
import { BODY_SCALE } from '../../../stature.ts';
import { PALETTE } from '../../../theme.ts';
import type { BuildingBuilder, Civilisation } from '../../contract.ts';
import { defineCivilisation } from '../../contract.ts';
import { ball, dome } from '../../architecture.ts';

export const SELENITE: Species = {
  id: 'selenite',
  name: 'Selenite',
  morph: {
    id: 'selenite',
    name: 'Selenite',
    // About three quarters of a person: they come up to your chest.
    height: 5.0 * BODY_SCALE,
    heads: 3,
    legShare: 0.4,
    legPairs: 2,
    armPairs: 1,
    segments: 1,
    shoulderShare: 0.13,
    hipShare: 0.15,
    depth: 1.2,
    neck: 'short',
    headSides: 8,
    eyes: 4,
    crown: 'frill',
    tail: 0,
    limbR: 0.03,
  },
  // Warm, pale, the colour of the inside of a shell: on grey ground anything
  // grey vanishes, and a people who live in the dark have no reason to be dark.
  hides: [PALETTE.blush, PALETTE.salmon, PALETTE.apricot, PALETTE.cream, PALETTE.sand, PALETTE.pink],
  wears: [
    { item: 'cloak', weight: 4 },
    { item: 'harness', weight: 3 },
    { item: 'wrap', weight: 2 },
    { item: 'none', weight: 2 },
  ],
  carries: [
    { item: 'none', weight: 4 },
    // A jar of earthlight: see the phrasebook.
    { item: 'vessel', weight: 3 },
    { item: 'staff', weight: 2 },
    { item: 'pack', weight: 2 },
  ],
  trims: [PALETTE.bark, PALETTE.steel, PALETTE.slate, PALETTE.ink],
  // Earth's colours, which no Selenite has seen anywhere but on Earth's face.
  accents: [PALETTE.skyBlue, PALETTE.green, PALETTE.white, PALETTE.gold],
};

// ---------------------------------------------------------------------------
// The buildings
// ---------------------------------------------------------------------------

/**
 * The porch over a skylight, which is the middle of every Selenite town: a
 * collar of piled stone round a shaft into the dark, a gantry over it with the
 * winch drum, and four lanterns. The shaft is drawn as a disc of ink, which
 * is what a hole into a lava tube looks like at noon.
 */
const skylight: BuildingBuilder = (ctx, rng, style) => {
  const group = new THREE.Group();
  const r = rng.range(4.2, 5.2);
  const wall = rng.pick(style.walls);
  group.add(ctx.ringWall(r, r + 2.2, 1.3, wall, 14));
  const coping = ctx.ringWall(r - 0.2, r + 0.6, 0.35, ctx.tone(wall, 0.85), 14);
  coping.position.y = 1.3;
  group.add(coping);
  const shaft = ctx.column(r, 0.1, PALETTE.ink, 14);
  shaft.position.y = 0.02;
  group.add(shaft);
  const frame = rng.pick(style.roofs);
  const top = r + 4.5;
  for (const side of [-1, 1]) {
    group.add(ctx.strut(new THREE.Vector3(side * (r + 1.2), 1.3, -1.6), new THREE.Vector3(side * (r * 0.55), top, 0), 0.45, frame));
    group.add(ctx.strut(new THREE.Vector3(side * (r + 1.2), 1.3, 1.6), new THREE.Vector3(side * (r * 0.55), top, 0), 0.45, frame));
  }
  group.add(ctx.strut(new THREE.Vector3(-r * 0.6, top, 0), new THREE.Vector3(r * 0.6, top, 0), 0.6, frame));
  const drum = ctx.column(0.9, r * 0.7, rng.pick(style.accents), 10);
  drum.rotation.z = Math.PI / 2;
  drum.position.set(r * 0.35, top - 1.1, 0);
  group.add(drum);
  const cable = ctx.column(0.08, top - 1.6, PALETTE.ink, 4);
  cable.position.y = 0.2;
  group.add(cable);
  const lamp = rng.pick(style.accents);
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + (k * Math.PI) / 2;
    const post = ctx.column(0.22, 3.6, frame, 6);
    post.position.set(Math.sin(a) * (r + 1.1), 1.3, Math.cos(a) * (r + 1.1));
    group.add(post);
    const glow = ctx.lit(ball(ctx, 0.5, lamp, 8));
    glow.position.set(Math.sin(a) * (r + 1.1), 5.3, Math.cos(a) * (r + 1.1));
    group.add(glow);
  }
  return { group, radius: r + 2.3 };
};

/**
 * A house: a vault heaped with regolith, a metre of it, which stops the
 * radiation a lunar day pours down. A low mound with a round window in its
 * crown, an entrance porch, and a lamp on a post by the door.
 */
const mound: BuildingBuilder = (ctx, rng, style) => {
  const group = new THREE.Group();
  const r = rng.range(3.6, 5.2);
  const wall = rng.pick(style.walls);
  const heap = dome(ctx, r, wall, rng.range(0.5, 0.68), 10);
  group.add(heap);
  const skirt = ctx.taper(r * 1.08, r * 0.96, 0.6, ctx.tone(wall, 0.88), 10);
  group.add(skirt);
  const eye = ctx.column(r * 0.22, 0.35, rng.pick(style.accents), 8);
  eye.position.y = r * 0.5;
  group.add(eye);
  const porch = ctx.box(2.4, 2.5, 2.2, ctx.tone(wall, 0.92));
  porch.position.z = r * 0.82;
  group.add(porch);
  const lintel = ctx.box(2.8, 0.4, 2.4, rng.pick(style.roofs));
  lintel.position.set(0, 2.5, r * 0.82);
  group.add(lintel);
  const door = ctx.box(1.3, 1.9, 0.3, PALETTE.bark);
  door.position.z = r * 0.82 + 1.05;
  group.add(door);
  const post = ctx.column(0.14, 2.6, rng.pick(style.roofs), 6);
  post.position.set(1.7, 0, r * 0.82 + 0.9);
  group.add(post);
  const lamp = ctx.lit(ball(ctx, 0.32, rng.pick(style.accents), 8));
  lamp.position.set(1.7, 2.8, r * 0.82 + 0.9);
  group.add(lamp);
  return { group, radius: r * 1.08 + 0.4 };
};

/**
 * An earthlight mirror: a dish on a tripod, turned up to catch the light of the
 * full Earth through the fortnight-long night and pour it down a pipe into the
 * tube. The full Earth is forty times brighter in their sky than the full Moon
 * is in ours, and they waste none of it.
 */
const mirror: BuildingBuilder = (ctx, rng, style) => {
  const group = new THREE.Group();
  const r = rng.range(2.6, 3.6);
  const lift = rng.range(4.2, 5.6);
  const frame = rng.pick(style.roofs);
  const hub = new THREE.Vector3(0, lift, 0);
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    group.add(ctx.strut(new THREE.Vector3(Math.sin(a) * r * 0.9, 0, Math.cos(a) * r * 0.9), hub, 0.32, frame));
  }
  const dish = dome(ctx, r, PALETTE.white, 0.32, 14);
  // Turned over to a bowl, and tipped toward the Earth that never moves.
  const tilt = new THREE.Group();
  dish.rotation.x = Math.PI;
  dish.position.y = r * 0.32;
  tilt.add(dish);
  tilt.position.copy(hub);
  tilt.rotation.x = rng.range(0.3, 0.6);
  group.add(tilt);
  const pipe = ctx.column(0.35, lift, rng.pick(style.accents), 6);
  group.add(pipe);
  const hut = ctx.box(2.0, 1.6, 2.0, rng.pick(style.walls));
  hut.position.z = -r * 0.2;
  group.add(hut);
  return { group, radius: r * 1.05 };
};

/** A lantern mast: a tapering pole in rings, a blue lamp at the top and stays to the ground. */
const lantern: BuildingBuilder = (ctx, rng, style) => {
  const group = new THREE.Group();
  const h = rng.range(9, 14) * style.height;
  const base = ctx.taper(1.8, 1.2, 1.0, rng.pick(style.walls), 6);
  group.add(base);
  const mast = ctx.taper(0.45, 0.2, h, rng.pick(style.roofs), 6);
  mast.position.y = 1.0;
  group.add(mast);
  const accent = rng.pick(style.accents);
  for (const t of [0.35, 0.65]) {
    const ring = ctx.ringWall(0.4, 0.75, 0.3, accent, 10);
    ring.position.y = 1.0 + h * t;
    group.add(ring);
  }
  const lamp = ctx.lit(ball(ctx, 0.85, PALETTE.skyBlue, 10));
  lamp.position.y = 1.0 + h + 0.6;
  group.add(lamp);
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + 0.4;
    group.add(ctx.strut(new THREE.Vector3(Math.sin(a) * 2.4, 0, Math.cos(a) * 2.4), new THREE.Vector3(0, 1.0 + h * 0.6, 0), 0.1, PALETTE.ink));
  }
  return { group, radius: 2.5 };
};

// ---------------------------------------------------------------------------
// The civilisation
// ---------------------------------------------------------------------------

export const SELENITES: Civilisation = defineCivilisation(SELENITE, {
  // Round marks and dots, standing on a line like footprints on the ground:
  // phases and craters, which is what a people who look up and look down
  // every day would write with.
  script: {
    glyphs: 28,
    strokes: [1, 3],
    loops: 4,
    hooks: 1,
    bars: 1,
    dots: 3,
    zigzags: 0,
    slant: 0,
    line: 'base',
    consonants: 'lmnwhyb',
    vowels: 'ouoeiu',
  },
  // High and slow and sing-song: a small throat, and a voice carried through
  // rock rather than air, which takes its time.
  voice: { pitch: [240, 340], pace: [3.6, 5], tract: [1.25, 1.5], wander: 0.3 },
  phrases: {
    greet: [
      'Hop softly, visitor. The ground here remembers everything. Welcome to {place}.',
      'You came down on a column of fire, like the first ones did. Welcome to {nation}.',
      'Four feet and two hands bid you welcome. Mind your bounce.',
      'A Blue-Lander! Come into the shade; {place} keeps a little.',
      'We felt you land. The whole of {place} felt it through the rock. Hello.',
      'Good earthlight to you. That is how we say good morning, and good evening, and good fortnight.',
      'Welcome, heavy one. You walk as if the ground were pulling at you. Here it hardly bothers.',
      'Greetings from the porch of {place}. The house goes down a long way.',
    ],
    world: [
      '{place} is only the porch. The town is down the tube, where the lava ran three billion years ago.',
      'A day here lasts fourteen of yours, and so does the night. We sleep through most of the night.',
      'The nearest other town is {distance} away. We bound it in an afternoon; the afternoons are long.',
      'Nothing wears away here. A footprint lasts a million years, unless a meteorite steps on it.',
      'We keep the old landing places swept. The footprints are not ours, but somebody should look after them.',
      'Every hundred days we repaint the striped cloths at the landing places. The sun bleaches them white.',
      'The ground hums sometimes, very gently, for an hour at a time. We call it the long song, and we sing along.',
      'Tycho is young, only a hundred million years old. We find it rather loud.',
      'Your world hangs in the same place in our sky, always. We never needed a word for Earthrise.',
      'On the far side they have never seen the Blue One. They think we make it up.',
      'The dust is sharp, like broken glass: nothing has ever rounded it. Please wipe your feet.',
      'At the poles there are craters where the sun has never once shone. We keep our ice there, and our secrets.',
    ],
    visitor: [
      'Your world has phases in our sky, as ours does in yours. When it is full, our night is bright enough to read by.',
      'Is it true your sky is full of water that falls down on you? Does it hurt?',
      'From here your planet is blue and white and turning. We watch its clouds for luck.',
      'You weigh six times what you ought to. How do you ever get up in the morning?',
      'The second of you to walk here called it magnificent desolation. We have it stitched over the door.',
      'You left a mirror at Tranquility. Your people still shine lights at it from home; we wave back.',
      'Why did you stop coming, for so long? We kept the porch lamps lit.',
      'You came all that way and took home rocks. We have so many. Please, take more.',
      'One of you hit a ball with a stick here, twice. We found it, eventually. We have been practising.',
      'You brought three cars! They are still parked exactly where you left them. Nobody has moved them. Nobody would.',
    ],
    farewell: [
      'Bound well, and land on all your feet.',
      'Go gently. The dust will keep your footprints for you.',
      'Give our regards to the Blue One. We wave at it every evening.',
      'Keep the sun at your back and the Earth in front of you.',
      'Come back before nightfall. It is fourteen days long and very cold.',
      'Safe orbit, heavy one.',
    ],
  },
  architecture: {
    forms: [
      { item: 'mound', weight: 6 },
      { item: 'ring', weight: 2 },
      { item: 'pod', weight: 2 },
      { item: 'mirror', weight: 2 },
      { item: 'lantern', weight: 2 },
      { item: 'arch', weight: 1 },
    ],
    landmark: 'skylight',
    walls: [PALETTE.bone, PALETTE.cream, PALETTE.steel, PALETTE.bone],
    roofs: [PALETTE.steel, PALETTE.slate, PALETTE.bark],
    accents: [PALETTE.skyBlue, PALETTE.gold, PALETTE.apricot],
    // The paving a shade of steel: bone paving on bone regolith hid the town in its ground.
    ground: PALETTE.steel,
    height: 1,
    density: 3.2,
    avenues: 4,
    extra: { skylight, mound, mirror, lantern },
    colony: {
      modules: [{ item: 'house-single', weight: 3 }, { item: 'house-open', weight: 2 }, { item: 'geodesic-dome', weight: 2 }, { item: 'house-cylinder', weight: 1 }, { item: 'solar-array', weight: 2 }, { item: 'mound', weight: 2 }],
      centre: null,
      scale: 0.85,
      roofs: 0.5,
      yards: 0.45,
      tubes: true,
      gardens: [],
      spaceport: 100000,
    },
  },
  cast: { creatures: [{ item: 'mushnub', weight: 2 }, { item: 'greenblob', weight: 2 }], visitors: ['astronaut-bee', 'astronaut-redpanda'] },
  crowd: 0.8,
});
