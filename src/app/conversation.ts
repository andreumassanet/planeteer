/**
 * Talking to townsfolk: what a conversation is told about where it happens,
 * and keeping it going while the speaker is near.
 */
import * as THREE from 'three';
import { toLatLon } from '../geo.ts';
import { PLANET_RADIUS } from '../globe.ts';
import { AVATAR_HEIGHT } from '../avatar.ts';
import { clockAt } from '../timezone.ts';
import { shoreDistance } from '../terrain.ts';
import { latOf, lonOf, unitAt } from '../sphere.ts';
import type { Where } from '../talk.ts';
import type { App } from './context.ts';

/** How near, centre to centre, someone must be to be talked to: about two metres. */
export const TALK_REACH = AVATAR_HEIGHT * 1.3;
/** How far you can walk off before they stop talking. */
const TALK_LEAVE = AVATAR_HEIGHT * 4;
/** How near the water, in degrees of `shoreDistance`, a town counts as coastal (about 13 km). */
const TALK_COAST = 0.12;
/** The vehicles a townsperson points out. */
const TALK_CRAFT = ['plane', 'balloon', 'boat'] as const;
/** How near one must stand to be pointed out, units: about 630 m, far enough to reach a big city's airstrip. */
const TALK_CRAFT_REACH = 800;

export interface Conversation {
  /** Who `E` would talk to this frame, decided with the prompt. */
  offer: string | null;
  start(key: string): void;
  /** Ends the conversation when the speaker is gone or out of reach, else holds them facing you. */
  update(): void;
}

export function createConversation(app: App): Conversation {
  const { talk, townsfolk, player, world, places, placements, fleetSites, fleet, sky, bearingTo, EARTH_KM } = app;
  let engaged = false;
  const crown = new THREE.Vector3();
  const landmarkAt = new THREE.Vector3();
  const north = new THREE.Vector3(0, 1, 0);
  const here = new THREE.Vector3();
  const sites: ReturnType<typeof fleetSites.near> = [];

  /** The nearest standing vehicle of each kind worth pointing at, by bearing. */
  function craftNear(): Where['craft'][number][] {
    const craft: Where['craft'][number][] = [];
    sites.length = 0;
    fleetSites.near(here.copy(player.position).normalize(), TALK_CRAFT_REACH, sites);
    for (const kind of TALK_CRAFT) {
      let best: (typeof sites)[number] | null = null;
      let bestAngle = TALK_CRAFT_REACH / PLANET_RADIUS;
      for (const site of sites) {
        if (site.kind !== kind || fleet.claimsParked(site.id)) continue;
        const angle = site.at.angleTo(here);
        if (angle < bestAngle) [best, bestAngle] = [site, angle];
      }
      if (best !== null) {
        craft.push({ kind, bearing: bearingTo(player.position, north, latOf(best.at.y), lonOf(best.at.x, best.at.z)) ?? 0 });
      }
    }
    return craft;
  }

  function start(key: string): void {
    const at = toLatLon(player.position);
    const index = world.countryAtPoint(player.position);
    const country = index > 0 ? world.countries[index - 1]! : null;
    const nearby = places.nearest(player.position);
    const hour = Number.parseInt(clockAt(sky.state.time, country?.iso ?? '', at.lon, at.lat, nearby.place), 10);
    let landmark: Where['landmark'] = null;
    let nearest = Infinity;
    for (const placement of placements) {
      const angle = unitAt(placement.lat, placement.lon, landmarkAt).angleTo(player.position);
      if (angle >= nearest) continue;
      nearest = angle;
      landmark = { name: placement.name, km: angle * EARTH_KM, bearing: bearingTo(player.position, north, placement.lat, placement.lon) ?? 0 };
    }
    const craft = craftNear();
    const biome = app.biomeHere;
    talk.start(key, {
      iso: country?.iso ?? '',
      countryName: country?.name ?? '',
      town: nearby.place.name,
      population: nearby.place.pop,
      capital: nearby.place.capital === true,
      coastal: shoreDistance(at.lat, at.lon) < TALK_COAST,
      warmth: biome.warmth,
      biome: biome.id,
      elevation: biome.elevation,
      hour: Number.isFinite(hour) ? hour : 12,
      landmark,
      craft,
      young: app.isYoung(key),
      woman: app.isWoman(key),
    });
    engaged = townsfolk.engage(key, player.position);
    // The traveller turns to face them too, except from a bench, whose seat faces one way.
    if (!player.sitting && townsfolk.crownOf(key, crown)) {
      crown.sub(player.position).projectOnPlane(player.up);
      if (crown.lengthSq() > 1e-4) player.forward.copy(crown.normalize());
    }
    app.sound.audio.cue('ui-open');
  }

  function update(): void {
    const speaker = talk.with;
    if (speaker === null) {
      if (engaged) townsfolk.engage(null);
      engaged = false;
      return;
    }
    if (player.mode !== 'foot' || !townsfolk.crownOf(speaker, crown) || crown.distanceTo(player.position) > TALK_LEAVE) {
      talk.close();
      townsfolk.engage(null);
      engaged = false;
      return;
    }
    engaged = townsfolk.engage(speaker, player.position);
    talk.place(crown, app.rig.camera, innerWidth, innerHeight);
  }

  return { offer: null, start, update };
}
