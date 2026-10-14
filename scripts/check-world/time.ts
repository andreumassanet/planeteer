import { at, check } from './harness.ts';
import type { WorldContext } from './context.ts';
import { PLANET_RADIUS } from '../../src/globe.ts';
import { indexPlaces } from '../../src/places.ts';
import { allZoneNames, clockAt, zoneFor } from '../../src/timezone.ts';

/**
 * The clock, against the platform's own time zone data.
 *
 * `timezone.ts` ships names and no rules — `Intl` carries the offsets, the
 * daylight saving transitions and the updates to both — so the only two things
 * that can be wrong here are a name that does not resolve and a country that
 * has none. Both are silent: an unresolvable zone falls back to solar time and
 * looks merely odd, and a missing country looks like nothing at all until
 * someone stands in it.
 *
 * The city rows compare our answer to the real zone's, so a boundary meridian
 * moved by a careless edit fails rather than quietly putting Denver on Chicago
 * time.
 */
export function checkTime(ctx: WorldContext): void {
  const { world, placesRaw } = ctx;
  console.log('\ntime');
  let unresolvable = 0;
  const badZones: string[] = [];
  for (const zone of allZoneNames()) {
    try {
      new Intl.DateTimeFormat('en-GB', { timeZone: zone });
    } catch {
      unresolvable++;
      if (badZones.length < 5) badZones.push(zone);
    }
  }
  check(unresolvable === 0, `all ${allZoneNames().length} zone names resolve`, badZones.join(', '));

  const zoneless = world.countries.filter((c) => zoneFor(c.iso, c.lon, c.lat) === null);
  check(
    zoneless.length === 0,
    `all ${world.countries.length} countries have a zone`,
    zoneless.slice(0, 6).map((c) => `${c.iso} ${c.name}`).join(', '),
  );

  const cities: [string, string, number, number, string][] = [
    ['Palma', 'ESP', 39.57, 2.65, 'Europe/Madrid'],
    ['Las Palmas', 'ESP', 28.1, -15.4, 'Atlantic/Canary'],
    ['New York', 'USA', 40.7, -74.0, 'America/New_York'],
    ['Chicago', 'USA', 41.9, -87.6, 'America/Chicago'],
    ['Denver', 'USA', 39.7, -105.0, 'America/Denver'],
    ['Los Angeles', 'USA', 34.1, -118.2, 'America/Los_Angeles'],
    ['Anchorage', 'USA', 61.2, -149.9, 'America/Anchorage'],
    ['Honolulu', 'USA', 21.3, -157.9, 'Pacific/Honolulu'],
    ['Vancouver', 'CAN', 49.3, -123.1, 'America/Vancouver'],
    ['St Johns', 'CAN', 47.6, -52.7, 'America/St_Johns'],
    ['Moscow', 'RUS', 55.8, 37.6, 'Europe/Moscow'],
    ['Novosibirsk', 'RUS', 55.0, 82.9, 'Asia/Krasnoyarsk'],
    ['Vladivostok', 'RUS', 43.1, 131.9, 'Asia/Vladivostok'],
    ['Sao Paulo', 'BRA', -23.5, -46.6, 'America/Sao_Paulo'],
    ['Manaus', 'BRA', -3.1, -60.0, 'America/Manaus'],
    ['Sydney', 'AUS', -33.9, 151.2, 'Australia/Sydney'],
    ['Brisbane', 'AUS', -27.5, 153.0, 'Australia/Brisbane'],
    ['Perth', 'AUS', -31.9, 115.9, 'Australia/Perth'],
    ['Darwin', 'AUS', -12.5, 130.8, 'Australia/Darwin'],
    ['Mexico City', 'MEX', 19.4, -99.1, 'America/Mexico_City'],
    ['Tokyo', 'JPN', 35.7, 139.7, 'Asia/Tokyo'],
    ['Santiago', 'CHL', -33.4, -70.7, 'America/Santiago'],
  ];
  /**
   * Read at three instants, not one. A zone can agree with the wrong one for
   * half the year — Phoenix is Los Angeles all summer and Denver all winter —
   * so a single `now` passes a wrong answer whenever the calendar is kind to
   * it. Mid-January, mid-July and today catch every pair that differs in
   * either season.
   */
  const year = new Date().getUTCFullYear();
  const instants = [new Date(Date.UTC(year, 0, 15, 12)), new Date(Date.UTC(year, 6, 15, 12)), new Date()];
  const real = (zone: string, when: Date): string =>
    new Intl.DateTimeFormat('en-GB', { timeZone: zone, hour: '2-digit', minute: '2-digit', hour12: false }).format(when);
  const readAll = (
    list: readonly [string, string, number, number, string][],
    ours: (iso: string, lat: number, lon: number, when: Date) => string,
  ): string[] => {
    const wrong: string[] = [];
    for (const [name, iso, lat, lon, want] of list) {
      const when = instants.find((instant) => ours(iso, lat, lon, instant) !== real(want, instant));
      if (when !== undefined) wrong.push(`${name} ${ours(iso, lat, lon, when)} not ${real(want, when)}`);
    }
    return wrong;
  };
  const tableWrong = readAll(cities, (iso, lat, lon, when) => clockAt(when, iso, lon, lat));
  check(
    tableWrong.length === 0,
    `all ${cities.length} cities read their real local time from the meridians`,
    tableWrong.slice(0, 5).join(', '),
  );

  /**
   * The chip reads the nearest built town's zone, and these are the places
   * the meridians alone got wrong — each one a zone boundary that is a province
   * line rather than a longitude. It is asked the way `main.ts` asks it: the
   * country `countryAt` reports, and the town `nearest` returns.
   */
  const townIndex = indexPlaces(placesRaw, PLANET_RADIUS);
  const boundaries: [string, string, number, number, string][] = [
    ['Calgary', 'CAN', 51.05, -114.07, 'America/Edmonton'],
    ['Kazan', 'RUS', 55.79, 49.12, 'Europe/Moscow'],
    ['Nizhny Novgorod', 'RUS', 56.33, 44.0, 'Europe/Moscow'],
    ['Volgograd', 'RUS', 48.71, 44.51, 'Europe/Moscow'],
    ['Arkhangelsk', 'RUS', 64.54, 40.54, 'Europe/Moscow'],
    ['Izhevsk', 'RUS', 56.85, 53.2, 'Europe/Samara'],
    ['Yakutsk', 'RUS', 62.03, 129.73, 'Asia/Yakutsk'],
    ['Blagoveshchensk', 'RUS', 50.27, 127.53, 'Asia/Yakutsk'],
    ['Anadyr', 'RUS', 64.748, 177.477, 'Asia/Anadyr'],
    ['Bilibino', 'RUS', 68.055, 166.437, 'Asia/Anadyr'],
    ['Indianapolis', 'USA', 39.77, -86.16, 'America/Indiana/Indianapolis'],
    ['Louisville', 'USA', 38.25, -85.76, 'America/Kentucky/Louisville'],
    ['Boise', 'USA', 43.61, -116.2, 'America/Boise'],
    ['Phoenix', 'USA', 33.45, -112.07, 'America/Phoenix'],
    ['Palikir', 'FSM', 6.92, 158.16, 'Pacific/Pohnpei'],
    ['Kananga', 'COD', -5.9, 22.42, 'Africa/Lubumbashi'],
    ['Mbuji-Mayi', 'COD', -6.13, 23.6, 'Africa/Lubumbashi'],
    ['Cuiabá', 'BRA', -15.6, -56.1, 'America/Cuiaba'],
    ['Campo Grande', 'BRA', -20.44, -54.65, 'America/Campo_Grande'],
    ['Hermosillo', 'MEX', 29.07, -110.96, 'America/Hermosillo'],
    ['La Paz', 'MEX', 24.14, -110.31, 'America/Mazatlan'],
    ['Chihuahua', 'MEX', 28.63, -106.09, 'America/Chihuahua'],
  ];
  const nearestWrong: string[] = [];
  for (const [name, iso, lat, lon] of boundaries) {
    const id = world.countryAt(lat, lon);
    const ground = id > 0 ? world.countries[id - 1]!.iso : '';
    if (ground !== iso) nearestWrong.push(`${name} stands in ${ground || 'the sea'}, not ${iso}`);
  }
  nearestWrong.push(...readAll(boundaries, (iso, lat, lon, when) =>
    clockAt(when, iso, lon, lat, townIndex.nearest(at(lat, lon)).place)));
  check(
    nearestWrong.length === 0,
    `all ${boundaries.length} cities on a zone boundary read their nearest town's time`,
    nearestWrong.slice(0, 5).join(', '),
  );
  // And the meridians are the fallback across a border, so they are held to
  // the same cities and to the two ends of the antimeridian: Chukotka east of
  // it read Kaliningrad's time, and the far Aleutians west of it New York's.
  const fallbackWrong = readAll(
    [...boundaries, ['Chukotka', 'RUS', 66.0, -172.0, 'Asia/Anadyr'], ['Attu', 'USA', 52.9, 173.2, 'America/Adak']],
    (iso, lat, lon, when) => clockAt(when, iso, lon, lat),
  );
  check(
    fallbackWrong.length === 0,
    `and the meridians alone read all ${boundaries.length + 2} of them`,
    fallbackWrong.slice(0, 5).join(', '),
  );

  // Every zone the bake shipped has to be one the platform knows, or the chip
  // falls through to the meridians without anybody noticing.
  const shippedZones = [...new Set(placesRaw.map((place) => place.zone))];
  const unknown = shippedZones.filter((zone) => {
    try {
      new Intl.DateTimeFormat('en-GB', { timeZone: zone });
      return false;
    } catch {
      return true;
    }
  });
  check(
    unknown.length === 0 && placesRaw.every((place) => place.zone !== ''),
    `all ${shippedZones.length} zones the places carry resolve`,
    unknown.slice(0, 5).join(', '),
  );
}
