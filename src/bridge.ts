/**
 * The bridge of a small ship: where the title screen stands the traveller,
 * with the solar system outside a window that takes up most of the wall
 * behind them.
 *
 * **The window is a hole, not a picture.** The hero's stage draws into a
 * transparent canvas over the planet menu, whose orrery keeps turning; this
 * room covers every pixel of that canvas except the window's bays, so what is
 * seen through them is the real solar system at today's longitudes, drawn by
 * `menu.ts`. Nothing stands outside the room — no floor past the sill, no
 * planet models — and the glass is a tint of a few per cent with two streaks
 * on it, drawn without depth, so it marks the pane without hiding anything.
 * The floor and the ceiling are each closed by a plate cut to the room's own
 * plan under the tiles, because a tile grid on a faceted plan leaves wedges
 * at the walls, and a wedge in this floor is a hole into space.
 *
 * **Two scales, because the kit has two.** Kenney's Space Station Kit is on a
 * one-unit grid whose door is 0.7 units tall and whose high-backed chair is
 * 0.7 too: the architecture and the furniture were drawn for different
 * people. The architecture is scaled so a door clears the hero by a sixth
 * (`ROOM`), the furniture so a console stands at the hero's waist (`KIT`).
 *
 * **One merged mesh a material.** Every still piece — floor, walls, sill,
 * mullions, header, consoles, chairs, crates, pipes — is one buffer on the
 * world's vertex-coloured toon material (`modelMaterial`), inked by the same
 * pen as the hero. What glows is a second buffer: the screens are the kit's
 * own screen faces (the slot the pack paints its screens with), lifted out of
 * the consoles triangle by triangle, and the indicator lights, each vertex
 * carrying a phase, a rate and a kind (a screen breathes, a light blinks, the
 * holo shimmers) that one shader reads. The rest is small and moves: the
 * planet over the holo table, its beam, the dust in the lamplight, the glass.
 *
 * It is built only for the title screen and arrives behind a dynamic import
 * (`hero-stage.ts`), with the space kit it reads, so none of it is in Earth's
 * first load.
 */
import * as THREE from 'three';
import { modelMaterial, onPalette, toned } from './models.ts';
import { loadSpaceGroup } from './space-kit.ts';
import type { SpacePiece } from './space-kit.ts';
import { AVATAR_HEIGHT } from './stature.ts';
import { PALETTE } from './theme.ts';

/** What the bridge is drawn with: the ramp and the pen the hero already has. */
export interface BridgeLook {
  gradientMap: THREE.Texture;
  ink: { thickness: number; color: [number, number, number] };
}

/** One bay of the window: its middle on the glass, and the way into the room. */
export interface BridgeBay {
  centre: THREE.Vector3;
  inward: THREE.Vector3;
}

export interface Bridge {
  /** The room, its lights and everything in it. Feet on y = 0 at the origin, the window towards -z. */
  group: THREE.Group;
  /** The window's bays, for a camera that leaves through one. */
  bays: readonly BridgeBay[];
  /** The small life: `time` in seconds, `pointScale` the pixels a world unit spans at one unit away. */
  update(time: number, pointScale: number): void;
  dispose(): void;
}

/** The hero's height: every distance below is a share of it. */
const H = AVATAR_HEIGHT;
/** The architecture's scale: a kit door (0.7 units) clears the hero by a sixth. */
const ROOM = (H * 1.17) / 0.7;
/** The furniture's: a kit console (0.66 units) stands at the hero's waist and a bit. */
const KIT = H;

/**
 * The room's plan, in hero heights, as (x, z) round the walls: a long side
 * wall on the left, three faces of window — a facet, the wide wall straight
 * ahead, a facet — and the right side wall. The hero stands at the origin
 * facing +z, so the window is behind them; the open side is the camera's.
 */
const PLAN: readonly (readonly [number, number])[] = [
  [-7, 16],
  [-7, -0.8],
  [-5, -2.2],
  [2.4, -2.2],
  [4.2, -0.8],
  [4.2, 16],
];
/** Which of the plan's edges are window, in order. */
const WINDOWED = [false, true, true, true, false];
/**
 * The window's sill and the header's underside, and the ceiling, in hero
 * heights. The ceiling is high for a ship because a tall, narrow screen puts
 * the title's camera forty-odd units back and eight up, and it must still be
 * under it.
 */
const SILL = 0.34;
const HEAD = 1.32;
const CEIL = 2.3;
/** How long a bay of the window may be, in hero heights, and how wide a mullion. */
const BAY = 1.7;
const MULLION = 0.16;
/** The wall's half thickness, in world units: the kit's wall is 0.3 deep. */
const WALL_HALF = 0.15 * ROOM;

/** What lights up: a screen breathes, an indicator blinks, the holo shimmers. */
const SCREEN = 0;
const INDICATOR = 1;
const HOLO = 2;

/** The kit's slot colours, brought onto the palette: warm light panels, slate frames. */
const BASE_PAINT: Readonly<Record<string, THREE.Color>> = {
  'colormap#9ea5c6': toned(PALETTE.bone, 1.06),
  'colormap#6e738a': toned(PALETTE.slate, 0.96),
  'colormap#ffb449': toned(PALETTE.apricot, 1),
  'colormap#ffc044': new THREE.Color(PALETTE.gold),
  'colormap#3d3d44': toned(PALETTE.steel, 0.85),
  'colormap#98bbeb': new THREE.Color(PALETTE.skyBlue),
  'colormap#a0a8c9': toned(PALETTE.bone, 1.1),
  'colormap#dcdce9': new THREE.Color(PALETTE.white),
  metal: toned(PALETTE.bone, 1.08),
  metalDark: toned(PALETTE.slate, 0.9),
  metalRed: new THREE.Color(PALETTE.red),
  dark: toned(PALETTE.steel, 0.8),
};
const FLOOR_PAINT: Readonly<Record<string, THREE.Color>> = {
  'colormap#9ea5c6': toned(PALETTE.slate, 1.16),
  'colormap#6e738a': toned(PALETTE.slate, 0.74),
};
const CHAIR_PAINT: Readonly<Record<string, THREE.Color>> = {
  'colormap#ffb449': toned(PALETTE.crimson, 1.05),
  'colormap#9ea5c6': toned(PALETTE.bone, 0.98),
};
const CRATE_PAINT: Readonly<Record<string, THREE.Color>> = { 'colormap#ffb449': new THREE.Color(PALETTE.orange) };
const PIPE_PAINT: Readonly<Record<string, THREE.Color>> = {
  'colormap#9ea5c6': toned(PALETTE.steel, 1.25),
  'colormap#ffb449': new THREE.Color(PALETTE.gold),
};

/** What a screen glows, picked a console at a time; most are the sky's blue. */
const SCREEN_COLOURS = [PALETTE.skyBlue, PALETTE.skyBlue, PALETTE.skyBlue, PALETTE.green, PALETTE.apricot];
const LIGHT_COLOURS = [PALETTE.red, PALETTE.green, PALETTE.gold, PALETTE.skyBlue];

/** A deterministic shuffle of the room's small choices, so the bridge is the same each visit. */
function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A buffer being filled: the solid one carries normals for the light and the pen, the glow one its blink. */
class Buffer {
  readonly position: number[] = [];
  readonly normal: number[] = [];
  readonly outlineNormal: number[] = [];
  readonly color: number[] = [];
  readonly blink: number[] = [];

  geometry(withNormals: boolean): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.position, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(this.color, 3));
    if (withNormals) {
      geometry.setAttribute('normal', new THREE.Float32BufferAttribute(this.normal, 3));
      geometry.setAttribute('outlineNormal', new THREE.Float32BufferAttribute(this.outlineNormal, 3));
    } else {
      geometry.setAttribute('blink', new THREE.Float32BufferAttribute(this.blink, 3));
    }
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
  }
}

/** Where a piece goes: its base's middle at `at`, turned `yaw`, scaled per axis on top of its own scale. */
interface Placing {
  at: THREE.Vector3;
  yaw?: number;
  /** Turned about its own long axis first (a pipe laid down), or upside down (a ceiling tile). */
  roll?: number;
  flip?: boolean;
  /** Put down by its middle rather than its base: a pipe laid on its side. */
  middle?: boolean;
  scale?: readonly [number, number, number];
  /** The architecture's scale or the furniture's. */
  unit: number;
  paint?: Readonly<Record<string, THREE.Color>>;
  /** Slots that glow instead, in one colour, and how. */
  glow?: { slots: readonly string[]; colour: number; kind: number };
}

const scratch = {
  matrix: new THREE.Matrix4(),
  normalMatrix: new THREE.Matrix3(),
  centre: new THREE.Matrix4(),
  rotation: new THREE.Matrix4(),
  scale: new THREE.Matrix4(),
  euler: new THREE.Euler(),
  v: new THREE.Vector3(),
  n: new THREE.Vector3(),
};

export function loadBridgePieces(): Promise<Map<string, SpacePiece>> {
  return loadSpaceGroup('interior');
}

/** The room, put together from the kit's pieces. Throws if a piece the plan needs is missing. */
export function buildBridge(pieces: ReadonlyMap<string, SpacePiece>, look: BridgeLook): Bridge {
  const solid = new Buffer();
  const glow = new Buffer();
  const roll = random(0x5b1d6e);
  /** The glow's own clock per piece: a phase and a rate. */
  const blinkOf = (kind: number): [number, number, number] => [roll(), kind === INDICATOR ? 0.6 + roll() * 1.4 : 0.6 + roll() * 0.9, kind];

  function place(id: string, placing: Placing): void {
    const piece = pieces.get(id);
    if (piece === undefined) throw new Error(`bridge: the kit has no ${id}`);
    const { model } = piece;
    const box = model.box;
    // The base's middle to the origin, then scaled, turned and put down: T * R * S * C.
    const lift = placing.middle === true ? (box.min.y + box.max.y) / 2 : box.min.y;
    scratch.centre.makeTranslation(-(box.min.x + box.max.x) / 2, -lift, -(box.min.z + box.max.z) / 2);
    const [sx, sy, sz] = placing.scale ?? [1, 1, 1];
    scratch.scale.makeScale(sx * placing.unit, sy * placing.unit, sz * placing.unit);
    scratch.euler.set(placing.flip === true ? Math.PI : 0, placing.yaw ?? 0, placing.roll ?? 0, 'YXZ');
    scratch.rotation.makeRotationFromEuler(scratch.euler);
    scratch.matrix.makeTranslation(placing.at.x, placing.at.y, placing.at.z).multiply(scratch.rotation).multiply(scratch.scale).multiply(scratch.centre);
    // A reflected basis turns the pen's hull inside out (OutlineEffect draws its hull BackSide).
    if (!(scratch.matrix.determinant() > 0)) throw new Error(`bridge: ${id} placed with a reflected basis`);
    scratch.normalMatrix.getNormalMatrix(scratch.matrix);

    const colours = model.slots.map((slot, s) => placing.paint?.[slot] ?? BASE_PAINT[slot] ?? onPalette(model.defaults[s]!));
    const glowing = model.slots.map((slot) => placing.glow?.slots.includes(slot) === true);
    const glowColour = placing.glow === undefined ? null : new THREE.Color(placing.glow.colour);
    const blink = placing.glow === undefined ? null : blinkOf(placing.glow.kind);

    const position = model.geometry.getAttribute('position');
    const normal = model.geometry.getAttribute('normal');
    const outline = model.geometry.getAttribute('outlineNormal');
    const index = model.geometry.index;
    const count = index === null ? position.count : index.count;
    for (let i = 0; i < count; i += 3) {
      const first = index === null ? i : index.getX(i);
      const lit = glowing[model.slot[first]!] === true;
      const into = lit ? glow : solid;
      for (let k = 0; k < 3; k++) {
        const v = index === null ? i + k : index.getX(i + k);
        scratch.v.fromBufferAttribute(position, v).applyMatrix4(scratch.matrix);
        into.position.push(scratch.v.x, scratch.v.y, scratch.v.z);
        if (lit) {
          into.color.push(glowColour!.r, glowColour!.g, glowColour!.b);
          into.blink.push(...blink!);
        } else {
          const c = colours[model.slot[v]!]!;
          into.color.push(c.r, c.g, c.b);
          scratch.n.fromBufferAttribute(normal, v).applyMatrix3(scratch.normalMatrix).normalize();
          into.normal.push(scratch.n.x, scratch.n.y, scratch.n.z);
          scratch.n.fromBufferAttribute(outline ?? normal, v).applyMatrix3(scratch.normalMatrix).normalize();
          into.outlineNormal.push(scratch.n.x, scratch.n.y, scratch.n.z);
        }
      }
    }
  }

  /** A flat plate cut to the plan, at `y`, facing up or down, for what the tiles leave. */
  function plate(y: number, up: boolean, colour: THREE.Color): void {
    const shape = new THREE.Shape(PLAN.map(([x, z]) => new THREE.Vector2(x * H, -z * H)));
    const geometry = new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2).toNonIndexed();
    const position = geometry.getAttribute('position');
    const triangles = position.count / 3;
    for (let t = 0; t < triangles; t++) {
      // Facing up as made; a ceiling's plate is the same triangles wound the other way.
      const order = up ? [0, 1, 2] : [0, 2, 1];
      for (const k of order) {
        solid.position.push(position.getX(t * 3 + k), y, position.getZ(t * 3 + k));
        solid.normal.push(0, up ? 1 : -1, 0);
        solid.outlineNormal.push(0, up ? 1 : -1, 0);
        solid.color.push(colour.r, colour.g, colour.b);
      }
    }
    geometry.dispose();
  }

  /* --- the floor and the ceiling ------------------------------------------------ */

  const tileTop = 0.3 * ROOM;
  const inside = (x: number, z: number): boolean => {
    // The plan is convex and wound anticlockwise in (x, z): inside is to the left of every edge.
    for (let i = 0; i < PLAN.length; i++) {
      const [ax, az] = PLAN[i]!;
      const [bx, bz] = PLAN[(i + 1) % PLAN.length]!;
      if ((bx - ax) * (z / H - az) - (bz - az) * (x / H - ax) < 0) return false;
    }
    return true;
  };
  for (let i = -6; i <= 4; i++) {
    for (let j = -2; j <= 10; j++) {
      const x = i * ROOM;
      const z = j * ROOM;
      const half = ROOM / 2;
      if (![[-1, -1], [1, -1], [1, 1], [-1, 1]].every(([dx, dz]) => inside(x + dx! * half, z + dz! * half))) continue;
      // Panels down the middle, plain plate round them, and the odd hatch.
      const middle = Math.abs(i) <= 1 && j <= 1;
      const id = middle ? 'floor-panel' : roll() < 0.12 ? 'floor-detail' : 'floor';
      place(id, { at: new THREE.Vector3(x, -tileTop, z), unit: ROOM, paint: FLOOR_PAINT, yaw: middle ? 0 : Math.floor(roll() * 4) * (Math.PI / 2) });
      place('floor', { at: new THREE.Vector3(x, CEIL * H + tileTop, z), unit: ROOM, paint: FLOOR_PAINT, flip: true });
    }
  }
  plate(-0.02, true, toned(PALETTE.slate, 0.7));
  plate(CEIL * H + 0.02, false, toned(PALETTE.slate, 0.7));

  /* --- the walls and the window ------------------------------------------------- */

  const centroid = new THREE.Vector2(-1.4 * H, 4 * H);
  const bays: BridgeBay[] = [];
  const mullionAt = (x: number, z: number, yaw: number): void => {
    place('wall', { at: new THREE.Vector3(x, SILL * H, z), yaw, unit: ROOM, scale: [(MULLION * H) / ROOM, ((HEAD - SILL) * H) / ROOM, 1.3] });
    // A light on its inside face, over the dashboard.
    place('wall-switch', {
      at: new THREE.Vector3(x + Math.sin(yaw) * WALL_HALF * 1.32, (SILL + 0.3) * H, z + Math.cos(yaw) * WALL_HALF * 1.32),
      yaw,
      unit: KIT,
      scale: [0.9, 0.9, 1],
      glow: { slots: ['colormap#9ea5c6'], colour: LIGHT_COLOURS[Math.floor(roll() * LIGHT_COLOURS.length)]!, kind: INDICATOR },
    });
  };
  for (let e = 0; e < PLAN.length - 1; e++) {
    const [ax, az] = PLAN[e]!;
    const [bx, bz] = PLAN[e + 1]!;
    const from = new THREE.Vector2(ax * H, az * H);
    const to = new THREE.Vector2(bx * H, bz * H);
    const along = to.clone().sub(from);
    const length = along.length();
    along.normalize();
    // Local +z is (sin yaw, cos yaw); the kit's walls face both ways, but its consoles face +z.
    let yaw = Math.atan2(-along.y, along.x);
    const middle = from.clone().add(to).multiplyScalar(0.5);
    if (Math.sin(yaw) * (centroid.x - middle.x) + Math.cos(yaw) * (centroid.y - middle.y) < 0) yaw += Math.PI;
    const inward = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const point = (s: number, y: number): THREE.Vector3 => new THREE.Vector3(from.x + along.x * s, y, from.y + along.y * s);

    if (WINDOWED[e] === true) {
      const count = Math.max(1, Math.round(length / (BAY * H)));
      const bay = length / count;
      for (let k = 0; k < count; k++) {
        const s = (k + 0.5) * bay;
        place('wall', { at: point(s, 0), yaw, unit: ROOM, scale: [bay / ROOM, (SILL * H) / ROOM, 1] });
        place('wall', { at: point(s, HEAD * H), yaw, unit: ROOM, scale: [bay / ROOM, ((CEIL - HEAD) * H) / ROOM, 1] });
        mullionAt(point(k * bay, 0).x, point(k * bay, 0).z, yaw);
        bays.push({ centre: point(s, ((SILL + HEAD) / 2) * H), inward });
      }
      if (WINDOWED[e + 1] !== true) mullionAt(point(length, 0).x, point(length, 0).z, yaw);

      // The dashboard under the glass: low consoles, a tall one at each end of the long wall.
      const reach = length - 0.8 * H;
      const consoles = Math.max(1, Math.floor(reach / (0.84 * KIT)));
      for (let k = 0; k < consoles; k++) {
        const s = 0.4 * H + (k + 0.5) * (reach / consoles);
        const end = e === 2 && (k === 0 || k === consoles - 1);
        const id = end ? 'computer-screen' : k % 4 === 2 ? 'computer-system' : 'computer-wide';
        const depth = (pieces.get(id)?.model.box.max.z ?? 0.3) - (pieces.get(id)?.model.box.min.z ?? -0.3);
        const at = point(s, 0).addScaledVector(inward, WALL_HALF + (depth * KIT) / 2 + 0.08);
        place(id, {
          at,
          yaw,
          unit: KIT,
          glow: { slots: ['colormap#ffb449'], colour: SCREEN_COLOURS[Math.floor(roll() * SCREEN_COLOURS.length)]!, kind: SCREEN },
        });
      }
    } else {
      const count = Math.max(1, Math.round(length / ROOM));
      const bay = length / count;
      const upper = (CEIL * H - ROOM) / ROOM;
      for (let k = 0; k < count; k++) {
        const s = (k + 0.5) * bay;
        const at = point(s, 0);
        // A door on the left wall, a little way back, and a banner on the right.
        const door = e === 0 && k === count - 3;
        place(door ? 'wall-door' : e === 4 && k === 2 ? 'wall-banner' : 'wall', { at, yaw, unit: ROOM, scale: [bay / ROOM, 1, 1] });
        if (door) place('door-double', { at, yaw, unit: ROOM, scale: [bay / ROOM, 1, 1.4] });
        place('wall', { at: point(s, ROOM), yaw, unit: ROOM, scale: [bay / ROOM, upper, 1] });
        if (k === count - 1 && e === 0) {
          // Screens on the wall beside the window, for a wider screen than most.
          place('display-wall-wide', {
            at: at.clone().addScaledVector(inward, WALL_HALF).setY(0.75 * H),
            yaw,
            unit: KIT,
            glow: { slots: ['colormap#ffb449'], colour: PALETTE.skyBlue, kind: SCREEN },
          });
        }
      }
    }
  }

  // A pipe run along the header of the long wall, with coloured collars.
  {
    const [ax] = PLAN[2]!;
    const [bx] = PLAN[3]!;
    const z = PLAN[2]![1] * H + WALL_HALF + 0.35;
    const y = (HEAD + 0.13) * H;
    const length = (bx - ax) * H;
    const pipe = pieces.get('pipe')!.model.box;
    place('pipe', { at: new THREE.Vector3(((ax + bx) / 2) * H, y, z), roll: Math.PI / 2, middle: true, unit: KIT, scale: [1, length / ((pipe.max.y - pipe.min.y) * KIT), 1], paint: PIPE_PAINT });
    for (let x = ax + 0.9; x < bx - 0.5; x += 1.8) {
      place('pipe-ring-colored', { at: new THREE.Vector3(x * H, y, z), roll: Math.PI / 2, middle: true, unit: KIT, scale: [1, 0.35, 1], paint: PIPE_PAINT });
    }
  }

  /* --- the furniture -------------------------------------------------------------- */

  // The captain's chair, turned out to the room as if just got up from.
  place('chair-armrest-headrest', { at: new THREE.Vector3(-0.95 * H, 0, -0.7 * H), yaw: 0.55, unit: KIT * 1.12, paint: CHAIR_PAINT });
  // The crew's seats at the dashboard, backs to the room.
  place('chair-headrest', { at: new THREE.Vector3(-2.3 * H, 0, -1.45 * H), yaw: Math.PI + 0.15, unit: KIT, paint: CHAIR_PAINT });
  place('chair-headrest', { at: new THREE.Vector3(1.55 * H, 0, -1.5 * H), yaw: Math.PI - 0.2, unit: KIT, paint: CHAIR_PAINT });
  // The holo table at the hero's right, its pad lit.
  const table = new THREE.Vector3(0.98 * H, 0, -0.95 * H);
  const tableScale = 0.8;
  place('table-display', {
    at: table,
    yaw: -0.25,
    unit: KIT * tableScale,
    glow: { slots: ['colormap#98bbeb'], colour: PALETTE.skyBlue, kind: HOLO },
  });
  const tableBox = pieces.get('table-display')!.model.box;
  const padTop = (tableBox.max.y - tableBox.min.y) * KIT * tableScale;
  // Crates in the corners, one on another.
  place('container-tall', { at: new THREE.Vector3(2.6 * H, 0, -0.75 * H), yaw: 0.3, unit: KIT, paint: CRATE_PAINT });
  place('container', { at: new THREE.Vector3(2.15 * H, 0, -0.35 * H), yaw: -0.2, unit: KIT, paint: CRATE_PAINT });
  place('container-wide', { at: new THREE.Vector3(-3.4 * H, 0, -1.25 * H), yaw: 0.5, unit: KIT, paint: CRATE_PAINT });
  place('container', { at: new THREE.Vector3(-3.4 * H, 0.7 * KIT, -1.25 * H), yaw: 0.9, unit: KIT * 0.9, paint: CRATE_PAINT });
  place('computer', { at: new THREE.Vector3(-4.4 * H, 0, -0.2 * H), yaw: Math.PI / 2 + 0.5, unit: KIT, glow: { slots: ['colormap#ffb449'], colour: PALETTE.green, kind: SCREEN } });

  /* --- the meshes ---------------------------------------------------------------- */

  const group = new THREE.Group();
  group.name = 'bridge';
  const material = modelMaterial(look.gradientMap, look.ink);
  const room = new THREE.Mesh(solid.geometry(true), material);
  room.name = 'bridge-room';
  room.receiveShadow = true;
  group.add(room);

  const time = { value: 0 };
  const glowMaterial = new THREE.MeshBasicMaterial({ vertexColors: true });
  // No pen on a light: the console it sits in is inked already.
  glowMaterial.userData.outlineParameters = { visible: false };
  glowMaterial.onBeforeCompile = (shader) => {
    shader.uniforms['uTime'] = time;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 blink;\nuniform float uTime;\nvarying float vBlink;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float wave = 0.5 + 0.5 * sin(uTime * blink.y + blink.x * 6.2832);
        // A screen breathes, an indicator is on or off, the holo shimmers.
        vBlink = blink.z < 0.5 ? 0.84 + 0.16 * wave
          : blink.z < 1.5 ? 0.2 + 0.8 * step(0.38, fract(uTime * blink.y * 0.5 + blink.x))
          : 0.72 + 0.28 * wave;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vBlink;')
      .replace('vec4 diffuseColor = vec4( diffuse, opacity );', 'vec4 diffuseColor = vec4( diffuse * vBlink, opacity );');
  };
  const lights = new THREE.Mesh(glow.geometry(false), glowMaterial);
  lights.name = 'bridge-lights';
  group.add(lights);

  // The glass: a tint of a few per cent and two soft streaks, so the pane reads and the sky behind it stays.
  const glassMaterial = new THREE.MeshBasicMaterial({ map: glassTexture(), transparent: true, depthWrite: false, side: THREE.DoubleSide });
  glassMaterial.userData.outlineParameters = { visible: false };
  const panes = new THREE.BufferGeometry();
  {
    const position: number[] = [];
    const uv: number[] = [];
    for (let e = 0; e < PLAN.length - 1; e++) {
      if (WINDOWED[e] !== true) continue;
      const [ax, az] = PLAN[e]!;
      const [bx, bz] = PLAN[e + 1]!;
      const a = new THREE.Vector3(ax * H, 0, az * H);
      const b = new THREE.Vector3(bx * H, 0, bz * H);
      const lo = SILL * H;
      const hi = HEAD * H;
      const corners = [
        [a, lo, 0, 0],
        [b, lo, 1, 0],
        [b, hi, 1, 1],
        [a, hi, 0, 1],
      ] as const;
      // Two-sided, so the winding does not matter.
      for (const k of [0, 1, 2, 0, 2, 3]) {
        const [p, y, u, v] = corners[k]!;
        position.push(p.x, y, p.z);
        uv.push(u * (b.distanceTo(a) / (2 * H)) + e * 0.37, v);
      }
    }
    panes.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
    panes.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  }
  const glass = new THREE.Mesh(panes, glassMaterial);
  glass.name = 'bridge-glass';
  glass.renderOrder = 2;
  group.add(glass);

  // The planet over the holo table, its ring, and the beam it stands in.
  const holo = new THREE.Group();
  holo.position.set(table.x, padTop + 0.36 * H, table.z);
  const planet = new THREE.Mesh(tinyPlanet(0.16 * H), material);
  const ring = new THREE.Mesh(tinyRing(0.16 * H), material);
  ring.rotation.x = Math.PI / 2 - 0.35;
  planet.rotation.z = 0.35;
  holo.add(planet, ring);
  group.add(holo);
  const beamMaterial = new THREE.ShaderMaterial({
    uniforms: { uTime: time, uColour: { value: new THREE.Color(PALETTE.skyBlue) } },
    vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform float uTime; uniform vec3 uColour; varying vec2 vUv;
      void main() {
        float lines = 0.8 + 0.2 * sin(vUv.y * 40.0 - uTime * 3.0);
        float a = (1.0 - vUv.y) * 0.2 * lines;
        gl_FragColor = vec4(uColour, a);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  beamMaterial.userData.outlineParameters = { visible: false };
  const beamHeight = 0.36 * H;
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.2 * H, 0.1 * H, beamHeight, 24, 1, true), beamMaterial);
  beam.position.set(table.x, padTop + beamHeight / 2 - 0.05, table.z);
  beam.renderOrder = 3;
  group.add(beam);

  // The dust in the lamplight: drifting up and round in the shader, nothing written a frame.
  const motes = dust(time);
  group.add(motes.points);

  // Light: a warm lamp over the hero, the cool of the screens from the window, the holo's own.
  const lamp = new THREE.PointLight(0xffd6a8, 10, 0, 1);
  lamp.position.set(0.4 * H, 1.75 * H, 0.8 * H);
  const screens = new THREE.PointLight(0x7fd4ff, 7, 0, 1);
  screens.position.set(-0.6 * H, 0.6 * H, -1.7 * H);
  const holoLight = new THREE.PointLight(0x8fe0ff, 3, 0, 1);
  holoLight.position.copy(holo.position);
  group.add(lamp, screens, holoLight);

  return {
    group,
    bays,
    update(seconds, pointScale) {
      time.value = seconds;
      holo.rotation.y = seconds * 0.35;
      planet.rotation.y = seconds * 0.6;
      holo.position.y = padTop + 0.36 * H + Math.sin(seconds * 1.1) * 0.06;
      holoLight.intensity = 3 * (0.85 + 0.15 * Math.sin(seconds * 2.3));
      screens.intensity = 7 * (0.94 + 0.06 * Math.sin(seconds * 0.9));
      motes.scale.value = pointScale;
    },
    dispose() {
      for (const mesh of [room, lights, glass, planet, ring, beam]) mesh.geometry.dispose();
      motes.points.geometry.dispose();
      for (const used of [material, glowMaterial, glassMaterial, beamMaterial, motes.points.material as THREE.Material]) used.dispose();
      glassMaterial.map?.dispose();
    },
  };
}

/** Two soft diagonal streaks on a faint blue: what says *glass* without covering anything. */
function glassTexture(): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const context = canvas.getContext('2d');
  if (context !== null) {
    context.fillStyle = 'rgba(170, 215, 255, 0.035)';
    context.fillRect(0, 0, 128, 128);
    for (const [at, width, alpha] of [
      [34, 22, 0.07],
      [70, 9, 0.05],
    ] as const) {
      const streak = context.createLinearGradient(at - width, 0, at + width, 0);
      streak.addColorStop(0, 'rgba(255, 255, 255, 0)');
      streak.addColorStop(0.5, `rgba(255, 255, 255, ${alpha})`);
      streak.addColorStop(1, 'rgba(255, 255, 255, 0)');
      context.save();
      context.translate(64, 64);
      context.transform(1, 0, -0.55, 1, 0, 0);
      context.translate(-64, -64);
      context.fillStyle = streak;
      context.fillRect(-64, -64, 256, 256);
      context.restore();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  return texture;
}

/** A planet the size of a fist: faceted, a sea, two greens and a sand, white at the poles. */
function tinyPlanet(radius: number): THREE.BufferGeometry {
  const geometry = new THREE.IcosahedronGeometry(radius, 2);
  geometry.computeVertexNormals();
  const position = geometry.getAttribute('position');
  const colours = new Float32Array(position.count * 3);
  const sea = new THREE.Color(PALETTE.skyBlue);
  const lands = [new THREE.Color(PALETTE.green), new THREE.Color(PALETTE.olive), new THREE.Color(PALETTE.sand)];
  const ice = new THREE.Color(PALETTE.white);
  const centre = new THREE.Vector3();
  for (let t = 0; t < position.count; t += 3) {
    centre.set(0, 0, 0);
    for (let k = 0; k < 3; k++) centre.add(new THREE.Vector3().fromBufferAttribute(position, t + k));
    centre.normalize();
    const land = Math.sin(centre.x * 5.1 + 1.3) + Math.sin(centre.y * 4.3 - 0.7) + Math.sin(centre.z * 6.2 + 2.1);
    const colour = Math.abs(centre.y) > 0.86 ? ice : land > 0.55 ? lands[Math.floor((land * 7) % 3)]! : sea;
    for (let k = 0; k < 3; k++) colours.set([colour.r, colour.g, colour.b], (t + k) * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  // The pen rides the sphere's own normal, one closed skin.
  const outline = new Float32Array(position.count * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) outline.set(v.fromBufferAttribute(position, i).normalize().toArray(), i * 3);
  geometry.setAttribute('outlineNormal', new THREE.BufferAttribute(outline, 3));
  return geometry;
}

function tinyRing(radius: number): THREE.BufferGeometry {
  const geometry = new THREE.TorusGeometry(radius * 1.65, radius * 0.07, 4, 40);
  const count = geometry.getAttribute('position').count;
  const colours = new Float32Array(count * 3);
  const colour = new THREE.Color(PALETTE.apricot);
  for (let i = 0; i < count; i++) colours.set([colour.r, colour.g, colour.b], i * 3);
  geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  geometry.setAttribute('outlineNormal', geometry.getAttribute('normal').clone());
  return geometry;
}

/** Dust motes: where each is comes from its seed and the clock, so nothing is written a frame. */
function dust(time: { value: number }): { points: THREE.Points; scale: { value: number } } {
  const COUNT = 150;
  const seeds = new Float32Array(COUNT * 4);
  const roll = random(0xd057);
  for (let i = 0; i < seeds.length; i++) seeds[i] = roll();
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(COUNT * 3), 3));
  geometry.setAttribute('seed', new THREE.BufferAttribute(seeds, 4));
  const scale = { value: 1000 };
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: time,
      uScale: scale,
      uMin: { value: new THREE.Vector3(-2.2 * H, 0.1 * H, -1.8 * H) },
      uSize: { value: new THREE.Vector3(3.8 * H, 1.5 * H, 2.9 * H) },
      uColour: { value: new THREE.Color(PALETTE.white) },
    },
    vertexShader: `
      attribute vec4 seed;
      uniform float uTime;
      uniform float uScale;
      uniform vec3 uMin;
      uniform vec3 uSize;
      varying float vAlpha;
      void main() {
        float rise = 0.05 + 0.08 * seed.w;
        float height = mod(seed.y * uSize.y + uTime * rise, uSize.y);
        vec3 p = uMin + vec3(seed.x * uSize.x, height, seed.z * uSize.z);
        p.x += sin(uTime * 0.23 + seed.w * 6.2832) * 0.35;
        p.z += cos(uTime * 0.19 + seed.x * 6.2832) * 0.35;
        vec4 view = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = uScale * 0.022 * (0.6 + seed.w) / -view.z;
        float edge = smoothstep(0.0, 0.12, height / uSize.y) * (1.0 - smoothstep(0.85, 1.0, height / uSize.y));
        vAlpha = edge * (0.45 + 0.55 * (0.5 + 0.5 * sin(uTime * 0.9 + seed.w * 12.0)));
        gl_Position = projectionMatrix * view;
      }`,
    fragmentShader: `
      uniform vec3 uColour;
      varying float vAlpha;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        gl_FragColor = vec4(uColour, smoothstep(0.5, 0.1, d) * vAlpha * 0.6);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  // Points are drawn twice by the pen's pass unless they opt out, and additive twice is double bright.
  material.userData.outlineParameters = { visible: false };
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  points.renderOrder = 4;
  return { points, scale };
}
