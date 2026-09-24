/**
 * A light aircraft's airstrip: how big it is, where each point of it is, and
 * how it is drawn — a mown strip laid on the land and a windsock beside it.
 *
 * **Which way it runs is `fleet.ts`'s**: its search chooses the heading, and
 * `stripPoint` here lays the strip from the plane's site and that heading for
 * the search, the keepouts, the drawing and the check alike. **What it stands
 * on is the caller's**: `surface` answers the
 * drawn land's radius along a direction, because the land mesh is up to a unit
 * and a half off the relief it was laid between, and a flat ribbon draped on
 * the relief comes and goes under the grass in patches as wide as a triangle.
 *
 * **The strip is a mark on the ground, not a thing on it**, so it is drawn the
 * way a road is: no ink hull (an outline round it would make it read as tape
 * laid over the world), the world's own ramp, `STRIP_LIFT` over the land and
 * pushed forward in depth by `polygonOffset` so the land between two of its
 * rows never shows through. Its colour is the land's own under it, a shade
 * lighter and yellower where the grass is mown, and bare earth where the
 * ground has no sward to mow; mown bands a `STRIP_BAND` long alternate a tone
 * either side of that, which is what reads as a strip from the air.
 *
 * **The windsock is the one part that moves**: a pole and a striped sock on a
 * pivot, both from the craft's own pieces and material, inked, and a `'rotor'`
 * turning about +Y in the sense of `CraftModel.build` — the sock swings round
 * its pole. It is its own small mesh, and only the near ones are turned.
 */
import * as THREE from 'three';
import { PLANET_RADIUS } from '../globe.ts';
import { AVATAR_HEIGHT } from '../stature.ts';
import { PALETTE, createToonRamp } from '../theme.ts';
import { assemble, craftContext, lathe, soupOf } from './build.ts';

const H = AVATAR_HEIGHT;

/**
 * **A plane's field is an airstrip**, because a plane's field is where it
 * takes off. From standing, the run opens the throttle to a quarter past
 * `PLANE_ROTATE` (84 units a second) over `PLANE_RUN_TIME` (1.6 s), which
 * reaches rotation after 2.6 s and 136 units; the wheels then leave the
 * ground at no climb, and the climb builds over `PLANE_VERTICAL_TIME`. A disc
 * ten units wide round the parked plane put that run through whatever stood
 * past it — a wood, most often. So the site is a strip: `STRIP_LENGTH` ahead
 * of the plane's origin (the run and sixty units to spare) and `STRIP_BACK`
 * behind it (its own half-length and a little), on a heading the search
 * chooses (`fleet.ts`) so that all of it is land, no steeper than
 * `PLANE_GRADE` over `STRIP_HALF` either side, and clear of every town, road
 * and landmark.
 *
 * **The length is what this world has room for.** Towns stand closer here than
 * on the Earth, and a strip has to fit between them: on twenty rings and nine
 * headings, 260 units found one for 874 of the 1,186 towns that keep a plane
 * and 200 units for 1,016 (2026-09-24, without `STRIP_CLEAR`, which costs
 * eleven), which is why the run was made shorter rather than the strip
 * longer.
 *
 * `STRIP_HALF` is the ground kept to itself — 2.5 of the plane's 13.9-unit
 * span across, so a take-off that wanders off the centre line keeps its
 * wingtips out of the trees — and `STRIP_DRAWN` the mown strip drawn down the
 * middle of it, a span and three quarters wide. The wood keeps off
 * `STRIP_APPROACH` more past the far end, where the plane is still climbing
 * through the height of a tree; nothing else is asked of that ground.
 */
export const STRIP_LENGTH = 200;
export const STRIP_BACK = 12;
export const STRIP_HALF = 17;
export const STRIP_DRAWN = 12;
export const STRIP_APPROACH = 60;

/** What a strip is laid from: a plane's site, where it stands and the way it takes off. */
export interface StripSite {
  /** The stand, as a unit direction. */
  at: THREE.Vector3;
  /** The heading, a unit tangent at `at`. */
  forward: THREE.Vector3;
}

const stripSide = new THREE.Vector3();
/**
 * A point of a plane's strip: `along` units down it from the plane's origin
 * (negative behind it) and `across` to its right. Pure: the search, the
 * keepouts, the drawing and the check all lay the strip with this.
 */
export function stripPoint(site: StripSite, along: number, across: number, out: THREE.Vector3): THREE.Vector3 {
  // Screen right is `forward x up`; see `walk` in `player.ts`.
  stripSide.crossVectors(site.forward, site.at).normalize();
  return out
    .copy(site.at)
    .addScaledVector(site.forward, along / PLANET_RADIUS)
    .addScaledVector(stripSide, across / PLANET_RADIUS)
    .normalize();
}

/** How far the strip rides over the drawn land, in units: under a boot sole, over a depth quantum at any range. */
export const STRIP_LIFT = 0.3;
/** Rows of the ribbon, along it, in units. The land under a flat strip is a few large triangles; this follows them. */
const ROW = 8;
/** A mown band's length, two rows. */
const STRIP_BAND = 16;
/** How far the drawn strip runs past the ground the plane needs at either end. */
const STRIP_END = 4;
/** The two tones of the mown bands, either side of the strip's own colour. */
const BAND_LIGHT = 1.05;
const BAND_DARK = 0.95;

let material: THREE.MeshToonMaterial | null = null;
/** The strips' one material, made on first use: the land's ramp, the vertices' colours, no ink. */
export function stripMaterial(): THREE.MeshToonMaterial {
  if (material !== null) return material;
  material = new THREE.MeshToonMaterial({
    vertexColors: true,
    gradientMap: createToonRamp(4),
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -4,
  });
  material.userData.outlineParameters = { visible: false };
  material.name = 'airstrip';
  return material;
}

const earth = new THREE.Color(PALETTE.brown);
const mown = new THREE.Color(PALETTE.olive);
const hsl = { h: 0, s: 0, l: 0 };

/**
 * The strip's colour from the land's under its middle: a shade lighter and a
 * little towards the palette's olive where there is grass to mow, and half way
 * to the palette's brown where there is none. `sward` is `biome.ts`'s share of
 * the ground under grass, 0 to 1.
 */
export function stripColor(ground: THREE.Color, sward: number, out: THREE.Color): THREE.Color {
  out.copy(ground);
  if (sward < 0.4) return out.lerp(earth, 0.5);
  out.lerp(mown, 0.15).getHSL(hsl);
  return out.setHSL(hsl.h, hsl.s, Math.min(1, hsl.l * 1.08));
}

const faceA = new THREE.Vector3();
const faceB = new THREE.Vector3();
const faceUp = new THREE.Vector3();

/**
 * The strip as one mesh, its vertices relative to `origin` (the site's stand
 * on the land, which the caller puts the mesh at): three columns across —
 * the edges and the centre line — and a row every `ROW` units, each vertex on
 * `surface` plus `STRIP_LIFT`. Non-indexed and flat-shaded like the land.
 */
export function buildStrip(site: StripSite, surface: (direction: THREE.Vector3) => number, color: THREE.Color): THREE.Mesh {
  const origin = site.at.clone().multiplyScalar(surface(site.at));
  const start = -STRIP_BACK - STRIP_END;
  const rows = Math.ceil((STRIP_LENGTH + STRIP_BACK + 2 * STRIP_END) / ROW);
  const grid: THREE.Vector3[] = [];
  for (let i = 0; i <= rows; i++) {
    for (let c = -1; c <= 1; c++) {
      const direction = stripPoint(site, start + i * ROW, c * STRIP_DRAWN, new THREE.Vector3());
      grid.push(direction.multiplyScalar(surface(direction) + STRIP_LIFT).sub(origin));
    }
  }
  const light = color.clone().multiplyScalar(BAND_LIGHT);
  const dark = color.clone().multiplyScalar(BAND_DARK);
  const position: number[] = [];
  const colors: number[] = [];
  const up = site.at;
  const corner = (i: number, c: number): THREE.Vector3 => grid[i * 3 + c]!;
  const triangle = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, tone: THREE.Color): void => {
    // Wound to face the sky, whichever way the frame came out: checked, not trusted.
    faceA.subVectors(b, a);
    faceB.subVectors(c, a);
    faceUp.crossVectors(faceA, faceB);
    const [p, q] = faceUp.dot(up) >= 0 ? [b, c] : [c, b];
    for (const v of [a, p, q]) {
      position.push(v.x, v.y, v.z);
      colors.push(tone.r, tone.g, tone.b);
    }
  };
  for (let i = 0; i < rows; i++) {
    const middle = start + (i + 0.5) * ROW + STRIP_BACK + STRIP_END;
    const tone = Math.floor(middle / STRIP_BAND) % 2 === 0 ? light : dark;
    for (let c = 0; c < 2; c++) {
      triangle(corner(i, c), corner(i, c + 1), corner(i + 1, c + 1), tone);
      triangle(corner(i, c), corner(i + 1, c + 1), corner(i + 1, c), tone);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  const mesh = new THREE.Mesh(geometry, stripMaterial());
  mesh.name = 'airstrip';
  mesh.position.copy(origin);
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  // Stood at a translation only: nothing here can be a reflection.
  mesh.updateMatrix();
  if (mesh.matrix.determinant() <= 0) throw new Error('airstrip: the strip would be mirrored');
  return mesh;
}

/** The pole, to the pivot: two bodies and a bit, so the sock is seen over a parked plane's wing. */
export const WINDSOCK_POLE = 2.1 * H;
/** The sock: its length, its mouth and its tail. */
const SOCK_LENGTH = 0.95 * H;
const SOCK_MOUTH = 0.16 * H;
const SOCK_TAIL = 0.07 * H;
/** Bands down the sock, alternating: the orange and white every windsock is. */
const SOCK_BANDS = 4;

let windsock: THREE.Group | null = null;

/**
 * A windsock: the pole as one mesh named `'body'`, and the sock as a `'rotor'`
 * pivot at the pole's top holding its own mesh, pointing along the pivot's +Z.
 * Built once; every call after the first is a clone sharing its geometry and
 * the craft material, so a strip that goes costs no disposal.
 */
export function buildWindsock(): THREE.Group {
  if (windsock === null) {
    const { column } = craftContext();
    const pole = new THREE.Group();
    pole.add(column(0.035 * H, WINDSOCK_POLE + 0.04 * H, PALETTE.steel, 6));
    const sock = new THREE.Group();
    const bands = new THREE.Group();
    for (let b = 0; b < SOCK_BANDS; b++) {
      const y0 = (b / SOCK_BANDS) * SOCK_LENGTH;
      const y1 = ((b + 1) / SOCK_BANDS) * SOCK_LENGTH;
      const r0 = SOCK_MOUTH + (SOCK_TAIL - SOCK_MOUTH) * (b / SOCK_BANDS);
      const r1 = SOCK_MOUTH + (SOCK_TAIL - SOCK_MOUTH) * ((b + 1) / SOCK_BANDS);
      const band = lathe(
        [
          [0, y0],
          [r0, y0],
          [r1, y1],
          [0, y1],
        ],
        b % 2 === 0 ? PALETTE.orange : PALETTE.white,
        8,
      );
      bands.add(band);
    }
    // Laid along +Z, mouth at the pivot: a rotation, so its determinant stays +1.
    bands.rotation.x = Math.PI / 2;
    // Hung a mouth's radius under the pivot, on the pole's side.
    bands.position.set(0, -SOCK_MOUTH, 0);
    sock.add(bands);
    windsock = assemble('windsock', [soupOf(pole)], [{ name: 'rotor', at: new THREE.Vector3(0, WINDSOCK_POLE, 0), soup: soupOf(sock) }]);
    windsock.traverse((part) => {
      if ((part as THREE.Mesh).isMesh) part.castShadow = true;
    });
  }
  const copy = windsock.clone();
  const pivot = copy.getObjectByName('rotor');
  // The droop is about the sock's own crosswise axis, then the swing about the pole.
  if (pivot !== undefined) pivot.rotation.order = 'YXZ';
  return copy;
}
