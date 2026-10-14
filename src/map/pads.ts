import * as THREE from 'three';
import { SHEET_HEIGHT, latOfV, lonOfU, uOf, vOf } from '../map-tiles.ts';
import { latLonOf, unitAt } from '../sphere.ts';
import { PADS_FROM, PADS_REACH } from './constants.ts';
import type { MapSheet } from './sheet.ts';
import type { MapPad } from './types.ts';

const padCentre = new THREE.Vector3();
const padCorner = new THREE.Vector3();
const padLatLon = { lat: 0, lon: 0 };
const padsFound: MapPad[] = [];

/**
 * Asks for the pads under the screen, from its middle out to its furthest
 * corner, and says whether that found any the sheet did not have. Pads never
 * move, so what one ask found is kept and an ask only adds.
 */
export function askPads(s: MapSheet): boolean {
  const { options, RADIUS, padsOnSheet } = s;
  if (options.pads === undefined || s.S / 360 < PADS_FROM || s.width <= 1) return false;
  const view = `${s.cu.toFixed(5)}:${s.cv.toFixed(5)}:${Math.round(s.S)}:${s.width}:${s.height}`;
  if (view === s.padsAskedFor) return false;
  const halfU = s.width / 2 / s.S;
  const halfV = s.height / 2 / s.S;
  unitAt(latOfV(s.cv), lonOfU(s.cu), padCentre);
  let reach = 0;
  for (const du of [-halfU, halfU]) {
    for (const dv of [-halfV, halfV]) {
      const v = Math.min(SHEET_HEIGHT, Math.max(0, s.cv + dv));
      unitAt(latOfV(v), lonOfU(s.cu + du), padCorner);
      reach = Math.max(reach, padCentre.angleTo(padCorner) * RADIUS);
    }
  }
  padsFound.length = 0;
  if (options.pads(padCentre, Math.min(PADS_REACH, reach), padsFound)) s.padsAskedFor = view;
  let added = false;
  for (const pad of padsFound) {
    if (padsOnSheet.has(pad.id)) continue;
    latLonOf(pad.at, padLatLon);
    padsOnSheet.set(pad.id, { u: uOf(padLatLon.lon), v: vOf(padLatLon.lat) });
    added = true;
  }
  return added;
}
