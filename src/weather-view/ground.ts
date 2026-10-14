/** The continentality texture the ground shader reads for the seasons. */
import * as THREE from 'three';
import { continentalityAt } from '../biome.ts';

/**
 * Bakes `continentalityAt` into a 1-degree texture for the ground shader's
 * seasons: 64,800 samples of a bilinear field, a few milliseconds, once.
 */
export function continentalTexture(): THREE.DataTexture {
  const width = 360;
  const height = 180;
  const data = new Uint8Array(width * height);
  for (let row = 0; row < height; row++) {
    const lat = -90 + row + 0.5;
    for (let col = 0; col < width; col++) {
      const lon = -180 + col + 0.5;
      data[row * width + col] = Math.round(continentalityAt(lat, lon) * 255);
    }
  }
  const texture = new THREE.DataTexture(data, width, height, THREE.RedFormat, THREE.UnsignedByteType);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.wrapS = THREE.RepeatWrapping;
  texture.needsUpdate = true;
  return texture;
}
