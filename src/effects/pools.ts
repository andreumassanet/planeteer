/** The pools: the meshes, the typed arrays behind them, the emitters' scratch and the frame's mutable state. */
import * as THREE from 'three';
import { createToonRamp } from '../theme.ts';
import { shadeByClouds } from '../cloud-shade.ts';
import type { CraftModel, PlayerState } from '../craft/contract.ts';
import type { EffectsStats, EffectsSubject, OtherVisitor, SmokeVisitor } from './types.ts';
import { MAX_PUFFS, MAX_DISCS, MAX_DEBRIS, MAX_RIBBONS, RIBBON_POINTS, FOAM_VERTEX_CAP, FOAM_COLOR } from './constants.ts';
import { P_STRIDE, F_STRIDE, R_LINK, R_STRIDE, D_STRIDE, E_SLOTS } from './layout.ts';
import type { Track } from './layout.ts';

/**
 * The puffs' material: the world's ramp, with an instanced `fxGlow` that
 * takes a puff's colour unlit — a flame is the one thing here that is its own
 * light, and it should read at night.
 */
function puffMaterial(): THREE.MeshToonMaterial {
  const material = new THREE.MeshToonMaterial({ gradientMap: createToonRamp(4) });
  material.userData.outlineParameters = { visible: false };
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float fxGlow;\nvarying float vFxGlow;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n  vFxGlow = fxGlow;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vFxGlow;')
      .replace('#include <opaque_fragment>', 'outgoingLight = mix( outgoingLight, diffuseColor.rgb, vFxGlow );\n#include <opaque_fragment>');
  };
  material.customProgramCacheKey = () => 'atlas-effects-puff';
  // A flame keeps its own colour (`fxGlow`); the smoke and the dust are lit, and shaded.
  return shadeByClouds(material);
}

/** A faceted ball: flat normals, because the ramp needs facets to step across. */
function puffGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.IcosahedronGeometry(1, 1);
  geometry.computeVertexNormals();
  return geometry;
}

export function createPools() {
  const group = new THREE.Group();
  group.name = 'effects';

  /* --- puffs ---------------------------------------------------------- */
  const puffGeo = puffGeometry();
  const glow = new THREE.InstancedBufferAttribute(new Float32Array(MAX_PUFFS), 1);
  glow.setUsage(THREE.DynamicDrawUsage);
  puffGeo.setAttribute('fxGlow', glow);
  const puffMat = puffMaterial();
  const puffs = new THREE.InstancedMesh(puffGeo, puffMat, MAX_PUFFS);
  puffs.name = 'effects-puffs';
  puffs.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  puffs.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_PUFFS * 3), 3);
  puffs.instanceColor.setUsage(THREE.DynamicDrawUsage);
  // Culled by nothing: its bounding sphere would be the one three computed
  // for whatever the pool held the first frame it asked.
  puffs.frustumCulled = false;
  puffs.castShadow = false;
  puffs.receiveShadow = false;
  puffs.count = 0;
  group.add(puffs);
  const p = new Float64Array(MAX_PUFFS * P_STRIDE);

  /* --- foam: discs and ribbons, one buffer ------------------------------ */
  const foamPositions = new Float32Array(FOAM_VERTEX_CAP * 3);
  const foamNormals = new Float32Array(FOAM_VERTEX_CAP * 3);
  const foamColors = new Float32Array(FOAM_VERTEX_CAP * 3);
  const foamGeo = new THREE.BufferGeometry();
  const foamAttribute = new THREE.BufferAttribute(foamPositions, 3);
  foamAttribute.setUsage(THREE.DynamicDrawUsage);
  foamGeo.setAttribute('position', foamAttribute);
  // The foam lies on the water and its normal is the water's, written with it.
  const foamNormal = new THREE.BufferAttribute(foamNormals, 3);
  foamNormal.setUsage(THREE.DynamicDrawUsage);
  foamGeo.setAttribute('normal', foamNormal);
  // White on the water; a skid mark's colour on the ground.
  const foamColor = new THREE.BufferAttribute(foamColors, 3);
  foamColor.setUsage(THREE.DynamicDrawUsage);
  foamGeo.setAttribute('color', foamColor);
  foamGeo.setDrawRange(0, 0);
  const foamMat = shadeByClouds(new THREE.MeshToonMaterial({
    color: FOAM_COLOR,
    vertexColors: true,
    gradientMap: createToonRamp(4),
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -4,
  }));
  foamMat.userData.outlineParameters = { visible: false };
  const foam = new THREE.Mesh(foamGeo, foamMat);
  foam.name = 'effects-foam';
  foam.frustumCulled = false;
  foam.castShadow = false;
  foam.receiveShadow = false;
  foam.visible = false;
  group.add(foam);
  const f = new Float64Array(MAX_DISCS * F_STRIDE);
  /** Foam vertices written so far this frame. */

  const r = new Float64Array(MAX_RIBBONS * RIBBON_POINTS * R_STRIDE);
  /** Each ribbon's oldest point, how many it holds, whether an emitter holds it, and the frame its emitter last ran. */
  const ribbonHead = new Int32Array(MAX_RIBBONS);
  const ribbonCount = new Int32Array(MAX_RIBBONS);
  const ribbonOwned = new Uint8Array(MAX_RIBBONS);
  const ribbonActive = new Float64Array(MAX_RIBBONS).fill(-Infinity);
  /** Set by a jump: the ribbon's next point starts a new strip, whatever ran last frame. */
  const ribbonBroken = new Uint8Array(MAX_RIBBONS);
  /** The player's own boat's three: the stern and the two shoulders. */
  const MINE = new Int32Array([0, 1, 2]);
  for (const ribbon of MINE) ribbonOwned[ribbon] = 1;
  /** The player's skid marks, left and right rear wheel: ribbons on the ground, which keep the height they were laid at. */
  const MARKS = new Int32Array([3, 4]);
  const ribbonOnGround = new Uint8Array(MAX_RIBBONS);
  for (const ribbon of MARKS) ribbonOwned[ribbon] = ribbonOnGround[ribbon] = 1;
  /** The first ribbon a followed boat may take. */
  const FIRST_FREE = 5;

  /* --- debris --------------------------------------------------------- */
  const debrisGeo = new THREE.BoxGeometry(1, 1, 1);
  const debrisMat = shadeByClouds(new THREE.MeshToonMaterial({ gradientMap: createToonRamp(4) }));
  debrisMat.userData.outlineParameters = { thickness: 0.004, color: [0.11, 0.02, 0.01] };
  const debris = new THREE.InstancedMesh(debrisGeo, debrisMat, MAX_DEBRIS);
  debris.name = 'effects-debris';
  debris.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  debris.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_DEBRIS * 3), 3);
  debris.instanceColor.setUsage(THREE.DynamicDrawUsage);
  debris.frustumCulled = false;
  debris.castShadow = false;
  debris.receiveShadow = false;
  debris.count = 0;
  group.add(debris);
  const d = new Float64Array(MAX_DEBRIS * D_STRIDE);

  const stats: EffectsStats = {
    enabled: true, puffs: 0, discs: 0, ribbonPoints: 0, ribbons: 0, foamVertices: 0, markVertices: 0,
    debris: 0, dropped: 0, jumps: 0, tracked: 0, calls: 0, updateMs: 0,
  };
  /** Where the meshes are this frame: every particle is written relative to it. */
  const anchor = new THREE.Vector3();
  const eye = new THREE.Vector3();

  /* --- the player, as the last frame left him ------------------------- */
  const splashUp = new THREE.Vector3();
  const last = new THREE.Vector3();
  const lastForward = new THREE.Vector3();
  /** What the player was in last frame, so boarding or stepping out resets rather than counts as a move. */
  const mine = new Float64Array(E_SLOTS);

  /** Followed vehicles, by object; their rows come from `trackFree` and go back to it. */
  const tracks = new Map<THREE.Object3D, Track>();
  const trackFree: Track[] = [];

  // Scratch.
  const right = new THREE.Vector3();
  const at = new THREE.Vector3();
  const vel = new THREE.Vector3();
  /** The emitter's own velocity, which the particles inherit a share of. */
  const motion = new THREE.Vector3();
  /** The emitter's move this frame, which interpolated emission walks back along. */
  const delta = new THREE.Vector3();
  /** Where a followed vehicle is, which its emitters start from. */
  const seen = new THREE.Vector3();
  /** Where a burst is centred, copied in, so a caller may pass any scratch vector. */
  const centre = new THREE.Vector3();
  const burstUp = new THREE.Vector3();
  const foamUp = new THREE.Vector3();
  const foamVel = new THREE.Vector3();
  const foamE1 = new THREE.Vector3();
  const foamE2 = new THREE.Vector3();
  const e1 = new THREE.Vector3();
  const e2 = new THREE.Vector3();
  const upAt = new THREE.Vector3();
  const fwdAt = new THREE.Vector3();
  const rightAt = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const axis = new THREE.Vector3();

  return {
    group,
    puffGeo,
    glow,
    puffMat,
    puffs,
    p,
    foamPositions,
    foamNormals,
    foamColors,
    foamGeo,
    foamAttribute,
    foamNormal,
    foamColor,
    foamMat,
    foam,
    f,
    r,
    ribbonHead,
    ribbonCount,
    ribbonOwned,
    ribbonActive,
    ribbonBroken,
    MINE,
    MARKS,
    ribbonOnGround,
    FIRST_FREE,
    debrisGeo,
    debrisMat,
    debris,
    d,
    stats,
    anchor,
    eye,
    splashUp,
    last,
    lastForward,
    mine,
    tracks,
    trackFree,
    right,
    at,
    vel,
    motion,
    delta,
    seen,
    centre,
    burstUp,
    foamUp,
    foamVel,
    foamE1,
    foamE2,
    e1,
    e2,
    upAt,
    fwdAt,
    rightAt,
    quaternion,
    axis,
    // Mutable state, written by every part of the module.
    puffCount: 0,
    discCount: 0,
    cursor: 0,
    debrisCount: 0,
    enabled: true,
    frame: 0,
    frameDt: 1 / 60,
    subject: null as EffectsSubject | null,
    hasLast: false,
    lastModel: null as CraftModel | null,
    lastState: 'foot' as PlayerState,
    speedAlong: 0,
    climb: 0,
    turnRate: 0,
    accel: 0,
    paved: true,
    dust: null as number | null,
    others: null as ((visit: OtherVisitor) => void) | null,
    smokers: null as ((visit: SmokeVisitor) => void) | null,
    firstAt: 0,
    spacingNow: 1,
    runNow: 0,
    bandInner: 0,
    bandOuter: 0,
    /** The colour the foam's next vertices are written in, linear. */
    tintR: 1,
    tintG: 1,
    tintB: 1,
    /** The player's boost as last seen, so a new one bursts once. */
    lastBoost: 0,
  };
}

/** What every part of the effects shares. */
export type Pools = ReturnType<typeof createPools>;

/** The ribbons' point count, link count and the largest gap between linked points. */
export function probeRibbons(fx: Pools): { points: number; maxGap: number; segments: number } {
  const { ribbonCount, ribbonHead, r } = fx;
  let points = 0;
  let segments = 0;
  let maxGap = 0;
  for (let ribbon = 0; ribbon < MAX_RIBBONS; ribbon++) {
    const count = ribbonCount[ribbon]!;
    const base = ribbon * RIBBON_POINTS;
    const head = ribbonHead[ribbon]!;
    points += count;
    for (let i = 1; i < count; i++) {
      const b = (base + ((head + i) % RIBBON_POINTS)) * R_STRIDE;
      if (r[b + R_LINK] === 0) continue;
      const a = (base + ((head + i - 1) % RIBBON_POINTS)) * R_STRIDE;
      segments++;
      maxGap = Math.max(maxGap, Math.hypot(r[b]! - r[a]!, r[b + 1]! - r[a + 1]!, r[b + 2]! - r[a + 2]!));
    }
  }
  return { points, maxGap, segments };
}

/** One tiny mesh per program, for the shader warm-up. */
export function proxiesOf(fx: Pools): THREE.Object3D[] {
  const { puffGeo, puffMat, debrisGeo, debrisMat, foamMat } = fx;
  // Programs are keyed on the instancing and the instance colour, so the
  // proxies carry both; their geometry is their own, because the warm-up
  // disposes what it is handed.
  const puffProxy = new THREE.InstancedMesh(puffGeo.clone(), puffMat, 1);
  puffProxy.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(3).fill(1), 3);
  const debrisProxy = new THREE.InstancedMesh(debrisGeo.clone(), debrisMat, 1);
  debrisProxy.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(3).fill(1), 3);
  const foamProxyGeo = new THREE.BufferGeometry();
  foamProxyGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1e-3, 0, 0, 0, 0, 1e-3]), 3));
  foamProxyGeo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0]), 3));
  foamProxyGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(9).fill(1), 3));
  return [puffProxy, debrisProxy, new THREE.Mesh(foamProxyGeo, foamMat)];
}

/** Releases the meshes, geometries and materials. */
export function disposePools(fx: Pools): void {
  const { group, puffs, debris, puffGeo, foamGeo, debrisGeo, puffMat, foamMat, debrisMat } = fx;
  group.removeFromParent();
  puffs.dispose();
  debris.dispose();
  for (const geometry of [puffGeo, foamGeo, debrisGeo]) geometry.dispose();
  // A material lets its program go and not its textures: each has a ramp of its own.
  for (const material of [puffMat, foamMat, debrisMat]) {
    material.gradientMap?.dispose();
    material.dispose();
  }
}
