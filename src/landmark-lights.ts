/**
 * The landmarks at night: which are floodlit and how, what on them shines of
 * its own, and where their red lights and their squares' lamps stand.
 *
 * **The sun is real, so about half of all visits to a landmark happen after
 * dark**, and until 2026-09-30 every one of them was a moonlit blue
 * silhouette with its own plaza's lamps out, standing in a town whose windows,
 * lamps and headlights all stopped at its feet. The destinations of the game
 * were the darkest things in it. What is here makes a landmark at night what it
 * is in the photograph everybody has of it: the warmest, most readable mass in
 * the frame.
 *
 * Three kinds of light, and none of them is a light in the renderer's sense —
 * `lights.ts` says why there must be none:
 *
 * - **The floodlight**, a wash evaluated per fragment from four bytes a vertex
 *   (`atlasFlood`: the height, the landmark's strength, the style, how cool),
 *   tinting the surface's own colour and capped under the bloom. Its look is
 *   `DEFAULT_LOOK` unless `LOOKS` says otherwise, and `DARK` lists what is
 *   not floodlit at all.
 * - **Lit parts**, the few things on a landmark that shine rather than being
 *   shone on — Big Ben's dials, Liberty's torch, Yasur's vent, the Space
 *   Needle's bead, the Empire State's gilt deck, and every plaza's lamp heads —
 *   as the two `atlasLit` bytes a town's windows carry.
 * - **Red aviation lights** on every landmark of `BEACON_HEIGHT` or more that
 *   is not dark, at the tips the bake finds in the model's own geometry.
 *
 * **Adding a monument is still one file and nothing else** (`monuments/index.ts`):
 * the default is a warm floodlight from the ground, normalised to the model's
 * own colours, and it is right for a building nobody has thought about. The
 * table is exceptions. `pnpm check` holds it to the registry — no stray ids, no
 * id both dark and styled, nothing taller than the tallest building on Earth
 * left lit — and every model, the defaulted ones included, to the bytes' rules.
 */
import * as THREE from 'three';
import type { Merged, MergePiece } from './merge.ts';
import { paletteName } from './monuments/contract.ts';
import { FLOOD_STRENGTH, FLOOD_TARGET, MAX_BEACONS, createBeacons, floodBytes, floodTint, glowBytes, nightAt, setLandmarkClock } from './lights.ts';
import type { FloodStyle } from './lights.ts';
import { PALETTE } from './theme.ts';
import { clockAt } from './timezone.ts';

/**
 * How one landmark is lit after dark. Every field has a default
 * (`DEFAULT_LOOK`) and a `LOOKS` entry names only what differs.
 */
export interface Look {
  /** Where the light comes from; see `FLOOD_STYLES` in `lights.ts`. */
  style: FloodStyle;
  /**
   * The light's colour: -1 sodium gold, 0 the warm flood, 1 the cool one
   * (`FLOOD_GOLD`, `FLOOD_WARM`, `FLOOD_COOL`), and anything between.
   */
  tint: number;
  /**
   * A multiple of the normalised strength (`FLOOD_TARGET`): 1 is a landmark
   * as bright as any other, 0 is no floodlight at all.
   */
  strength: number;
  /** For `crown`: the height, as a fraction of the model's, the lit crown starts at. */
  from: number;
  /**
   * The palette colours on this model that shine of themselves, and how
   * brightly as a share of a window (`glowBytes`). **Only small parts**: a
   * colour that is most of a model makes it a lantern, and `pnpm check` holds
   * every glow to `GLOW_SHARE` of the model's surface. Measured on 2026-09-30
   * the five here are 0.4 to 2.9% of theirs, where `gold` is 20% of the
   * Forbidden City and `white` 55% of the Golden Temple.
   */
  glow: Partial<Record<keyof typeof PALETTE, number>>;
  /** Red lights on its tips: absent is by height (`BEACON_HEIGHT`). */
  beacon?: boolean;
}

/**
 * A building nobody has said anything about: warm floodlights at its foot,
 * as nearly every floodlit facade in the world is lit.
 */
export const DEFAULT_LOOK: Readonly<Look> = { style: 'ground', tint: 0, strength: 1, from: 0, glow: {} };

/**
 * What is not floodlit, and it is two lists in one. **Nature**: nobody lights a
 * mountain, a glacier or a waterfall's gorge, and the ones that are lit sometimes
 * (Table Mountain's face, which Cape Town floods on some nights) are left dark
 * here rather than lit every night. **And the places people keep dark on
 * purpose**, which are real facts and were checked rather than remembered on
 * 2026-09-30: the Taj Mahal is not floodlit and is seen at night by moonlight,
 * on the five nights round the full moon; Angkor Wat's lighting has been
 * proposed since 2009 and refused (the temples close at sunset); Sigiriya
 * opens only on moonlit nights and the lit pictures of it are renders;
 * Kinderdijk's mills are lit one week a year; and the ruins in open country
 * (Stonehenge, Machu Picchu, Nan Madol, the moai, Ur, the Citadelle) stand in
 * the dark they stand in. The Terracotta Army is indoors.
 */
export const DARK: ReadonlySet<string> = new Set([
  'angel-falls',
  'angkor-wat',
  'avenue-of-the-baobabs',
  'borobudur',
  'citadelle-laferriere',
  'great-wall',
  'kilimanjaro',
  'kinderdijk',
  'lalibela',
  'machu-picchu',
  'moai-rapa-nui',
  'moeraki-boulders',
  'mount-everest',
  'mount-fuji',
  'nan-madol',
  'perito-moreno',
  'sigiriya',
  'stonehenge',
  'table-mountain',
  'taj-mahal',
  'terracotta-army',
  'the-pitons',
  'uluru',
  'victoria-falls',
  'ziggurat-of-ur',
]);

/**
 * The exceptions, and only them.
 *
 * - **Lit all over** (`whole`): the Eiffel Tower, whose sodium lamps sit inside
 *   the lattice and turn its brown gold (`FLOOD_GOLD`, and a third over the
 *   normalised strength, because gold is what the tower is at night) — and
 *   its sparkle — and Tokyo Tower, whose Landmark Light is the same sodium on
 *   orange paint. Cool: the glass and steel towers lit by their own LEDs and
 *   the Atomium's spheres.
 * - **Lit at the top** (`crown`): the Empire State, famous for it; Christ the
 *   Redeemer and Rushmore's faces, lit over a dark mountain.
 * - **Cool floods**: Liberty's pale green is lit white, and so are the Opera
 *   House's sails and Niagara (in colours, in life: white here).
 * - **Lit parts**: see `Look.glow`. Mount Yasur is not floodlit — it is a
 *   volcano — and its vent is the one light it has.
 */
export const LOOKS: Readonly<Record<string, Partial<Look>>> = {
  'eiffel-tower': { style: 'sparkle', tint: -1, strength: 1.3 },
  'tokyo-tower': { style: 'whole', tint: -0.6 },
  'burj-khalifa': { style: 'whole', tint: 1 },
  'cn-tower': { style: 'whole', tint: 1 },
  'petronas-towers': { style: 'whole', tint: 1 },
  'taipei-101': { style: 'whole', tint: 1 },
  atomium: { style: 'whole', tint: 1 },
  'space-needle': { style: 'whole', tint: 1, glow: { gold: 1 } },
  'empire-state': { style: 'crown', from: 0.64, glow: { gold: 0.9 } },
  'christ-the-redeemer': { style: 'crown', from: 0.36, tint: 1 },
  'mount-rushmore': { style: 'crown', from: 0.42 },
  'statue-of-liberty': { tint: 1, glow: { gold: 1 } },
  'sydney-opera-house': { tint: 0.7 },
  'niagara-falls': { tint: 1 },
  'big-ben': { glow: { white: 0.85 } },
  'mount-yasur': { strength: 0, glow: { orange: 1 }, beacon: false },
};

/** A landmark's look, or null for one of `DARK`. */
export function lookOf(id: string): Look | null {
  if (DARK.has(id)) return null;
  const own = LOOKS[id];
  return own === undefined ? DEFAULT_LOOK : { ...DEFAULT_LOOK, ...own };
}

/**
 * Metres, from `monuments.json`, at and over which a landmark that is lit
 * carries red aviation lights: the height from which the obstruction
 * lighting rules of most countries ask for them (150 m, ICAO Annex 14). Ten of
 * the 85 do, the Golden Gate on each of its four tower legs and the Petronas
 * on each tower.
 */
export const BEACON_HEIGHT = 150;

/**
 * The most of a model's surface that may shine of itself: see `Look.glow`.
 * A share of area and not of vertices, because a clock dial is a twelve-sided
 * disc and many vertices of it are a small thing — Big Ben's dials are 16% of
 * its vertices and 2.9% of its surface.
 */
export const GLOW_SHARE = 0.05;

/** A tip is a vertex this near the model's top, and tips this near each other across are one. */
const TIP_BAND = 0.6;
const TIP_CLUSTER = 3;
/** How far over its tip a beacon hangs, so the tip's own faces do not fight it for depth. */
const BEACON_LIFT = 0.5;
/** How far under its head's glass a plaza lamp's light hangs, as a road's lamp's (`LAMP_HEAD_DROP`). */
const LAMP_DROP = 0.3;

/** What the bake hands back: the two attributes and the marks the world places. */
export interface NightBake {
  /** Four bytes a vertex, `atlasFlood`: see `floodBytes`. */
  flood: Uint8Array;
  /** Two bytes a vertex, `atlasLit`: the lit parts and the plaza's lamp heads. */
  lit: Uint8Array;
  /** Beacon positions in the model's frame, xyz each, already lifted. */
  tips: Float32Array;
  /** The plaza's lamps, in the model's frame, xyz each, where their light hangs. */
  lamps: Float32Array;
  /** The normalised strength the flood was written with; 0 for a dark landmark. */
  strength: number;
  /** The model's top without its square, which the heights are fractions of. */
  top: number;
  /** Area-weighted luminance of the model's colours under its own flood's tint. */
  albedo: number;
  /** The share of the model's surface that shines of itself. */
  glowShare: number;
  /** Whether its look sparkles; see `LandmarkLights`. */
  sparkle: boolean;
}

const lum = (r: number, g: number, b: number): number => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const edgeA = new THREE.Vector3();
const edgeB = new THREE.Vector3();

/** The base palette name of a merged piece's colour stamp, or '' for none. */
function colourName(piece: MergePiece): string {
  const stamp = piece.material.userData.atlasToon as number | undefined;
  return stamp === undefined ? '' : paletteName(stamp).split('×')[0]!;
}

/**
 * Writes a landmark's night into bytes, once, beside its merge: one pass over
 * the vertices it already has, cached with its geometry (`placement.ts`).
 *
 * `square` is the plaza `landmark-setting.ts` built round it, merged into the
 * same buffer: it takes no floodlight of its own — its lamps light it, per
 * pixel, as a town's floor is lit — and its lamp heads are found by the mark
 * the setting puts on them. `height` is the source's metres, for the beacons.
 */
export function bakeNight(id: string, height: number | undefined, merged: Merged, pieces: readonly MergePiece[], square: THREE.Object3D | null): NightBake {
  const position = merged.position;
  const color = merged.color;
  const vertices = position.length / 3;
  const flood = new Uint8Array(vertices * 4);
  const lit = new Uint8Array(vertices * 2);
  const look = lookOf(id);
  const plaza = new Set<THREE.Object3D>();
  square?.traverse((object) => plaza.add(object));

  let top = 0;
  for (const piece of pieces) {
    if (plaza.has(piece.mesh)) continue;
    for (let v = piece.first; v < piece.first + piece.count; v++) top = Math.max(top, position[v * 3 + 1]!);
  }

  const tint = floodTint(look?.tint ?? 0, new THREE.Color());
  // The model's surface under its own tint, by area: what the strength is
  // normalised against, and what the glows are measured against.
  let area = 0;
  let weighted = 0;
  let glowArea = 0;
  const glowOf = new Map<MergePiece, number>();
  for (const piece of pieces) {
    if (plaza.has(piece.mesh)) continue;
    const glow = look?.glow[colourName(piece) as keyof typeof PALETTE] ?? 0;
    if (glow > 0) glowOf.set(piece, glow);
    for (let v = piece.first; v + 2 < piece.first + piece.count; v += 3) {
      const i = v * 3;
      edgeA.set(position[i + 3]! - position[i]!, position[i + 4]! - position[i + 1]!, position[i + 5]! - position[i + 2]!);
      edgeB.set(position[i + 6]! - position[i]!, position[i + 7]! - position[i + 1]!, position[i + 8]! - position[i + 2]!);
      const a = edgeA.cross(edgeB).length() / 2;
      area += a;
      weighted += a * lum(color[i]! * tint.r, color[i + 1]! * tint.g, color[i + 2]! * tint.b);
      if (glow > 0) glowArea += a;
    }
  }
  const albedo = area > 0 ? weighted / area : 0;
  const k =
    look === null || look.strength <= 0 || albedo <= 0
      ? 0
      : Math.min(FLOOD_STRENGTH[1], Math.max(FLOOD_STRENGTH[0], FLOOD_TARGET / albedo)) * look.strength;

  const from = look?.style === 'crown' ? look.from : 0;
  const lamps: number[] = [];
  for (const piece of pieces) {
    const end = piece.first + piece.count;
    if (plaza.has(piece.mesh)) {
      // A lamp head, marked by the setting: it burns, and its light pools.
      const mark = piece.mesh.userData.atlasLit;
      if (typeof mark !== 'number' || mark <= 0) continue;
      let x = 0;
      let z = 0;
      let low = Infinity;
      for (let v = piece.first; v < end; v++) {
        glowBytes(lit, v * 2, mark);
        x += position[v * 3]!;
        low = Math.min(low, position[v * 3 + 1]!);
        z += position[v * 3 + 2]!;
      }
      lamps.push(x / piece.count, low - LAMP_DROP, z / piece.count);
      continue;
    }
    const glow = glowOf.get(piece) ?? 0;
    for (let v = piece.first; v < end; v++) {
      if (k > 0) {
        const h = top > 0 ? (position[v * 3 + 1]! / top - from) / (1 - from) : 0;
        floodBytes(flood, v * 4, h, k, look!.style, look!.tint);
      }
      if (glow > 0) glowBytes(lit, v * 2, glow);
    }
  }

  // The tips: whatever reaches within `TIP_BAND` of the top, gathered across.
  const tips: number[] = [];
  if (look !== null && (look.beacon ?? ((height ?? 0) >= BEACON_HEIGHT))) {
    const clusters: { x: number; z: number; y: number; n: number }[] = [];
    for (const piece of pieces) {
      if (plaza.has(piece.mesh)) continue;
      for (let v = piece.first; v < piece.first + piece.count; v++) {
        const y = position[v * 3 + 1]!;
        if (y < top - TIP_BAND) continue;
        const x = position[v * 3]!;
        const z = position[v * 3 + 2]!;
        const near = clusters.find((c) => Math.hypot(c.x / c.n - x, c.z / c.n - z) < TIP_CLUSTER);
        if (near === undefined) clusters.push({ x, z, y, n: 1 });
        else {
          near.x += x;
          near.z += z;
          near.y = Math.max(near.y, y);
          near.n++;
        }
      }
    }
    for (const c of clusters) tips.push(c.x / c.n, c.y + BEACON_LIFT, c.z / c.n);
  }

  return {
    flood,
    lit,
    tips: new Float32Array(tips),
    lamps: new Float32Array(lamps),
    strength: k,
    top,
    albedo,
    glowShare: area > 0 ? glowArea / area : 0,
    sparkle: look?.style === 'sparkle' && k > 0,
  };
}

/** Where a sparkling landmark keeps its civil clock. */
interface Clocked {
  iso: string;
  lat: number;
  lon: number;
}

/** A standing landmark's marks, in world space. */
interface Standing {
  tips: Float32Array;
  lamps: Float32Array;
  clock: Clocked | null;
  /** Its local up, for its own terminator. */
  up: THREE.Vector3;
}

export interface LandmarkLights {
  /** The red lights of every standing landmark, one draw; add it to the scene once. */
  beacons: THREE.Points;
  /** A landmark standing, or moved: its baked marks placed with its model's matrix. */
  stand(id: string, placement: Clocked, model: THREE.Object3D, bake: NightBake): void;
  /** A landmark gone. */
  leave(id: string): void;
  /**
   * The plaza lamps near `viewer` into `out` after the `count` already there,
   * as `x, y, z, distance`, sorted and capped: `roads.lampsNear`'s contract, to
   * chain after it.
   */
  lampsNear(viewer: THREE.Vector3, radius: number, out: Float32Array, count: number): number;
  /** Once a frame: the beacons' positions if they moved, whether they are drawn at all, the blink, and the sparkle's clock. */
  update(time?: Date): void;
  /** The beacons' program, for `warm.ts`. */
  proxies(): THREE.Object3D[];
  /**
   * `true` or `false` holds the Eiffel Tower's sparkle on or off, for review;
   * `null`, the default, hands it back to Paris's clock.
   */
  sparkle: boolean | null;
  readonly stats: { standing: number; beacons: number; lamps: number; sparkling: boolean };
}

/**
 * The night's marks of the standing landmarks — their plaza lamps and their
 * red lights — kept in world space as they are raised, re-seated and dropped,
 * so a frame costs nothing unless one moved.
 *
 * **The sparkle keeps the civil clock and not the sun's**, and it is the only
 * light here that does: the Eiffel Tower sparkles for the first five minutes
 * of every hour after dark by the clocks in Paris, a thing a player standing
 * at the Trocadéro at nine can catch — and on solar time it would start at ten
 * past (`atlasSolarHour` has the argument for the windows, which is the other
 * way round). It reads `sky.state.time`, not the wall clock, so
 * `atlas.sky.setRate` runs it too.
 */
export function createLandmarkLights(): LandmarkLights {
  const beacons = createBeacons();
  const standing = new Map<string, Standing>();
  const scratch = new Float32Array(MAX_BEACONS * 3);
  const point = new THREE.Vector3();
  let moved = false;
  let clockSecond = -1;
  let sparkleOn = 0;
  const stats = { standing: 0, beacons: 0, lamps: 0, sparkling: false };

  const place = (local: Float32Array, matrix: THREE.Matrix4): Float32Array => {
    const out = new Float32Array(local.length);
    for (let i = 0; i + 2 < local.length; i += 3) {
      point.set(local[i]!, local[i + 1]!, local[i + 2]!).applyMatrix4(matrix);
      out[i] = point.x;
      out[i + 1] = point.y;
      out[i + 2] = point.z;
    }
    return out;
  };

  const lights: LandmarkLights = {
    beacons: beacons.points,
    sparkle: null,
    stats,
    stand(id, placement, model, bake) {
      model.updateMatrixWorld(true);
      standing.set(id, {
        tips: place(bake.tips, model.matrixWorld),
        lamps: place(bake.lamps, model.matrixWorld),
        clock: bake.sparkle ? { iso: placement.iso, lat: placement.lat, lon: placement.lon } : null,
        up: new THREE.Vector3().setFromMatrixPosition(model.matrixWorld).normalize(),
      });
      moved = true;
    },
    leave(id) {
      if (standing.delete(id)) moved = true;
    },
    lampsNear(viewer, radius, out, count) {
      const max = Math.floor(out.length / 4);
      let n = Math.min(count, max);
      for (const { lamps } of standing.values()) {
        for (let i = 0; i + 2 < lamps.length; i += 3) {
          const dx = lamps[i]! - viewer.x;
          const dy = lamps[i + 1]! - viewer.y;
          const dz = lamps[i + 2]! - viewer.z;
          const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
          if (d > radius) continue;
          // `roads.lampsNear`'s insertion: sorted by distance and capped.
          let at = n < max ? n : max - 1;
          if (n === max && d >= out[at * 4 + 3]!) continue;
          while (at > 0 && out[(at - 1) * 4 + 3]! > d) {
            out.copyWithin(at * 4, (at - 1) * 4, at * 4);
            at--;
          }
          out[at * 4] = lamps[i]!;
          out[at * 4 + 1] = lamps[i + 1]!;
          out[at * 4 + 2] = lamps[i + 2]!;
          out[at * 4 + 3] = d;
          if (n < max) n++;
        }
      }
      return n;
    },
    update(time) {
      // A landmark raised or dropped this frame asks the clock again below, so
      // a tower stood under a paused sky is not left on the last answer.
      const changed = moved;
      if (moved) {
        moved = false;
        let count = 0;
        let lamps = 0;
        for (const entry of standing.values()) {
          lamps += entry.lamps.length / 3;
          for (let i = 0; i + 2 < entry.tips.length && count < scratch.length / 3; i += 3) {
            scratch[count * 3] = entry.tips[i]!;
            scratch[count * 3 + 1] = entry.tips[i + 1]!;
            scratch[count * 3 + 2] = entry.tips[i + 2]!;
            count++;
          }
        }
        beacons.update(scratch, count);
        stats.standing = standing.size;
        stats.beacons = count;
        stats.lamps = lamps;
      }
      // The civil minute, asked once a second of the sky's clock and only
      // while something that sparkles is standing. And in the same pass the
      // red lights' draw, which is skipped while no tower that carries one is
      // past its own terminator: by day the points would only be discarded,
      // fragment by fragment, so the frame is spared the call altogether.
      if (time !== undefined) {
        const second = Math.floor(time.getTime() / 1000);
        if (second !== clockSecond || changed) {
          clockSecond = second;
          sparkleOn = 0;
          let lit = false;
          for (const { clock, up, tips } of standing.values()) {
            const dark = nightAt(up);
            if (tips.length > 0 && dark > 0) lit = true;
            if (clock === null || dark <= 0) continue;
            const minute = Number(clockAt(time, clock.iso, clock.lon, clock.lat).slice(3, 5));
            if (minute < 5) sparkleOn = 1;
          }
          beacons.points.visible = lit;
        }
      }
      const on = lights.sparkle === null ? sparkleOn : lights.sparkle ? 1 : 0;
      stats.sparkling = on > 0;
      setLandmarkClock(performance.now() / 1000, on);
    },
    proxies: () => [beacons.proxy()],
  };
  return lights;
}
