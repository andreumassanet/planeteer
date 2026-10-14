/**
 * The cloud deck: one inked shell of puffs over the whole planet.
 *
 * The field (`coverageAt`) is the weather's cover: `weather.ts` reads it
 * through `deckTurn` at the same instant, so it rains only under a drawn bank.
 * The deck is a rigid turn of the field, a pure function of the clock, so every
 * client sees the same sky. Puffs are seeded on an icosphere lattice where the
 * field passes `THRESHOLD`, stacked in up to three tiers, and drawn as
 * instanced meshes in chunks at three levels of detail.
 *
 * Files: `field.ts` the constants and the field, `planning.ts` the seeding,
 * `material.ts` the shader, `chunks.ts` the meshes, `bake.ts` the shade map.
 */
import * as THREE from 'three';
import { PLANET_RADIUS } from './globe.ts';
import { sunUniform } from './sun.ts';
import { cloudShade, setCloudMap, updateCloudShade } from './cloud-shade.ts';
import { CLOUD_BASE, DEPTH_SPAN, EDGE_FAR, EDGE_NEAR, FLAT_MAX, MID_RANGE, NEAR_RANGE, SPLIT_RANGE, THRESHOLD, deckTurn, flattenAt, squashAt } from './clouds/field.ts';
import type { CloudStats, Clouds } from './clouds/types.ts';
import { hazeAt } from './clouds/geometry.ts';
import type { Cap } from './clouds/geometry.ts';
import { BAKE_MS, cloudShadeAt, createCloudBake } from './clouds/bake.ts';
import type { CloudShadeSample } from './clouds/bake.ts';
import { createCloudMaterial } from './clouds/material.ts';
import { buildBases, createShapes } from './clouds/chunks.ts';
import { planPuffs, sampleDeck } from './clouds/planning.ts';

export { CLOUD_BASE, DECK_AXIS, DEPTH_SPAN, THRESHOLD, coverageAt, deckTurn } from './clouds/field.ts';
export { CLOUD_ORDER } from './clouds/types.ts';
export type { CloudStats, Clouds } from './clouds/types.ts';
export { bakeCloudMap, cloudShadeAt, createCloudBake } from './clouds/bake.ts';
export type { CloudBake, CloudShadeSample } from './clouds/bake.ts';

export function createClouds(): Clouds {
  const began = performance.now();
  const deck = sampleDeck();
  const { fine, coarse, mirrored } = planPuffs(deck);
  const puffs = fine.chunk.length;
  let bottom = 0;
  for (const tier of fine.tier) if (tier === 0) bottom++;
  const { material, uniforms } = createCloudMaterial();
  const { haze, flatten, orbitDim, squash, grey, edgeSoft } = uniforms;
  const group = new THREE.Group();
  group.name = 'clouds';
  const shapes = createShapes();
  const { nearTriangles, midTriangles, farTriangles } = shapes;
  const { bases, bytes } = buildBases(fine, coarse, shapes, material, group);

  if (mirrored > 0) {
    console.warn(`clouds: ${mirrored} puffs came out with a mirrored matrix`);
  }

  const stats: CloudStats = {
    cells: deck.cells,
    cover: Number((deck.cells / deck.faceCount).toFixed(3)),
    puffs,
    bottom,
    farPuffs: coarse.chunk.length,
    triangles: puffs * nearTriangles,
    farTriangles: coarse.chunk.length * farTriangles,
    drawn: 0,
    chunks: group.children.length,
    shown: 0,
    megabytes: Number((bytes / 1048576).toFixed(1)),
    buildMs: Math.round(performance.now() - began),
    mirrored,
  };

  const turn = new THREE.Quaternion();
  const eye = new THREE.Vector3();
  /** The shade's map, a slice a frame (`BAKE_MS`), the veil it follows and the instant it was last turned to. */
  const bake = createCloudBake();
  let veil = 1;
  let turnedAt = 0;

  /**
   * How far the eye is from the nearest point of a cap, and whether any of it
   * can be over the planet's horizon. The planet is the occluder, so the far
   * side of the world costs nothing from the ceiling and the deck past the
   * horizon nothing from the ground.
   */
  let eyeLength = 0;
  let eyeHorizon = 0;
  const angleTo = (cap: Cap): number =>
    Math.acos(Math.max(-1, Math.min(1, cap.direction.dot(eye) / eyeLength)));
  const distanceTo = (cap: Cap): number => {
    const off = Math.max(0, angleTo(cap) - cap.angle);
    const r = Math.max(cap.low, Math.min(cap.high, eyeLength));
    return Math.sqrt(Math.max(0, eyeLength * eyeLength + r * r - 2 * eyeLength * r * Math.cos(off)));
  };
  const overHorizon = (cap: Cap): boolean =>
    angleTo(cap) - cap.angle <= eyeHorizon + Math.acos(Math.min(1, PLANET_RADIUS / cap.high));

  const place = (cameraPosition: THREE.Vector3): void => {
    // The eye in the deck's own frame, where every cap was measured.
    eye.copy(cameraPosition).applyQuaternion(turn.copy(group.quaternion).invert());
    eyeLength = Math.max(1, eye.length());
    eyeHorizon = Math.acos(Math.min(1, PLANET_RADIUS / Math.max(PLANET_RADIUS + 1, eyeLength)));
    let drawn = 0;
    let shown = 0;
    for (const base of bases) {
      const split = base.cap !== null && distanceTo(base.cap) < SPLIT_RANGE;
      if (!split) {
        if (base.split) {
          for (const sub of base.subs) sub.mesh.visible = false;
          base.split = false;
        }
        if (base.far !== null) {
          base.far.visible = overHorizon(base.farCap!);
          if (base.far.visible) {
            drawn += base.far.count * farTriangles;
            shown++;
          }
        }
        continue;
      }
      base.split = true;
      if (base.far !== null) base.far.visible = false;
      for (const sub of base.subs) {
        const seen = overHorizon(sub.cap);
        sub.mesh.visible = seen;
        if (!seen) continue;
        const range = distanceTo(sub.cap);
        const level = range < NEAR_RANGE ? 0 : range < MID_RANGE ? 1 : 2;
        sub.mesh.geometry = sub.levels[level];
        drawn += sub.mesh.count * (level === 0 ? nearTriangles : level === 1 ? midTriangles : farTriangles);
        shown++;
      }
    }
    stats.drawn = drawn;
    stats.shown = shown;
  };

  return {
    group,
    stats,
    setGrey(value: number): void {
      grey.value = Math.max(0, Math.min(1, value));
    },
    get shadows(): number {
      return cloudShade.shadows;
    },
    set shadows(value: number) {
      cloudShade.shadows = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 1;
    },
    get shade() {
      return {
        ready: cloudShade.ready,
        rows: bake.rows,
        bakeMs: Math.round(bake.ms),
        strength: Number(cloudShade.strength.toFixed(3)),
        share: Number(cloudShade.share.toFixed(3)),
        weather: cloudShade.weather,
      };
    },
    shadeAt(point: THREE.Vector3): CloudShadeSample {
      return cloudShadeAt(point, sunUniform.value, turnedAt);
    },
    setVeil(opacity: number): void {
      // The shade goes with the deck it is the shadow of (`updateCloudShade`).
      veil = opacity;
      group.visible = opacity > 0.01;
      const veiled = opacity < 0.999;
      if (veiled !== material.transparent) {
        material.transparent = veiled;
        // A veil blends, so its soft edge is the alpha itself and not the
        // coverage; one side, because a see-through deck drawn double-sided
        // shows its own bellies through its own crowns. It keeps writing
        // depth, so a puff behind another is not blended over it.
        material.alphaToCoverage = !veiled;
        material.side = veiled ? THREE.FrontSide : THREE.DoubleSide;
        material.needsUpdate = true;
      }
      material.opacity = veiled ? Math.max(0, opacity) : 1;
    },
    update(time: Date, cameraPosition: THREE.Vector3, fog: THREE.Fog): void {
      // An absolute angle, not an increment: the deck is then a pure function
      // of the clock, so `atlas.sky.setTime` scrubs the weather with the sun
      // and `setRate(600)` runs a front past you in seconds.
      deckTurn(time.getTime(), group.quaternion);
      turnedAt = time.getTime();
      // The shade: its map a slice at a time until it is whole, then the same
      // turn undone for the shaders, and the sun `sky.update` has just set.
      if (!bake.done && bake.step(BAKE_MS)) {
        setCloudMap(bake.data, { planet: PLANET_RADIUS, base: CLOUD_BASE, threshold: THRESHOLD, depthSpan: DEPTH_SPAN });
      }
      cloudShade.rows = bake.rows;
      cloudShade.bakeMs = bake.ms;
      updateCloudShade(group.quaternion, sunUniform.value, cameraPosition, veil);
      const altitude = cameraPosition.length() - PLANET_RADIUS;
      hazeAt(altitude, fog, haze);
      flatten.value = flattenAt(altitude);
      orbitDim.value = flatten.value / FLAT_MAX;
      edgeSoft.value = EDGE_NEAR + (EDGE_FAR - EDGE_NEAR) * orbitDim.value;
      squash.value = squashAt(altitude);
      place(cameraPosition);
    },
  };
}
