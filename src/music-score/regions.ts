/** Which style plays where: the towns' regions, split by country where a tradition differs. */
import { regionFor } from '../scenery/regions.ts';
import type { RegionId } from '../scenery/regions.ts';
import type { StyleId } from './style-types.ts';

/** The countries a region splits off by ear, which its towns do not. */
const IBERIA = new Set(['ESP', 'PRT', 'AND', 'GIB']);
const ANDES = new Set(['PER', 'BOL', 'ECU']);

/** A country's style: its town region, split where the ear splits it. */
export function styleForCountry(iso: string, continent: string, lat: number): StyleId {
  const region = regionFor(iso, continent, lat).id as RegionId;
  switch (region) {
    case 'nordic': return 'nordic';
    case 'atlantic-europe': return 'atlantic-folk';
    case 'east-europe': return 'east-europe';
    case 'mediterranean': return IBERIA.has(iso) ? 'iberia' : 'mediterranean';
    case 'maghreb': return 'maghreb';
    case 'middle-east': return 'middle-east';
    case 'sub-saharan': return 'sub-saharan';
    case 'south-asia': return 'south-asia';
    case 'east-asia': return iso === 'JPN' ? 'japan' : 'east-asia';
    case 'southeast-asia': return 'southeast-asia';
    case 'north-america': return 'north-america';
    case 'latin-america': return iso === 'BRA' ? 'brazil' : ANDES.has(iso) ? 'andes' : 'latin';
    case 'oceania': return 'oceania';
    case 'polar': return 'polar';
  }
  return 'atlantic-folk';
}

/**
 * Land with no country under it — a sliver the outlines missed — by latitude
 * and longitude alone. Coarse on purpose: it only has to be the right
 * continent.
 */
export function styleByLatLon(lat: number, lon: number): StyleId {
  if (Math.abs(lat) >= 66.5) return 'polar';
  if (lon < -30) return lat > 15 ? 'north-america' : lat > -20 && lon < -60 ? 'andes' : 'latin';
  if (lon < 60) {
    if (lat > 35) return lon < 20 ? 'atlantic-folk' : 'east-europe';
    if (lat > 12) return lon > 35 ? 'middle-east' : 'maghreb';
    return 'sub-saharan';
  }
  if (lon < 150) {
    if (lat > 30) return lon < 90 ? 'middle-east' : 'east-asia';
    if (lat > 5) return lon < 92 ? 'south-asia' : 'southeast-asia';
    return lat < -10 && lon > 110 ? 'oceania' : 'southeast-asia';
  }
  return 'oceania';
}

/** What decides the style. `iso` is empty over water. */
export interface Whereabouts {
  mode: 'menu' | 'foot' | 'swim' | 'car' | 'boat' | 'plane' | 'balloon';
  /** Whether the craft is high enough to have left the ground's music behind; the engine keeps the hysteresis. */
  aloft: boolean;
  iso: string;
  continent: string;
  lat: number;
  lon: number;
}

/** The style for a moment, or `null` for none (the menu). */
export function styleAt(where: Whereabouts): StyleId | null {
  if (where.mode === 'menu') return null;
  if (where.aloft && (where.mode === 'plane' || where.mode === 'balloon')) return 'sky';
  if (where.mode === 'boat') return 'sea';
  if (where.iso === '') return where.mode === 'swim' ? 'sea' : styleByLatLon(where.lat, where.lon);
  return styleForCountry(where.iso, where.continent, where.lat);
}
