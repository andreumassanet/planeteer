/** The highlight ribbon's geometry and material. */
import * as THREE from 'three';
import { onSphere } from '../globe.ts';
import { RIBBON_LIFT } from './constants.ts';
import type { MenuBody, MenuRegion } from './types.ts';

export function buildRibbon(body: MenuBody, region: MenuRegion): THREE.BufferGeometry {
  let segments = 0;
  for (const ring of region.rings) segments += ring.points.length;

  const position = new Float32Array(segments * 4 * 3);
  const across = new Float32Array(segments * 4 * 3);
  const side = new Float32Array(segments * 4);
  const index = new Uint32Array(segments * 6);

  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const along = new THREE.Vector3();
  const up = new THREE.Vector3();
  const wide = new THREE.Vector3();

  const seat = (lon: number, lat: number, height: number, target: THREE.Vector3): THREE.Vector3 => {
    onSphere(lon, lat, target);
    const lift = body.radius + height + body.relief(target.x, target.y, target.z) + RIBBON_LIFT;
    return target.multiplyScalar(lift);
  };

  let vertex = 0;
  let element = 0;
  for (const ring of region.rings) {
    const points = ring.points;
    for (let i = 0; i < points.length; i++) {
      const from = points[i]!;
      // The rings are open, so the closing segment has to be walked too.
      const to = points[(i + 1) % points.length]!;
      seat(from[0]!, from[1]!, ring.height, a);
      seat(to[0]!, to[1]!, ring.height, b);
      along.subVectors(b, a);
      const span = along.length();
      if (span < 1e-6) continue;
      along.divideScalar(span);
      up.copy(a).normalize();
      wide.crossVectors(along, up).normalize();

      for (let corner = 0; corner < 4; corner++) {
        const end = corner === 1 || corner === 2 ? b : a;
        const sign = corner === 0 || corner === 1 ? -1 : 1;
        position[vertex * 3] = end.x;
        position[vertex * 3 + 1] = end.y;
        position[vertex * 3 + 2] = end.z;
        across[vertex * 3] = wide.x;
        across[vertex * 3 + 1] = wide.y;
        across[vertex * 3 + 2] = wide.z;
        side[vertex] = sign;
        vertex++;
      }
      const base = vertex - 4;
      // (0, 2, 1) and (0, 3, 2): the obvious order faces the planet's centre.
      index[element++] = base;
      index[element++] = base + 2;
      index[element++] = base + 1;
      index[element++] = base;
      index[element++] = base + 3;
      index[element++] = base + 2;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(position.subarray(0, vertex * 3), 3));
  geometry.setAttribute('aAcross', new THREE.BufferAttribute(across.subarray(0, vertex * 3), 3));
  geometry.setAttribute('aSide', new THREE.BufferAttribute(side.subarray(0, vertex), 1));
  geometry.setIndex(new THREE.BufferAttribute(index.subarray(0, element), 1));
  return geometry;
}

/** Basic material (no normal and no ink, so `OutlineEffect` skips it); `FrontSide`, which the winding makes safe. */
export function ribbonMaterial(color: number, order: number): THREE.MeshBasicMaterial {
  const material = new THREE.MeshBasicMaterial({
    color,
    side: THREE.FrontSide,
    depthWrite: false,
    fog: false,
    toneMapped: false,
    transparent: true,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -8,
  });
  material.userData.outlineParameters = { visible: false };
  material.userData.order = order;
  material.onBeforeCompile = (shader) => {
    shader.uniforms['uWidth'] = { value: 40 };
    material.userData.uniforms = shader.uniforms;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 aAcross;\nattribute float aSide;\nuniform float uWidth;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed += aAcross * aSide * uWidth;');
  };
  return material;
}
