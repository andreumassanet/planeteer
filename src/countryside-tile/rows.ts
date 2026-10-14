/** A field's rows at the finest level: ridges of soil and what grows on them, rows of plants, a paddy's bunds. */
import * as THREE from 'three';
import { PLANET_RADIUS } from '../globe.ts';
import { reliefAt } from '../terrain.ts';
import type { LandProbe } from '../land-probe.ts';
import { rngFrom } from '../scenery/random.ts';
import type { SceneryContext } from '../scenery/contract.ts';
import type { CropField } from '../countryside.ts';
import { bar } from './bar.ts';
import type { CropRows, Look, RowSection } from './looks.ts';
import { SOWN } from './looks.ts';
import { FAR_FIELD_LIFT, SEGMENT } from './types.ts';
import { fieldPoint, groundAt, orientField, pushVertex } from './surface.ts';
import type { Surface } from './surface.ts';

interface RowLayer {
  section: RowSection;
  over: number;
  crown: number;
}

const rowGround: THREE.Vector3[] = [];
const rowUp: THREE.Vector3[] = [];
const footColour = new THREE.Color();
const crownColour = new THREE.Color();
const ca = new THREE.Color();
const cb = new THREE.Color();
const cc = new THREE.Color();
const cd = new THREE.Color();
const sectionNormal: [number, number][] = [];
const side = new THREE.Vector3();
const along = new THREE.Vector3();
const pa = new THREE.Vector3();
const rowA = new THREE.Vector3();
const rowB = new THREE.Vector3();
const layers: RowLayer[] = [];

/** One quad with a colour a corner, wound to face the way its corners' normals do. */
function shadedQuad(s: Surface): void {
  const { va, vb, vc, vd, na, nb, nc, nd } = s;
  s.e1.subVectors(vb, va);
  s.e2.subVectors(vd, va);
  s.faceNormal.crossVectors(s.e1, s.e2);
  const facing = s.faceNormal.dot(s.e1.copy(na).add(nb).add(nc).add(nd)) >= 0;
  const hull = s.noInk.copy(va).normalize().negate();
  if (facing) {
    pushVertex(s, va, na, ca, hull); pushVertex(s, vb, nb, cb, hull); pushVertex(s, vc, nc, cc, hull);
    pushVertex(s, va, na, ca, hull); pushVertex(s, vc, nc, cc, hull); pushVertex(s, vd, nd, cd, hull);
  } else {
    pushVertex(s, va, na, ca, hull); pushVertex(s, vc, nc, cc, hull); pushVertex(s, vb, nb, cb, hull);
    pushVertex(s, va, na, ca, hull); pushVertex(s, vd, nd, cd, hull); pushVertex(s, vc, nc, cc, hull);
  }
}

/**
 * Each corner's normal in the section: its two edges' outward normals
 * averaged, a foot's tipped up by the ground it stands on.
 */
function sectionNormals(points: RowSection['points']): void {
  sectionNormal.length = 0;
  for (let i = 0; i < points.length; i++) {
    let nx = 0;
    let ny = 0;
    for (const [p, q] of [[i - 1, i], [i, i + 1]] as const) {
      if (p < 0 || q >= points.length) {
        ny += 1;
        continue;
      }
      const dx = points[q]![0] - points[p]![0];
      const dy = points[q]![1] - points[p]![1];
      const l = Math.hypot(dx, dy) || 1;
      nx += -dy / l;
      ny += dx / l;
    }
    const l = Math.hypot(nx, ny) || 1;
    sectionNormal.push([nx / l, ny / l]);
  }
}

/** Closes one end of a swept section with a fan from the section's middle at the plate. */
function closeEnd(
  s: Surface, layer: RowLayer, points: RowSection['points'], end: number,
  corner: (k: number, i: number, into: THREE.Vector3, normal: THREE.Vector3, tint: THREE.Color) => void,
  shade: (y: number, into: THREE.Color) => THREE.Color,
): void {
  const { vb, vc, na, nd } = s;
  const outward = end === 0 ? -1 : 1;
  const n = nd.copy(along).multiplyScalar(outward);
  const up = rowUp[end]!;
  const middle = pa.copy(rowGround[end]!).addScaledVector(up, layer.over);
  for (let i = 0; i + 1 < points.length; i++) {
    corner(end, i, vb, na, cb);
    corner(end, i + 1, vc, na, cc);
    s.e1.subVectors(vb, middle);
    s.e2.subVectors(vc, middle);
    s.faceNormal.crossVectors(s.e1, s.e2);
    const hull = s.noInk.copy(middle).normalize().negate();
    shade(0, ca);
    const [p, q, cp, cq] = s.faceNormal.dot(n) >= 0 ? [vb, vc, cb, cc] : [vc, vb, cc, cb];
    pushVertex(s, middle, n, ca, hull);
    pushVertex(s, p, n, cp, hull);
    pushVertex(s, q, n, cq, hull);
  }
}

/**
 * A row along the ground from a to b (unit vectors), drawn as the layers
 * given, each a section swept along it `over` units above the plate: a ridge
 * of soil, and the plants on its crown. The ground is asked once a
 * `SEGMENT[0]` along it and shared by every layer. The faces have no ink (a
 * pen line round every furrow is a hatching) and their normals are the
 * section's own, smoothed round it, so the ramp steps across a ridge as
 * across something round. Each end is closed.
 */
function rowAlong(s: Surface, a: THREE.Vector3, b: THREE.Vector3, rowLayers: readonly RowLayer[], land: LandProbe | undefined, landReady: boolean): void {
  const { va, vb, vc, vd, na, nb, nc, nd } = s;
  const length = a.distanceTo(b) * PLANET_RADIUS;
  const pieces = Math.max(1, Math.ceil(length / SEGMENT[0]!));
  while (rowGround.length <= pieces) {
    rowGround.push(new THREE.Vector3());
    rowUp.push(new THREE.Vector3());
  }
  for (let k = 0; k <= pieces; k++) {
    const up = rowUp[k]!.copy(a).lerp(b, k / pieces).normalize();
    const shelf = s.world.elevationAt(up) - reliefAt(up.x, up.y, up.z);
    const g = groundAt(s, up, shelf, up, land, landReady);
    rowGround[k]!.copy(up).multiplyScalar(g.radius - (g.drawn ? 0 : FAR_FIELD_LIFT - s.fieldLift));
  }
  for (const layer of rowLayers) {
    const points = layer.section.points;
    const top = Math.max(...points.map(([, y]) => y));
    footColour.set(layer.section.foot);
    crownColour.set(layer.crown);
    sectionNormals(points);
    const shade = (y: number, into: THREE.Color): THREE.Color => into.copy(footColour).lerp(crownColour, Math.min(1, Math.max(0, y / top)));
    const corner = (k: number, i: number, into: THREE.Vector3, normal: THREE.Vector3, tint: THREE.Color): void => {
      const [x, y] = points[i]!;
      const up = rowUp[k]!;
      into.copy(rowGround[k]!).addScaledVector(side, x).addScaledVector(up, layer.over + y);
      const [nx, ny] = sectionNormal[i]!;
      normal.copy(side).multiplyScalar(nx).addScaledVector(up, ny).normalize();
      shade(y, tint);
    };
    for (let k = 0; k < pieces; k++) {
      along.subVectors(rowGround[k + 1]!, rowGround[k]!).normalize();
      side.crossVectors(along, rowUp[k]!).normalize();
      for (let i = 0; i + 1 < points.length; i++) {
        corner(k, i, va, na, ca);
        corner(k + 1, i, vb, nb, cb);
        corner(k + 1, i + 1, vc, nc, cc);
        corner(k, i + 1, vd, nd, cd);
        shadedQuad(s);
      }
      for (const end of k === 0 ? (pieces === 1 ? [0, 1] : [0]) : k === pieces - 1 ? [pieces] : []) {
        closeEnd(s, layer, points, end, corner, shade);
      }
    }
  }
}

/** A paddy's bunds round it, and across it into pools of about a dozen units. */
function paddyBunds(s: Surface, ctx: SceneryContext, field: CropField, bunds: NonNullable<Look['bunds']>, land: LandProbe | undefined, landReady: boolean): void {
  const X = field.halfX;
  const Z = field.halfZ;
  const edges: [number, number, number, number][] = [[-X, -Z, X, -Z], [X, -Z, X, Z], [X, Z, -X, Z], [-X, Z, -X, -Z]];
  const pools = Math.max(1, Math.round((2 * Z) / 12));
  for (let j = 1; j < pools; j++) {
    const z = -Z + (j * 2 * Z) / pools;
    edges.push([-X, z, X, z]);
  }
  for (const [ax, az, bx, bz] of edges) {
    fieldPoint(s, field, ax, az, rowA);
    fieldPoint(s, field, bx, bz, rowB);
    bar(s, rowA, rowB, bunds.width, bunds.width * 0.5, bunds.height, bunds.bury, s.fieldLift, ctx.tone(bunds.color, bunds.tone), false, land, landReady);
  }
}

/**
 * A field's rows: the plough's ridges with what grows on them, or rows of
 * plants on the bare plate, and a paddy's bunds. A field just ploughed is
 * sown or not by its own seed: half of them carry rows of shoots.
 */
export function rows(s: Surface, ctx: SceneryContext, look: Look, shoots: CropRows, field: CropField, land: LandProbe | undefined, landReady: boolean): void {
  orientField(s, field);
  const furrows = look.furrows;
  let crop = look.crop;
  if (field.crop === 'ploughed') {
    const seed = rngFrom('sown', Math.round(field.at.x * 1e6), Math.round(field.at.y * 1e6), Math.round(field.at.z * 1e6));
    if (seed.chance(SOWN)) crop = shoots;
  }
  const spacing = furrows?.spacing ?? crop?.spacing ?? 0;
  if (spacing > 0) {
    const count = Math.max(1, Math.floor((2 * field.halfX) / spacing));
    for (let i = 0; i < count; i++) {
      const x = -field.halfX + (i + 0.5) * ((2 * field.halfX) / count);
      // A round field's rows end at its ellipse.
      const room = field.round ? Math.sqrt(Math.max(0, 1 - (x / field.halfX) ** 2)) : 1;
      const reach = field.halfZ * room - 0.8;
      if (reach <= 1) continue;
      fieldPoint(s, field, x, -reach, rowA);
      fieldPoint(s, field, x, reach, rowB);
      layers.length = 0;
      if (furrows !== undefined) layers.push({ section: furrows.section, over: 0, crown: furrows.section.crown });
      if (crop !== undefined) {
        const over = furrows === undefined ? 0 : Math.max(...furrows.section.points.map(([, y]) => y)) - 0.05;
        layers.push({ section: crop.section, over, crown: i % 2 === 1 && crop.second !== undefined ? crop.second : crop.section.crown });
      }
      rowAlong(s, rowA, rowB, layers, land, landReady);
    }
  }
  if (look.bunds !== undefined) paddyBunds(s, ctx, field, look.bunds, land, landReady);
}
