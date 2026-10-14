/** The handedness checks behind `atlasMenu.verify()`. */
import * as THREE from 'three';
import { LAND_HEIGHT, onSphere } from '../globe.ts';
import { DEG } from './constants.ts';
import type { MenuCtx } from './context.ts';
import { applyPose, globePose, orbitDistance } from './flight.ts';
import { regionUnder } from './picking.ts';
import { copyPose, makePose } from './poses.ts';
import { buildRibbon } from './ribbon.ts';

/**
 * Two third-party checks of the handedness. The globe: standing over Rome,
 * project five real coordinates to the screen, ray-cast each pixel back and ask
 * `geo.ts` what is there; east must be right and north up. The orrery: its Sun
 * against the one `sun.ts` lights the land by.
 */
export function verify(ctx: MenuCtx): Record<string, unknown> {
  const { camera, deps, orrery, pose, renderer, ribbons } = ctx;
  const resume = copyPose(pose, makePose());
  applyPose(ctx, globePose(ctx, 41.9, 12.5, orbitDistance(ctx.body.radius), makePose()));

  const box = renderer.domElement.getBoundingClientRect();
  const point = new THREE.Vector3();
  const probe = (name: string, lat: number, lon: number): { asked: string; x: number; y: number; reads: string } => {
    onSphere(lon, lat, point).multiplyScalar(ctx.body.radius + LAND_HEIGHT).add(ctx.body.centre).project(camera);
    const x = ((point.x + 1) / 2) * box.width;
    const y = ((1 - point.y) / 2) * box.height;
    const index = regionUnder(ctx, box.left + x, box.top + y);
    return { asked: name, x: Math.round(x), y: Math.round(y), reads: index > 0 ? ctx.body.regions[index - 1]!.name : 'open water' };
  };
  const west = probe('Madrid', 40.42, -3.7);
  const here = probe('Rome', 41.9, 12.5);
  const east = probe('Athens', 37.98, 23.73);
  const north = probe('Oslo', 59.91, 10.75);
  const south = probe('Tunis', 36.8, 10.18);

  // The ribbon's winding, measured off the built buffer after the shader's
  // own offset, since the four corners of a quad share two positions.
  let outward = Number.NaN;
  const first = ctx.body.regions.find((candidate) => candidate.rings.length > 0);
  if (first !== undefined) {
    const geometry = ribbons.get(first.key) ?? buildRibbon(ctx.body, first);
    ribbons.set(first.key, geometry);
    const p = geometry.getAttribute('position') as THREE.BufferAttribute;
    const a = geometry.getAttribute('aAcross') as THREE.BufferAttribute;
    const s = geometry.getAttribute('aSide') as THREE.BufferAttribute;
    const idx = geometry.getIndex()!;
    const corner = (at: number): THREE.Vector3 =>
      new THREE.Vector3().fromBufferAttribute(p, at).addScaledVector(new THREE.Vector3().fromBufferAttribute(a, at), s.getX(at));
    const v0 = corner(idx.getX(0));
    const v1 = corner(idx.getX(1));
    const v2 = corner(idx.getX(2));
    const normal = new THREE.Vector3().subVectors(v1, v0).cross(new THREE.Vector3().subVectors(v2, v0)).normalize();
    outward = normal.dot(v0.clone().normalize());
  }

  const lon = 12.5 * DEG;
  const lat = 41.9 * DEG;
  const trueEast = new THREE.Vector3(-Math.sin(lon), 0, -Math.cos(lon));
  const trueNorth = new THREE.Vector3(-Math.sin(lat) * Math.cos(lon), Math.cos(lat), Math.sin(lat) * Math.sin(lon));
  const screenRight = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
  const screenUp = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);

  applyPose(ctx, resume);
  const sun = deps.sunDirection?.();
  return {
    'screen right . east': Number(screenRight.dot(trueEast).toFixed(4)),
    'screen up . north': Number(screenUp.dot(trueNorth).toFixed(4)),
    'ribbon normal . up': Number(outward.toFixed(4)),
    'east is right': east.x > here.x && here.x > west.x,
    'north is up': north.y < south.y,
    probes: [west, here, east, north, south],
    orrery: sun === undefined ? 'no sun to compare with' : orrery.verify(sun),
  };
}
