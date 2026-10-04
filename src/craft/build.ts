/**
 * What every craft is built with and what it is handed over as.
 *
 * **A craft is drawn as one buffer, plus one buffer a turning part.** The pieces
 * are built the way every code-built thing in this world is — through the
 * monument context's `box`, `strut`, `taper`, one toon material a colour, faceted
 * — and then reduced by `mergeMeshes` (`src/merge.ts`) to flat arrays with the
 * colour on the vertices and the ink's normal beside the fill's, exactly as a
 * town, a wood tile and a mover are. So a plane of forty pieces is one draw
 * call and one hull, its propeller a second, and a car its body and four
 * wheels. The material is the movers' own recipe: vertex colours on the
 * world's four-band ramp, the world's pen, the hull riding `outlineNormal`.
 *
 * **Two colours meeting in one merged mesh are only a problem when they share a
 * plane.** A merged buffer has no draw order, so a face painted over a face is
 * a z-fight that shows only when the camera moves; every piece laid on another
 * here stands proud of it by `PROUD` or more, as the scenery contract asks.
 */
import * as THREE from 'three';
import { varnish } from '../gloss.ts';
import { shadeByClouds } from '../cloud-shade.ts';
import { createContext, tone } from '../monuments/contract.ts';
import { PALETTE } from '../theme.ts';
import type { MonumentContext } from '../monuments/contract.ts';
import { mergeMeshes } from '../merge.ts';
import type { Merged } from '../merge.ts';
import type { CraftModel } from './contract.ts';

/** The least a piece laid on another stands off it: the scenery contract's `PROUD`. */
export const PROUD = 0.08;

let context: MonumentContext | null = null;
/**
 * One monument context for every craft, made on first use. `createContext`
 * registers its ramp with `theme.ts` so the moods repaint it, so it is made
 * once and not once per build.
 */
export function craftContext(): MonumentContext {
  context ??= createContext();
  return context;
}

let material: THREE.MeshToonMaterial | null = null;
/**
 * The one material every craft is drawn with: its colours are its vertices',
 * on the context's own ramp, inked along `outlineNormal`. Marked painted, so a
 * caller that merges a craft again (`mergeMeshes`) reads the vertex colours
 * rather than a stamp.
 */
export function craftMaterial(): THREE.MeshToonMaterial {
  if (material !== null) return material;
  const source = craftContext().toon(craftContext().palette.ink);
  material = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: source.gradientMap });
  material.userData.outlineParameters = { ...source.userData.outlineParameters, outlineNormal: true };
  material.userData.atlasPainted = true;
  material.name = 'craft';
  varnish(material);
  // Before `fadeTwin` clones it for the fleet (`fleetMaterials`).
  shadeByClouds(material);
  return material;
}

let matte: THREE.MeshToonMaterial | null = null;
/**
 * The cabin's material: the craft's, without the varnish. The varnish gives a
 * painted body the sky at a glancing angle, and a dashboard seen from the
 * seat is all glancing angle — it came out the hemisphere's lilac whatever it
 * was painted. A cabin is cloth, plastic and leather, and matte.
 */
export function cabinMaterial(): THREE.MeshToonMaterial {
  if (matte !== null) return matte;
  const source = craftContext().toon(craftContext().palette.ink);
  matte = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: source.gradientMap });
  matte.userData.outlineParameters = { ...source.userData.outlineParameters, outlineNormal: true };
  matte.userData.atlasPainted = true;
  matte.name = 'craft-cabin';
  shadeByClouds(matte);
  return matte;
}

/**
 * How much of what is behind it a pane lets through: about a quarter, so a
 * car still reads as having windows and the driver behind them reads as a
 * person from the chase camera, not as a shadow behind a blue panel.
 */
export const GLASS_OPACITY = 0.24;

/**
 * The glass's colour: the world's window slate (`GLASS_TONE` in the scenery
 * contract), lightened where the opaque panes were darkened, because what is
 * behind it now shows through and darkens it.
 */
export const GLASS_TINT = tone(PALETTE.slate, 1.4);

let glass: THREE.MeshToonMaterial | null = null;

/**
 * The one material every see-through pane of a craft is drawn with: its
 * colours are its vertices', on the craft's own ramp, both sides lit,
 * blended, writing no depth (see the head of `cabin.ts`), and **no ink** —
 * `outlineParameters.visible` false, so the outline pass leaves it out. It
 * casts no shadow either: a car's shadow with its windows lighter in it is
 * what a real one throws.
 */
export function glassMaterial(): THREE.MeshToonMaterial {
  if (glass !== null) return glass;
  const source = craftContext().toon(craftContext().palette.ink);
  glass = new THREE.MeshToonMaterial({
    vertexColors: true,
    gradientMap: source.gradientMap,
    transparent: true,
    opacity: GLASS_OPACITY,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  glass.userData.outlineParameters = { visible: false };
  glass.userData.atlasPainted = true;
  glass.userData.atlasGlass = true;
  glass.name = 'craft-glass';
  // The craft's own varnish, which takes this slate for glass and gives it
  // the sky at a glancing angle and the sun's highlight; and the clouds' shade.
  varnish(glass);
  shadeByClouds(glass);
  return glass;
}

/**
 * How much of a pane's opacity is left for the eye inside the ride
 * (`faintGlass`): a third, so the windscreen is a faint sheen over the road
 * and not a blue filter over the whole view.
 */
export const INSIDE_GLASS = 0.35;

const faint = new WeakMap<THREE.Material, THREE.Material>();
/**
 * A ride's see-through glass, faint, for the eye inside it — Earth's seats
 * (`player.ts`) and the walked worlds' (`worlds/camera.ts`) alike: each mesh
 * whose material is glass (`atlasGlass`, every pane in `glassMaterial`; or
 * `atlasFaint`, a craft's own glass such as the saucer's dome) is given a
 * copy of its material at `INSIDE_GLASS` of its opacity, kept per material,
 * and its own back after (`on` false) — the swap `inkless` makes for the
 * ink. The copy of a material that is not the shared glass goes when its
 * source does.
 */
export function faintGlass(group: THREE.Object3D, on: boolean): void {
  group.traverse((part) => {
    const mesh = part as THREE.Mesh;
    if (!mesh.isMesh || Array.isArray(mesh.material)) return;
    const own = mesh.userData.clear as THREE.Material | undefined;
    if (!on) {
      if (own !== undefined) mesh.material = own;
      delete mesh.userData.clear;
      return;
    }
    const material = mesh.material;
    if (own !== undefined || (material.userData.atlasGlass !== true && material.userData.atlasFaint !== true)) return;
    let clear = faint.get(material);
    if (clear === undefined) {
      const made = material.clone();
      // The varnish and the clouds' shade are shader patches, which a clone leaves behind.
      made.onBeforeCompile = material.onBeforeCompile;
      made.customProgramCacheKey = material.customProgramCacheKey;
      made.opacity = material.opacity * INSIDE_GLASS;
      made.userData.outlineParameters = { visible: false };
      faint.set(material, made);
      if (material.userData.atlasGlass !== true) material.addEventListener('dispose', () => made.dispose());
      clear = made;
    }
    mesh.userData.clear = material;
    mesh.material = clear;
  });
}

// ---------------------------------------------------------------------------
// Triangle soups
// ---------------------------------------------------------------------------

/** Flat, non-indexed arrays in the craft's own frame: what `mergeMeshes` returns. */
export type Soup = Pick<Merged, 'position' | 'normal' | 'color' | 'outline'>;

/** A group of context pieces reduced to one soup. Consumes nothing; the pieces can be dropped. */
export function soupOf(group: THREE.Object3D): Soup {
  group.updateMatrixWorld(true);
  group.traverse((object) => {
    if (object.matrixWorld.determinant() <= 0) {
      throw new Error(`craft: a piece has a reflected or collapsed transform (det ${object.matrixWorld.determinant()})`);
    }
  });
  return mergeMeshes(group);
}

/**
 * A turning part: its soup, built about its own axle at the origin, and where
 * that axle is. A steering wheel (`'steer'`) and a speedometer's needle
 * (`'needle'`) turn about their own +Z, which `tilt` — a turn about X, forward
 * and down — stands at the angle the column or the dial is at; the motion
 * turns them about that axle and leaves the tilt alone (`craft/motion.ts`).
 */
export interface Turning {
  name: 'prop' | 'rotor' | 'wheel' | 'tail' | 'crank' | 'steer' | 'needle';
  at: THREE.Vector3;
  soup: Soup;
  tilt?: number;
}

const faceA = new THREE.Vector3();
const faceB = new THREE.Vector3();
const faceC = new THREE.Vector3();

/**
 * Soups concatenated into one geometry. A triangle with no area is dropped
 * here rather than trusted: `computeVertexNormals` gives one a NaN normal,
 * and a NaN normal black-holes the whole mesh it is in.
 */
export function geometryOf(soups: readonly Soup[]): THREE.BufferGeometry {
  let count = 0;
  for (const soup of soups) count += soup.position.length;
  const position = new Float32Array(count);
  const normal = new Float32Array(count);
  const color = new Float32Array(count);
  const outline = new Float32Array(count);
  let cursor = 0;
  for (const soup of soups) {
    for (let i = 0; i < soup.position.length; i += 9) {
      faceA.fromArray(soup.position, i);
      faceB.fromArray(soup.position, i + 3).sub(faceA);
      faceC.fromArray(soup.position, i + 6).sub(faceA);
      if (faceB.cross(faceC).lengthSq() < 1e-12) continue;
      let finite = true;
      for (let k = 0; k < 9; k++) if (!Number.isFinite(soup.normal[i + k]!) || !Number.isFinite(soup.outline[i + k]!)) finite = false;
      if (!finite) continue;
      position.set(soup.position.subarray(i, i + 9), cursor);
      normal.set(soup.normal.subarray(i, i + 9), cursor);
      color.set(soup.color.subarray(i, i + 9), cursor);
      outline.set(soup.outline.subarray(i, i + 9), cursor);
      cursor += 9;
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(position.slice(0, cursor), 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normal.slice(0, cursor), 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(color.slice(0, cursor), 3));
  geometry.setAttribute('outlineNormal', new THREE.BufferAttribute(outline.slice(0, cursor), 3));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function meshOf(soups: readonly Soup[], name: string, material: THREE.Material = craftMaterial()): THREE.Mesh {
  const mesh = new THREE.Mesh(geometryOf(soups), material);
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * What a closed craft carries besides its shell: the see-through glass, and
 * the cabin — the shell's lining, the floor, the seats, the dashboard — each
 * its own mesh so that a buffer that cannot carry glass (a farm's tile,
 * `parkedArrays`) can leave the cabin out and paint the glass opaque.
 */
export interface Inside {
  glass?: readonly Soup[];
  cabin?: readonly Soup[];
}

/**
 * The finished craft: the still soups as one mesh named `'body'`, each
 * turning part as a group of its own name at its axle holding its mesh, and
 * a closed craft's `Inside`: its cabin as a mesh named `'cabin'` in the same
 * material, and its see-through glass as a mesh named `'glass'` in the
 * glass's own (`glassMaterial`), casting no shadow. Every matrix in the
 * result is asserted proper — a reflection here renders the craft as a solid
 * blob of ink, and an ordinary `Mesh` would hide it.
 */
export function assemble(name: string, still: readonly Soup[], turning: readonly Turning[] = [], inside: Inside = {}): THREE.Group {
  const group = new THREE.Group();
  group.name = name;
  group.add(meshOf(still, 'body'));
  if (inside.cabin !== undefined && inside.cabin.some((soup) => soup.position.length > 0)) {
    // The cabin takes no shadow: the shell over it would put the whole inside
    // in its own shade, and a dashboard and seats in the ramp's darkest band
    // read as one dark block through the glass and from the seat. It still
    // casts one, onto the people in it, as the shell does.
    const cabin = meshOf(inside.cabin, 'cabin', cabinMaterial());
    cabin.receiveShadow = false;
    group.add(cabin);
  }
  const glass = inside.glass ?? [];
  for (const part of turning) {
    const pivot = new THREE.Group();
    pivot.name = part.name;
    pivot.position.copy(part.at);
    pivot.rotation.x = part.tilt ?? 0;
    // A cabin's wheel and needle are the cabin's, matte.
    pivot.add(meshOf([part.soup], `${part.name}-mesh`, part.name === 'steer' || part.name === 'needle' ? cabinMaterial() : craftMaterial()));
    group.add(pivot);
  }
  if (glass.some((soup) => soup.position.length > 0)) {
    const pane = new THREE.Mesh(geometryOf(glass), glassMaterial());
    pane.name = 'glass';
    pane.castShadow = false;
    pane.receiveShadow = true;
    group.add(pane);
  }
  group.updateMatrixWorld(true);
  group.traverse((object) => {
    if (object.matrixWorld.determinant() <= 0) throw new Error(`craft ${name}: '${object.name}' has a reflected matrix`);
  });
  return group;
}

// ---------------------------------------------------------------------------
// The loft
// ---------------------------------------------------------------------------

/** One section of a loft: a closed polygon in (x, y) at a given z. */
export interface Station {
  z: number;
  ring: readonly (readonly [number, number])[];
}

const shoelace = (ring: readonly (readonly [number, number])[]): number => {
  let sum = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x0, y0] = ring[i]!;
    const [x1, y1] = ring[(i + 1) % ring.length]!;
    sum += x0 * y1 - x1 * y0;
  }
  return sum / 2;
};

/**
 * A closed shell through a run of sections, every section with the same number
 * of points, and a cap on each end.
 *
 * It is `vehicles.ts`'s `shell` with any section rather than a rectangle,
 * because a hull, a fuselage, a wing and a wheel pant are all rounder than a box
 * and the one fault that made the old craft ugly was that they were boxes. A
 * section may be concave — the open cockpit of the launch and the plane is a U
 * with the well cut into its top — and a point may coincide with its neighbour,
 * which is how a well closes into a deck between two stations; the triangles
 * that collapse are dropped by `assemble`.
 *
 * **Which way round it is wound is checked, not trusted**: every section is put
 * anticlockwise before the quads are laid, each cap is turned to face out along
 * z, and then the signed volume of the whole shell must come out positive
 * (`assertOutward`, the same test `vehicles.ts` runs). A shell wound inside out
 * turns its hull front-facing and draws as a solid blob of ink.
 */
export function loft(stations: readonly Station[], color: number, openFore = false): THREE.Mesh {
  if (stations.length < 2) throw new Error('loft: needs two stations');
  const n = stations[0]!.ring.length;
  for (let i = 1; i < stations.length; i++) {
    if (stations[i]!.ring.length !== n) throw new Error('loft: every station needs the same number of points');
    if (!(stations[i]!.z > stations[i - 1]!.z)) throw new Error('loft: stations must run aft to fore, z strictly increasing');
  }
  const rings = stations.map((s) => {
    const ring = s.ring.map(([x, y]) => [x, y, s.z] as [number, number, number]);
    return shoelace(s.ring) < 0 ? ring.reverse() : ring;
  });
  const p: number[] = [];
  const tri = (a: readonly number[], b: readonly number[], c: readonly number[]) => p.push(...a, ...b, ...c);
  for (let i = 0; i + 1 < rings.length; i++) {
    const A = rings[i]!;
    const B = rings[i + 1]!;
    for (let j = 0; j < n; j++) {
      const k = (j + 1) % n;
      tri(A[j]!, A[k]!, B[k]!);
      tri(A[j]!, B[k]!, B[j]!);
    }
  }
  const cap = (ring: readonly [number, number, number][], facing: 1 | -1) => {
    // Coincident neighbours are what a closed well leaves; the ear clipper is
    // handed the ring without them.
    const kept = ring.filter((point, i) => {
      const next = ring[(i + 1) % ring.length]!;
      return Math.hypot(point[0] - next[0], point[1] - next[1]) > 1e-6;
    });
    if (kept.length < 3) return;
    const faces = THREE.ShapeUtils.triangulateShape(kept.map(([x, y]) => new THREE.Vector2(x, y)), []);
    for (const [a, b, c] of faces) {
      const pa = kept[a!]!;
      const pb = kept[b!]!;
      const pc = kept[c!]!;
      const z = (pb[0] - pa[0]) * (pc[1] - pa[1]) - (pb[1] - pa[1]) * (pc[0] - pa[0]);
      if (Math.sign(z) === facing) tri(pa, pb, pc);
      else tri(pa, pc, pb);
    }
  };
  cap(rings[0]!, -1);
  // An open fore end — a hull whose bow is a window, which glass of its own
  // covers — is checked closed and handed over without its cap.
  const shell = p.length;
  cap(rings[rings.length - 1]!, 1);
  assertOutward(p);
  if (openFore) p.length = shell;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  geometry.computeVertexNormals();
  return new THREE.Mesh(geometry, craftContext().toon(color));
}

/** Six times the signed volume of a closed triangle soup; positive is outward. */
export function signedVolume(p: ArrayLike<number>): number {
  let volume = 0;
  for (let i = 0; i < p.length; i += 9) {
    const ax = p[i]!, ay = p[i + 1]!, az = p[i + 2]!;
    const bx = p[i + 3]!, by = p[i + 4]!, bz = p[i + 5]!;
    const cx = p[i + 6]!, cy = p[i + 7]!, cz = p[i + 8]!;
    volume += ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);
  }
  return volume;
}

function assertOutward(p: readonly number[]): void {
  const volume = signedVolume(p);
  if (!(volume > 0)) throw new Error(`loft: the shell is wound inside out (6V = ${volume.toFixed(3)})`);
}

/**
 * A rounded box section: flat top and bottom, the four corners cut by
 * `chamfer` of the smaller of the half-width and half-height. Eight points,
 * which is as round as the pen lets a fuselage be before the joints between
 * facets start reading as panel lines.
 */
export function octagon(half: number, bottom: number, top: number, chamfer = 0.35): [number, number][] {
  const c = Math.min(half, (top - bottom) / 2) * chamfer;
  return [
    [-half + c, bottom],
    [half - c, bottom],
    [half, bottom + c],
    [half, top - c],
    [half - c, top],
    [-half + c, top],
    [-half, top - c],
    [-half, bottom + c],
  ];
}

/**
 * An open well's section: an outer skin from the keel up to a sheer on either
 * side, a wall `wall` thick, and a floor at `floor` inside it. Nine points, the
 * same nine whether or not the well is open, so a station with `decked` set
 * closes it into a flat deck at the sheer and the loft between an open and a
 * decked station is a bulkhead.
 *
 * `chine` is where the bottom turns up into the side; `keel` the bottom on the
 * centreline. A flat-bottomed fuselage gives the keel and the chine one height.
 */
export interface WellSection {
  keel: number;
  chineHalf: number;
  chineY: number;
  sheerHalf: number;
  sheerY: number;
  floor: number;
  wall: number;
  decked?: boolean;
}

export function well(s: WellSection): [number, number][] {
  // The skin's own half-width at the floor, so the inner wall runs parallel to it.
  const t = (s.floor - s.chineY) / (s.sheerY - s.chineY);
  const skinAtFloor = s.chineHalf + (s.sheerHalf - s.chineHalf) * THREE.MathUtils.clamp(t, 0, 1);
  const innerTop = Math.max(0, s.sheerHalf - s.wall);
  const innerFloor = Math.max(0, Math.min(innerTop, skinAtFloor - s.wall));
  const floor = s.decked === true ? s.sheerY : s.floor;
  const innerBottom = s.decked === true ? innerTop : innerFloor;
  return [
    [0, s.keel],
    [s.chineHalf, s.chineY],
    [s.sheerHalf, s.sheerY],
    [innerTop, s.sheerY],
    [innerBottom, floor],
    [-innerBottom, floor],
    [-innerTop, s.sheerY],
    [-s.sheerHalf, s.sheerY],
    [-s.chineHalf, s.chineY],
  ];
}

/**
 * A lathe of `sides` about +Y through `profile` (radius, y) from the bottom up,
 * faceted, in one colour, and optionally only the gore from `from` to `to` of
 * the turn. The whole turn is closed if the profile starts and ends on the
 * axis; a gore is not closed and is only ever used beside its neighbours.
 */
export function lathe(profile: readonly (readonly [number, number])[], color: number, sides: number, from = 0, to = 1): THREE.Mesh {
  const points = profile.map(([r, y]) => new THREE.Vector2(r, y));
  const geometry = new THREE.LatheGeometry(points, sides, from * Math.PI * 2, (to - from) * Math.PI * 2);
  const faceted = geometry.toNonIndexed();
  geometry.dispose();
  faceted.computeVertexNormals();
  return new THREE.Mesh(faceted, craftContext().toon(color));
}

// ---------------------------------------------------------------------------
// The model
// ---------------------------------------------------------------------------

/** A craft as its file describes it, before it is centred and measured. */
export type CraftDraft = Omit<CraftModel, 'size'>;

/**
 * The finished model: centred in X and Z on its own box, as the contract's
 * frame asks, with the seats moved by the same amount, and `size` read off the
 * built box rather than written down. A plane is longer ahead of its seats than
 * behind them and a car's cabin is not in its middle, so each file builds about
 * whatever origin its own arithmetic wanted and this puts the box's middle on
 * the axis. The turning parts are direct children and move with it, so a
 * caller that finds them by name finds them where they are.
 */
export function finish(draft: CraftDraft): CraftModel {
  const box = new THREE.Box3().setFromObject(draft.build(0));
  const dx = (box.min.x + box.max.x) / 2;
  const dz = (box.min.z + box.max.z) / 2;
  const size: [number, number, number] = [box.max.z - box.min.z, box.max.x - box.min.x, box.max.y - box.min.y];
  return {
    ...draft,
    size,
    seats: draft.seats.map((seat) => ({ ...seat, x: seat.x - dx, z: seat.z - dz })),
    ...(draft.lamps === undefined ? {} : { lamps: draft.lamps.map(([x, y, z]) => [x - dx, y, z - dz] as const) }),
    ...(draft.arches === undefined
      ? {}
      : {
          arches: draft.arches.map(({ min, max }) => ({
            min: [min[0] - dx, min[1], min[2] - dz] as const,
            max: [max[0] - dx, max[1], max[2] - dz] as const,
          })),
        }),
    // The paint goes through with the variant: a town's parked car taken
    // over is built in the colour it was parked in. Until 2026-09-28 this
    // passed the variant alone, so every car taken from a kerb came out in
    // its variant's colour instead, whatever it had stood there in.
    build(variant, paint) {
      const group = draft.build(variant, paint);
      for (const child of group.children) {
        child.position.x -= dx;
        child.position.z -= dz;
      }
      group.updateMatrixWorld(true);
      return group;
    },
  };
}
