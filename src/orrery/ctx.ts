/** The orrery's shared context: its scene objects and its state. Every module is a set of functions over it. */
import * as THREE from 'three';
import { BODIES, type Body } from '../system/index.ts';
import { PALETTE } from '../theme.ts';
import { addMoon, buildPlanets, createSun, type Scaffold } from './build.ts';
import { ringsFor } from './layout.ts';
import { planetRamp, type RingUniforms } from './materials.ts';
import type { OrreryBody } from './types.ts';

/** One body as the orrery holds it: its entry, its globe and its ring. */
export interface Built {
  entry: OrreryBody;
  /** The planet a moon circles, whose position its ring is centred on; `null` for a planet. */
  around: Built | null;
  /** The everyday painted geometry, put back when a held globe is let go. */
  coarse: THREE.BufferGeometry | null;
  /** The body's local position in the ecliptic frame, updated from the orbit. */
  local: THREE.Vector3;
  pivot: THREE.Object3D | null;
  mesh: THREE.Mesh | null;
  /**
   * Its own material, so it can fade on its own: the same shader for every
   * planet, so still one program. `null` for Earth, which has no mesh here.
   */
  material: THREE.ShaderMaterial | null;
  spin: number;
  ring: THREE.Mesh;
  ringMaterial: THREE.ShaderMaterial & { uniforms: RingUniforms };
  /** Drawn by somebody else, still and upright: see `cover`. */
  covered?: boolean;
}

/** Everything the orrery's functions share: its scene objects and its state. */
export interface OrreryCtx {
  readonly group: THREE.Group;
  readonly star: Body;
  readonly sunUniform: { value: THREE.Vector3 };
  readonly ramp: THREE.DataTexture;
  readonly disposables: { dispose(): void }[];
  readonly sunEntry: OrreryBody;
  readonly sunMat: THREE.ShaderMaterial;
  readonly sunMesh: THREE.Mesh;
  readonly glow: THREE.Sprite;
  readonly glowMaterial: THREE.SpriteMaterial;
  readonly built: Built[];
  /** The planets alone, the Sun's rings, outermost last. */
  readonly planetsBuilt: Built[];
  readonly earthBuilt: Built;
  readonly earth: OrreryBody;
  /** The ecliptic of date in world space, rewritten by every `update`. */
  readonly ex: THREE.Vector3;
  readonly ey: THREE.Vector3;
  readonly ez: THREE.Vector3;
  readonly north: THREE.Vector3;
  readonly sunWorld: THREE.Vector3;
  readonly basis: THREE.Matrix4;
  readonly heldTurn: THREE.Quaternion;
  /** The world's axes in the ecliptic group's frame, this frame: where a covered body's pivot stands. */
  readonly upright: THREE.Quaternion;
  /** What a covered body's ball is drawn with: nothing. */
  readonly nothing: THREE.BufferGeometry;
  /** Where the held body's pivot was when it was taken. */
  readonly holdFrom: THREE.Quaternion;
  /** The held bodies' finer painted globes, by id. */
  readonly heldGlobes: Map<string, THREE.BufferGeometry>;
  readonly gold: THREE.Color;
  readonly cream: THREE.Color;

  highlighted: string | null;
  focused: string | null;
  /** The body held upright for a globe stage. */
  held: Built | null;
  /** The held body's spin when it was taken, and how far it has turned upright, 0 to 1. */
  holdSpin: number;
  holdK: number;
  /** The held globe's region map, painted on holding it and let go with it. */
  heldTint: THREE.CanvasTexture | null;
}

export function createOrreryCtx(): OrreryCtx {
  const group = new THREE.Group();
  group.name = 'orrery';
  // The ecliptic frame, placed by hand each frame: a rotation built from three
  // basis vectors and the Sun's position. Nothing below it moves but the spins.
  group.matrixAutoUpdate = false;

  const planets = BODIES.filter((body) => body.orbit !== null);
  const star = BODIES.find((body) => body.kind === 'star');
  if (star === undefined) throw new Error('orrery: the registry has no star');
  const scaffold: Scaffold = {
    group,
    star,
    planets,
    rings: ringsFor(planets),
    sunUniform: { value: new THREE.Vector3() },
    ramp: planetRamp(),
    disposables: [],
  };
  scaffold.disposables.push(scaffold.ramp);

  const sun = createSun(scaffold);
  const built = buildPlanets(scaffold);
  const earthBuilt = built.find((b) => b.entry.body.id === 'earth');
  if (earthBuilt === undefined) throw new Error('orrery: the registry has no Earth');
  const earth = earthBuilt.entry;
  earth.opacity = 1;
  addMoon(scaffold, built, earthBuilt);

  const nothing = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'color']) nothing.setAttribute(name, new THREE.Float32BufferAttribute([], 3));
  scaffold.disposables.push(nothing);

  return {
    group,
    star,
    sunUniform: scaffold.sunUniform,
    ramp: scaffold.ramp,
    disposables: scaffold.disposables,
    ...sun,
    built,
    planetsBuilt: built.filter((b) => b.around === null),
    earthBuilt,
    earth,
    ex: new THREE.Vector3(),
    ey: new THREE.Vector3(),
    ez: new THREE.Vector3(),
    north: new THREE.Vector3(),
    sunWorld: new THREE.Vector3(),
    basis: new THREE.Matrix4(),
    heldTurn: new THREE.Quaternion(),
    upright: new THREE.Quaternion(),
    nothing,
    holdFrom: new THREE.Quaternion(),
    heldGlobes: new Map(),
    gold: new THREE.Color(PALETTE.gold),
    cream: new THREE.Color(PALETTE.cream),
    highlighted: null,
    focused: null,
    held: null,
    holdSpin: 0,
    holdK: 1,
    heldTint: null,
  };
}
