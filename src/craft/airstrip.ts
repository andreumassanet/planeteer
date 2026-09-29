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
 * ground has no sward to mow. **The grass grows on it, mown** (`stripCover`,
 * which `vegetation.ts` bakes the grass from and this draws from): a quarter
 * of the field's height (`STRIP_MOWN`), in lanes `STRIP_LANE` wide along the
 * strip a tone either side of its colour, as a mower leaves them; none on the
 * worn track down the middle (`STRIP_TRACK`) where the wheels roll, drawn
 * earth, nor under the threshold's white boards at either end. A row of
 * white-painted tyres marks each edge. The drawn lanes and the grown ones are
 * the same lanes, so the ground between the short blades is their colour.
 *
 * The boards, the tyres and a pair of fuel drums by the windsock are one
 * merged, inked mesh in the craft's material (`stripMarks`), a child of the
 * strip that goes when the strip's geometry is disposed.
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
/** How far the drawn strip runs past the ground the plane needs at either end. */
const STRIP_END = 4;
/** Where the drawn strip starts and ends along its centre line, from the plane's origin. */
const DRAWN_FROM = -STRIP_BACK - STRIP_END;
const DRAWN_TO = STRIP_LENGTH + STRIP_END;
/**
 * Half the worn track down the centre line: the light plane's main wheels
 * stand 2.08 units either side of its own (`lightPlaneModel`, measured
 * 2026-09-28), and a take-off wanders.
 */
export const STRIP_TRACK = 2.8;
/** A mown lane, along the strip: two a side between the track and the edge. */
export const STRIP_LANE = (STRIP_DRAWN - STRIP_TRACK) / 2;
/** How tall the mown grass stands, of what the field grows there. */
export const STRIP_MOWN = 0.25;
/** The two tones of the mown lanes, either side of the strip's own colour; the grass's lanes take the same. */
const LANE_LIGHT = 1.08;
const LANE_DARK = 0.92;
/** Where the drawn strip's columns fall across it: the edges, the lanes' seam and the track's sides. */
const COLUMNS = [-STRIP_DRAWN, -STRIP_TRACK - STRIP_LANE, -STRIP_TRACK, STRIP_TRACK, STRIP_TRACK + STRIP_LANE, STRIP_DRAWN] as const;
/**
 * The threshold at either end: white boards laid along the strip either side
 * of the track, their middles `BOARD_ACROSS` off the centre line, the near
 * row behind the parked plane's tail and the far one at the strip's end.
 */
const BOARD_ACROSS = [4.2, 6.2, 8.2, 10.2] as const;
const BOARD_WIDTH = 0.9;
const BOARD_LENGTH = 4.5;
/** Tall enough to stand over the drawn strip's `STRIP_LIFT` and its polygon offset, bedded a little under it. */
const BOARD_HEIGHT = 0.3;
/** How far a board or a tyre is bedded under the drawn strip's surface. */
const BEDDED = 0.1;
const THRESHOLDS = [-STRIP_BACK - 1.5, STRIP_LENGTH - 1] as const;
/** The tyres along each edge: every `TYRE_EVERY` units, just inside the drawn edge, among the mown grass. */
const TYRE_EVERY = 25;
const TYRE_IN = 0.9;
/** A car tyre lying flat, painted white: 0.65 m across and 0.2 m deep, at the scale the body is drawn at. */
const TYRE_OUTER = 0.186 * H;
const TYRE_INNER = 0.1 * H;
const TYRE_HEIGHT = 0.114 * H;

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
/** Grass cut short and dried: what makes a strip read against the field it is cut from. */
const stubble = new THREE.Color(PALETTE.sand);
const hsl = { h: 0, s: 0, l: 0 };

/** Under this share of sward (`biome.ts`) a strip is bare earth, drawn and grown alike: nothing to mow. */
export const STRIP_SWARD = 0.4;

/**
 * The strip's colour from the land's under it: lighter, a little towards the
 * palette's olive and a sixth of the way to its sand where there is grass to
 * mow — cut short and dry, or it is lost in the field — and half way to the
 * palette's brown where there is none. `sward` is `biome.ts`'s share of the
 * ground under grass, 0 to 1. The drawn strip is this under its middle, and
 * the mown grass on it is this at each blade (`vegetation.ts`), so the ground
 * between the blades is theirs. A third of the way to the sand before the
 * grass grew on it, when the strip was all there was to see.
 */
export function stripColor(ground: THREE.Color, sward: number, out: THREE.Color): THREE.Color {
  out.copy(ground);
  if (sward < STRIP_SWARD) return out.lerp(earth, 0.5);
  out.lerp(mown, 0.15).lerp(stubble, 0.17).getHSL(hsl);
  return out.setHSL(hsl.h, hsl.s, Math.min(1, hsl.l * 1.1));
}

const onSide = new THREE.Vector3();
/** A point of a strip's own plane, set by `stripAt`: units down the centre line and to its right. */
const onPlane = { along: 0, across: 0 };
/**
 * `stripPoint` turned inside out: it moves `along` and `across` in the
 * tangent plane and normalises, so the point's own components over its
 * component along `at` are those two again, exactly. False on the far side.
 */
function stripAt(site: StripSite, direction: THREE.Vector3): boolean {
  const height = direction.dot(site.at);
  if (height <= 0) return false;
  onSide.crossVectors(site.forward, site.at).normalize();
  onPlane.along = (direction.dot(site.forward) / height) * PLANET_RADIUS;
  onPlane.across = (direction.dot(onSide) / height) * PLANET_RADIUS;
  return true;
}

/**
 * Whether a unit direction is on the drawn strip, grown by `margin` units all
 * round: the rectangle `buildStrip` lays, `STRIP_DRAWN` either side of the
 * centre line from `DRAWN_FROM` to `DRAWN_TO` (its last row may run a few
 * units past that, which the margin covers).
 */
export function onStrip(site: StripSite, direction: THREE.Vector3, margin: number): boolean {
  if (!stripAt(site, direction)) return false;
  const { along, across } = onPlane;
  return along >= DRAWN_FROM - margin && along <= DRAWN_TO + margin && Math.abs(across) <= STRIP_DRAWN + margin;
}

/**
 * The four corners of a strip's drawn length, `half` units either side of its
 * centre line, into `out` (four vectors, written): what `fleet.ts` holds
 * inside the strip's own town's ground. The strip is a rectangle on its
 * tangent plane, so ground that is convex and holds the four holds the rest.
 */
export function stripCorners(site: StripSite, half: number, out: readonly THREE.Vector3[]): readonly THREE.Vector3[] {
  stripPoint(site, DRAWN_FROM, -half, out[0]!);
  stripPoint(site, DRAWN_FROM, half, out[1]!);
  stripPoint(site, DRAWN_TO, half, out[2]!);
  stripPoint(site, DRAWN_TO, -half, out[3]!);
  return out;
}

const meetCorner = new THREE.Vector3();
/** The corners of two strips, in the first one's plane: x down it, y across it. */
const meetA = new Float64Array(8);
const meetB = new Float64Array(8);

/** The four corners of `site`'s drawn length, `half` either side, as `stripAt` puts them in `frame`'s plane. */
function cornersIn(frame: StripSite, site: StripSite, half: number, out: Float64Array): boolean {
  const ends = [DRAWN_FROM, DRAWN_TO] as const;
  for (let k = 0; k < 4; k++) {
    stripPoint(site, ends[k >> 1]!, (k === 0 || k === 3 ? -1 : 1) * half, meetCorner);
    if (!stripAt(frame, meetCorner)) return false;
    out[k * 2] = onPlane.along;
    out[k * 2 + 1] = onPlane.across;
  }
  return true;
}

/** Whether no edge of either quad separates them: the separating-axis test, on the four edges of each. */
function quadsOverlap(a: Float64Array, b: Float64Array): boolean {
  for (const quad of [a, b]) {
    for (let k = 0; k < 4; k++) {
      const n = (k + 1) % 4;
      const nx = -(quad[n * 2 + 1]! - quad[k * 2 + 1]!);
      const ny = quad[n * 2]! - quad[k * 2]!;
      let minA = Infinity, maxA = -Infinity, minB = Infinity, maxB = -Infinity;
      for (let i = 0; i < 4; i++) {
        const pa = a[i * 2]! * nx + a[i * 2 + 1]! * ny;
        const pb = b[i * 2]! * nx + b[i * 2 + 1]! * ny;
        minA = Math.min(minA, pa);
        maxA = Math.max(maxA, pa);
        minB = Math.min(minB, pb);
        maxB = Math.max(maxB, pb);
      }
      if (maxA < minB || maxB < minA) return false;
    }
  }
  return true;
}

/**
 * Whether two strips' ground meets: each its drawn length, `half` units
 * either side of its centre line, laid in the first one's tangent plane (the
 * plane `stripAt` measures in, where a great circle is a straight line).
 * `fleet.ts` asks it to keep two strips apart; `pnpm fleet` holds the result
 * to the drawing's own rectangle (`onStrip`) instead.
 */
export function stripsMeet(a: StripSite, b: StripSite, half: number): boolean {
  if (!cornersIn(a, a, half, meetA) || !cornersIn(a, b, half, meetB)) return false;
  return quadsOverlap(meetA, meetB);
}

/**
 * What the grass is at a point of a strip, **the one answer the grass and the
 * drawing share**: -1 off it (the strip grown by `margin` all round, for the
 * blades' own lean past its edge); 0 where it is bare — the worn track down
 * the middle and the threshold's boards, each grown by `bare` — and otherwise
 * the tone of the mown lane it is in, `LANE_LIGHT` or `LANE_DARK`, which
 * multiplies the strip's colour (`stripColor`). Lanes alternate outward from
 * the track, the left side a lane out of step with the right, as a mower
 * going up one side and down the other leaves them.
 */
export function stripCover(site: StripSite, direction: THREE.Vector3, margin: number, bare: number): number {
  if (!stripAt(site, direction)) return -1;
  const { along, across } = onPlane;
  if (along < DRAWN_FROM - margin || along > DRAWN_TO + margin) return -1;
  const off = Math.abs(across);
  if (off > STRIP_DRAWN + margin) return -1;
  if (off <= STRIP_TRACK + bare) return 0;
  for (const middle of THRESHOLDS) {
    if (Math.abs(along - middle) > BOARD_LENGTH / 2 + bare) continue;
    for (const board of BOARD_ACROSS) if (Math.abs(off - board) <= BOARD_WIDTH / 2 + bare) return 0;
  }
  return laneTone(across);
}

/** The mown lane's tone at `across` units right of the centre line, off the track. */
function laneTone(across: number): number {
  const lane = Math.min(1, Math.floor((Math.abs(across) - STRIP_TRACK) / STRIP_LANE));
  return (Math.max(0, lane) + (across < 0 ? 1 : 0)) % 2 === 0 ? LANE_LIGHT : LANE_DARK;
}

/** The farthest any point of the drawn strip is from the plane's stand, in units: what a search for strips near a point adds. */
export const STRIP_REACH = Math.hypot(Math.max(DRAWN_TO, -DRAWN_FROM) + 8, STRIP_DRAWN);

const faceA = new THREE.Vector3();
const faceB = new THREE.Vector3();
const faceUp = new THREE.Vector3();

/**
 * The strip as one mesh, its vertices relative to `origin` (the site's stand
 * on the land, which the caller puts the mesh at): six columns across — the
 * edges, the seams between the mown lanes and the track's sides (`COLUMNS`)
 * — and a row every `ROW` units, each vertex on `surface` plus `STRIP_LIFT`.
 * Non-indexed and flat-shaded like the land. Its child is `stripMarks`.
 */
export function buildStrip(site: StripSite, surface: (direction: THREE.Vector3) => number, color: THREE.Color): THREE.Mesh {
  const origin = site.at.clone().multiplyScalar(surface(site.at));
  const start = DRAWN_FROM;
  const rows = Math.ceil((DRAWN_TO - DRAWN_FROM) / ROW);
  const across = COLUMNS.length;
  const grid: THREE.Vector3[] = [];
  for (let i = 0; i <= rows; i++) {
    for (const offset of COLUMNS) {
      const direction = stripPoint(site, start + i * ROW, offset, new THREE.Vector3());
      grid.push(direction.multiplyScalar(surface(direction) + STRIP_LIFT).sub(origin));
    }
  }
  // Each strip between two columns in its own tone: the lanes the grass is
  // mown in, and the worn track, half way to the palette's brown.
  const tones = COLUMNS.slice(1).map((right, c) => {
    const middle = (COLUMNS[c]! + right) / 2;
    if (Math.abs(middle) < STRIP_TRACK) return color.clone().lerp(earth, 0.55);
    return color.clone().multiplyScalar(laneTone(middle));
  });
  const position: number[] = [];
  const colors: number[] = [];
  const up = site.at;
  const corner = (i: number, c: number): THREE.Vector3 => grid[i * across + c]!;
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
    for (let c = 0; c < across - 1; c++) {
      triangle(corner(i, c), corner(i, c + 1), corner(i + 1, c + 1), tones[c]!);
      triangle(corner(i, c), corner(i + 1, c + 1), corner(i + 1, c), tones[c]!);
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
  const marks = stripMarks(site, surface, origin);
  mesh.add(marks);
  // Whoever puts the strip away disposes its geometry (`fleet.ts`), and the marks go with it.
  geometry.addEventListener('dispose', () => {
    marks.traverse((part) => {
      if ((part as THREE.Mesh).isMesh) (part as THREE.Mesh).geometry.dispose();
    });
  });
  return mesh;
}

/** A drum of fuel: 0.58 m across and 0.88 m tall, at the scale the body is drawn at. */
const DRUM_RADIUS = 0.166 * H;
const DRUM_HEIGHT = 0.5 * H;
/** Where the drums stand: down the strip past the windsock (`fleet.ts`'s `SOCK_ALONG`), off the left edge. */
const DRUM_ALONG = 31;
const DRUM_OFF = STRIP_DRAWN + 3;

let markParts: { board: THREE.Mesh; tyre: THREE.Mesh; drums: THREE.Mesh[] } | null = null;
const markUp = new THREE.Vector3();
const markSide = new THREE.Vector3();
const markAhead = new THREE.Vector3();
const markBasis = new THREE.Matrix4();

/**
 * What marks a strip out, as one merged, inked mesh in the craft material:
 * the threshold's boards at either end (laid over the bare ground the grass
 * leaves them, `stripCover`), a white tyre every `TYRE_EVERY` units just
 * inside each edge, and two fuel drums by the windsock. Each stands on
 * `surface` in the strip's own frame — up the ground's, +Z down the strip —
 * the boards and the tyres bedded `BEDDED` under the drawn strip, the drums
 * a little into the turf; the frame is `makeBasis(side, up,
 * ahead)` with `side = up x ahead`, a rotation, and `soupOf` asserts it.
 * 1,152 triangles a strip, 896 of them the tyres (2026-09-28).
 */
function stripMarks(site: StripSite, surface: (direction: THREE.Vector3) => number, origin: THREE.Vector3): THREE.Group {
  if (markParts === null) {
    const { box, column } = craftContext();
    markParts = {
      board: box(BOARD_WIDTH, BOARD_HEIGHT, BOARD_LENGTH, PALETTE.white),
      tyre: lathe(
        [
          [TYRE_INNER, 0],
          [TYRE_OUTER, 0],
          [TYRE_OUTER, TYRE_HEIGHT],
          [TYRE_INNER, TYRE_HEIGHT],
          [TYRE_INNER, 0],
        ],
        PALETTE.white,
        7,
      ),
      drums: [column(DRUM_RADIUS, DRUM_HEIGHT, PALETTE.red, 8), column(DRUM_RADIUS, DRUM_HEIGHT, PALETTE.skyBlue, 8)],
    };
  }
  const parts = markParts;
  const group = new THREE.Group();
  const place = (template: THREE.Mesh, along: number, across: number, sink: number, yaw = 0): void => {
    const direction = stripPoint(site, along, across, new THREE.Vector3());
    markUp.copy(direction);
    markAhead.copy(site.forward).projectOnPlane(markUp).normalize().applyAxisAngle(markUp, yaw);
    markSide.crossVectors(markUp, markAhead);
    const piece = new THREE.Mesh(template.geometry, template.material);
    markBasis.makeBasis(markSide, markUp, markAhead);
    piece.quaternion.setFromRotationMatrix(markBasis);
    piece.position.copy(direction).multiplyScalar(surface(direction) - sink).sub(origin);
    group.add(piece);
  };
  for (const middle of THRESHOLDS) {
    for (const board of BOARD_ACROSS) {
      place(parts.board, middle, board, BEDDED - STRIP_LIFT);
      place(parts.board, middle, -board, BEDDED - STRIP_LIFT);
    }
  }
  for (let along = TYRE_EVERY / 2; along < STRIP_LENGTH; along += TYRE_EVERY) {
    place(parts.tyre, along, STRIP_DRAWN - TYRE_IN, BEDDED - STRIP_LIFT);
    place(parts.tyre, along, -STRIP_DRAWN + TYRE_IN, BEDDED - STRIP_LIFT);
  }
  place(parts.drums[0]!, DRUM_ALONG, -DRUM_OFF, 0.05);
  place(parts.drums[1]!, DRUM_ALONG + 2.4 * DRUM_RADIUS, -DRUM_OFF - 0.4, 0.05, 0.7);
  const marks = assemble('airstrip-marks', [soupOf(group)]);
  marks.traverse((part) => {
    if ((part as THREE.Mesh).isMesh) part.castShadow = true;
  });
  return marks;
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
