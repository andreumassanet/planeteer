/** Painting a planet's faces from its ground, and the flat region map a held globe is tinted by. */
import * as THREE from 'three';
import { latOf, lonOf } from '../sphere.ts';
import type { Body, GroundSample } from '../system/index.ts';
import { fbm } from '../terrain.ts';
import { PALETTE } from '../theme.ts';
import { DEG, TINT_HEIGHT, TINT_WIDTH } from './constants.ts';
import type { HeldRegion } from './types.ts';

/** A stable hash of an integer to [0, 1), for the per-face mosaic. */
function hash01(n: number): number {
  let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Colours every face of a sphere from what the body says its ground is: its `GroundModel` where it has one, else bands of its own look warped by noise. Every face then takes the land's mosaic, a few per cent either way. */
export function paint(body: Body, geometry: THREE.BufferGeometry): void {
  const position = geometry.getAttribute('position') as THREE.BufferAttribute;
  const colors = new Float32Array(position.count * 3);
  const sample: GroundSample = { id: '', warmth: 0, second: 0, elevation: 0 };
  const color = new THREE.Color();
  const look = body.look;
  const ground = body.ground;
  for (let v = 0; v < position.count; v += 3) {
    let cx = 0;
    let cy = 0;
    let cz = 0;
    for (let k = 0; k < 3; k++) {
      cx += position.getX(v + k);
      cy += position.getY(v + k);
      cz += position.getZ(v + k);
    }
    const length = Math.hypot(cx, cy, cz) || 1;
    cx /= length;
    cy /= length;
    cz /= length;
    // The world's own convention, so a body's lat/lon mean what its file says.
    const lat = latOf(cy);
    const lon = lonOf(cx, cz);

    if (ground !== null) {
      const elevation = ground.relief(lat, lon);
      const found = ground.at(lat, lon, elevation, sample);
      color.setHex(ground.biomes[found.id]?.color ?? look.surface);
    } else {
      const warp = fbm(cx * 3.1 + 1.7, cy * 3.1 - 4.1, cz * 3.1 + 2.9, 3);
      const wave = Math.sin(lat * DEG * 9 + (warp - 0.5) * 2.6);
      color.setHex(wave > 0.45 ? look.highland : wave < -0.5 ? look.lowland : look.surface);
      // The Great Red Spot, where Jupiter's own file says it is not — it has no
      // ground model to say so — so at the latitude every photograph puts it.
      if (body.id === 'jupiter') {
        const dLon = (((lon + 40 + 540) % 360) - 180) / 13;
        const dLat = (lat + 22) / 6.5;
        if (dLon * dLon + dLat * dLat < 1) color.setHex(PALETTE.clay);
      }
    }
    color.multiplyScalar(0.95 + hash01(v) * 0.09);
    for (let k = 0; k < 3; k++) {
      colors[(v + k) * 3] = color.r;
      colors[(v + k) * 3 + 1] = color.g;
      colors[(v + k) * 3 + 2] = color.b;
    }
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

/** The regions painted flat on an equirectangular canvas, each filled and stroked a texel wide in its colour so two rings of one region meet without a hairline between them. */
export function tintTexture(regions: readonly HeldRegion[]): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = TINT_WIDTH;
  canvas.height = TINT_HEIGHT;
  const ctx = canvas.getContext('2d')!;
  ctx.lineJoin = 'round';
  ctx.lineWidth = 1.5;
  for (const region of regions) {
    const fill = `#${region.color.toString(16).padStart(6, '0')}`;
    ctx.fillStyle = fill;
    ctx.strokeStyle = fill;
    for (const ring of region.rings) {
      if (ring.length < 3) continue;
      ctx.beginPath();
      ring.forEach((point, k) => {
        const x = ((point[0]! + 180) / 360) * TINT_WIDTH;
        const y = ((90 - point[1]!) / 180) * TINT_HEIGHT;
        if (k === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  // No mipmaps: the longitude wraps inside a pixel at the antimeridian, and a
  // mip chosen off that jump is a seam of the smallest level down the globe.
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}
