/** A town's fields: its plane's strip first, then a balloon, a helicopter pad and the farm animals' and tractors' fields. */
import { rngFrom } from '../scenery/random.ts';
import { FLEET_MODELS } from './models.ts';
import type { FieldSearch } from './site-fields.ts';
import type { Planes } from './site-planes.ts';
import {
  BALLOON_FIELD,
  BALLOON_GRADE,
  HELI_GRADE,
  HELI_POP,
  HORSE_BIOMES,
  HORSE_GRADE,
  HORSE_POP,
  HORSE_SECOND,
  SITE_ROOM,
  TRACTOR_BIOMES,
  TRACTOR_GRADE,
  TRACTOR_POP,
  keepsBalloon,
} from './site-rules.ts';
import type { FleetSite } from './site-types.ts';
import type { SiteWorld } from './site-world.ts';

const NONE: readonly FleetSite[] = [];

export function createTownFields(w: SiteWorld, search: FieldSearch, planes: Planes) {
  const { places, shown, biomeOf } = w;
  const { fieldSite } = search;
  const { planeOf } = planes;
  const fieldsPer: (readonly FleetSite[] | undefined)[] = new Array(places.length);

  /**
   * A town's plane and balloon, kept apart from its cars and launches because
   * the wood asks for these alone and the launches' search for water is the
   * dear half. Nothing in a field search reads a car or a launch, so the two
   * halves can be worked out in either order and come out the same.
   */
  function fieldsOf(p: number): readonly FleetSite[] {
    const known = fieldsPer[p];
    if (known !== undefined) return known;
    if (!shown[p]) return (fieldsPer[p] = NONE);
    const out: FleetSite[] = [];
    const place = places[p]!;
    planeOf(p, out);
    if (keepsBalloon(p)) fieldSite(p, FLEET_MODELS.balloon, BALLOON_FIELD, BALLOON_GRADE, 'fleet-balloon-site', out);
    // The rest of the fields, after those two so neither moves for them.
    if (place.pop >= HELI_POP) fieldSite(p, FLEET_MODELS.helicopter, SITE_ROOM.helicopter, HELI_GRADE, 'fleet-heli-site', out);
    if (place.pop < HORSE_POP || place.pop < TRACTOR_POP) {
      const biome = biomeOf(p);
      const rng = rngFrom('fleet-farm', p);
      if (place.pop < HORSE_POP && rng.chance(HORSE_BIOMES[biome] ?? 0)) {
        fieldSite(p, FLEET_MODELS.horse, SITE_ROOM.horse, HORSE_GRADE, 'fleet-horse-site', out);
        if (rng.chance(HORSE_SECOND)) fieldSite(p, FLEET_MODELS.horse, SITE_ROOM.horse, HORSE_GRADE, 'fleet-horse-second', out, 1);
      }
      if (place.pop < TRACTOR_POP && rng.chance(TRACTOR_BIOMES[biome] ?? 0)) fieldSite(p, FLEET_MODELS.tractor, SITE_ROOM.tractor, TRACTOR_GRADE, 'fleet-tractor-site', out);
    }
    fieldsPer[p] = out.length === 0 ? NONE : out;
    return fieldsPer[p]!;
  }

  return { fieldsOf, fieldsPer, NONE };
}
