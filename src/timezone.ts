/**
 * What time it is where you are standing.
 *
 * **The honest options were two and this file takes the harder one.** Local
 * *solar* time is free — the longitude divided by fifteen — needs no data at
 * all, and agrees exactly with the sky, which is already showing the real sun.
 * It is also not what anybody means by "what time is it in Mallorca": Spain
 * keeps Central European time at a longitude that is barely east of Greenwich,
 * so a solar clock there reads nearly two hours behind every watch on the
 * island. A clock that disagrees with the player's own wrist is a bug however
 * defensible its arithmetic.
 *
 * So it is civil time, and the way to get civil time right without shipping a
 * database is to ship the *names* and let the platform do the rest.
 * `Intl.DateTimeFormat` carries the full IANA rules — the offsets, the daylight
 * saving transitions, the historical changes, and updates to all three — in
 * every browser and in Node. What this file holds is a table of country to zone
 * name, which is a few hundred short strings of code, not an external asset,
 * and no timezone logic whatsoever.
 *
 * The fallback is deliberate rather than an error path, the way `CLAUDE.md`
 * asks weather to be: where there is no zone for a place, or the platform
 * cannot resolve one, the clock falls back to **local mean solar time from the
 * longitude**. That is never absent, never wrong about the sky, and at worst an
 * hour or two from the civil answer.
 */

/**
 * Country to IANA zone.
 *
 * One entry per country in `countries.bin`, keyed on the same `ADM0_A3` the
 * flags and the outlines use. The countries wide enough to hold several zones
 * are not in here — they are in `zoneFor` below, because a longitude decides
 * them and a table cannot.
 *
 * Seven of the entries are not countries and are here because 1:10m draws them
 * as their own admin-0 features, and a player standing on one still wants a
 * clock. They take the zone of whoever actually keeps time on the ground: the
 * two British base areas on Cyprus and the buffer zone between them read
 * Nicosia, Guantanamo Bay reads Havana, the Baikonur Cosmodrome reads Moscow
 * under its lease rather than Kazakhstan's own UTC+5, Bir Tawil — claimed by
 * nobody — takes Khartoum from the side of the 22nd parallel it lies on, and
 * the Southern Patagonian Ice Field, where Chile and Argentina have never drawn
 * the line, takes Santiago.
 */
const ZONES: Record<string, string> = {
  ABW: 'America/Aruba', AFG: 'Asia/Kabul', AGO: 'Africa/Luanda', AIA: 'America/Anguilla',
  ALA: 'Europe/Helsinki', ALB: 'Europe/Tirane', AND: 'Europe/Andorra', ARE: 'Asia/Dubai',
  ARG: 'America/Argentina/Buenos_Aires', ARM: 'Asia/Yerevan', ASM: 'Pacific/Pago_Pago',
  ATA: 'UTC', ATF: 'Indian/Kerguelen', ATG: 'America/Antigua', AUT: 'Europe/Vienna',
  AZE: 'Asia/Baku', BDI: 'Africa/Bujumbura', BEL: 'Europe/Brussels', BEN: 'Africa/Porto-Novo',
  BFA: 'Africa/Ouagadougou', BGD: 'Asia/Dhaka', BGR: 'Europe/Sofia', BHR: 'Asia/Bahrain',
  BHS: 'America/Nassau', BIH: 'Europe/Sarajevo', BLR: 'Europe/Minsk', BLZ: 'America/Belize',
  BMU: 'Atlantic/Bermuda', BOL: 'America/La_Paz', BRB: 'America/Barbados', BRN: 'Asia/Brunei',
  BRT: 'Africa/Khartoum',
  BTN: 'Asia/Thimphu', BWA: 'Africa/Gaborone', CAF: 'Africa/Bangui', CHE: 'Europe/Zurich',
  CHN: 'Asia/Shanghai', CIV: 'Africa/Abidjan', CMR: 'Africa/Douala', CNM: 'Asia/Nicosia',
  COG: 'Africa/Brazzaville',
  COK: 'Pacific/Rarotonga', COL: 'America/Bogota', COM: 'Indian/Comoro', CPV: 'Atlantic/Cape_Verde',
  CRI: 'America/Costa_Rica', CUB: 'America/Havana', CUW: 'America/Curacao', CYM: 'America/Cayman',
  CYN: 'Asia/Nicosia', CYP: 'Asia/Nicosia', CZE: 'Europe/Prague', DEU: 'Europe/Berlin',
  DJI: 'Africa/Djibouti', DMA: 'America/Dominica', DNK: 'Europe/Copenhagen',
  DOM: 'America/Santo_Domingo', DZA: 'Africa/Algiers', EGY: 'Africa/Cairo', ERI: 'Africa/Asmara',
  ESB: 'Asia/Nicosia', ESH: 'Africa/El_Aaiun', EST: 'Europe/Tallinn', ETH: 'Africa/Addis_Ababa', FIN: 'Europe/Helsinki',
  FJI: 'Pacific/Fiji', FLK: 'Atlantic/Stanley', FRO: 'Atlantic/Faroe', FSM: 'Pacific/Chuuk',
  GAB: 'Africa/Libreville', GBR: 'Europe/London', GEO: 'Asia/Tbilisi', GGY: 'Europe/Guernsey',
  GHA: 'Africa/Accra', GIN: 'Africa/Conakry', GMB: 'Africa/Banjul', GNB: 'Africa/Bissau',
  GNQ: 'Africa/Malabo', GRC: 'Europe/Athens', GRD: 'America/Grenada', GRL: 'America/Nuuk',
  GTM: 'America/Guatemala', GUM: 'Pacific/Guam', GUY: 'America/Guyana', HKG: 'Asia/Hong_Kong',
  HMD: 'Indian/Kerguelen', HND: 'America/Tegucigalpa', HRV: 'Europe/Zagreb', HTI: 'America/Port-au-Prince',
  HUN: 'Europe/Budapest', IMN: 'Europe/Isle_of_Man', IND: 'Asia/Kolkata', IOA: 'Indian/Christmas',
  IOT: 'Indian/Chagos', IRL: 'Europe/Dublin', IRN: 'Asia/Tehran', IRQ: 'Asia/Baghdad',
  ISL: 'Atlantic/Reykjavik', ISR: 'Asia/Jerusalem', ITA: 'Europe/Rome', JAM: 'America/Jamaica',
  JEY: 'Europe/Jersey', JOR: 'Asia/Amman', JPN: 'Asia/Tokyo', KAB: 'Europe/Moscow',
  KAS: 'Asia/Kolkata',
  KAZ: 'Asia/Almaty', KEN: 'Africa/Nairobi', KGZ: 'Asia/Bishkek', KHM: 'Asia/Phnom_Penh',
  KNA: 'America/St_Kitts', KOR: 'Asia/Seoul', KOS: 'Europe/Belgrade', KWT: 'Asia/Kuwait',
  LAO: 'Asia/Vientiane', LBN: 'Asia/Beirut', LBR: 'Africa/Monrovia', LBY: 'Africa/Tripoli',
  LCA: 'America/St_Lucia', LIE: 'Europe/Vaduz', LKA: 'Asia/Colombo', LSO: 'Africa/Maseru',
  LTU: 'Europe/Vilnius', LUX: 'Europe/Luxembourg', LVA: 'Europe/Riga', MAF: 'America/Marigot',
  MAR: 'Africa/Casablanca', MDA: 'Europe/Chisinau', MDG: 'Indian/Antananarivo',
  MHL: 'Pacific/Majuro', MKD: 'Europe/Skopje', MLI: 'Africa/Bamako', MLT: 'Europe/Malta',
  MMR: 'Asia/Yangon', MNE: 'Europe/Podgorica', MNG: 'Asia/Ulaanbaatar', MNP: 'Pacific/Saipan',
  MOZ: 'Africa/Maputo', MRT: 'Africa/Nouakchott', MSR: 'America/Montserrat', MUS: 'Indian/Mauritius',
  MWI: 'Africa/Blantyre', MYS: 'Asia/Kuala_Lumpur', NAM: 'Africa/Windhoek', NCL: 'Pacific/Noumea',
  NER: 'Africa/Niamey', NFK: 'Pacific/Norfolk', NGA: 'Africa/Lagos', NIC: 'America/Managua',
  NIU: 'Pacific/Niue', NLD: 'Europe/Amsterdam', NOR: 'Europe/Oslo', NPL: 'Asia/Kathmandu',
  NZL: 'Pacific/Auckland', OMN: 'Asia/Muscat', PAK: 'Asia/Karachi', PAN: 'America/Panama',
  PCN: 'Pacific/Pitcairn', PER: 'America/Lima', PHL: 'Asia/Manila', PLW: 'Pacific/Palau',
  POL: 'Europe/Warsaw', PRI: 'America/Puerto_Rico', PRK: 'Asia/Pyongyang', PRY: 'America/Asuncion',
  PSE: 'Asia/Hebron', PYF: 'Pacific/Tahiti', QAT: 'Asia/Qatar', ROU: 'Europe/Bucharest',
  RWA: 'Africa/Kigali', SAU: 'Asia/Riyadh', SDN: 'Africa/Khartoum', SEN: 'Africa/Dakar',
  SGP: 'Asia/Singapore', SGS: 'Atlantic/South_Georgia', SHN: 'Atlantic/St_Helena',
  SLB: 'Pacific/Guadalcanal', SLE: 'Africa/Freetown', SLV: 'America/El_Salvador',
  SMR: 'Europe/San_Marino', SOL: 'Africa/Mogadishu', SOM: 'Africa/Mogadishu',
  SPI: 'America/Santiago', SPM: 'America/Miquelon', SRB: 'Europe/Belgrade', SSD: 'Africa/Juba', STP: 'Africa/Sao_Tome',
  SUR: 'America/Paramaribo', SVK: 'Europe/Bratislava', SVN: 'Europe/Ljubljana',
  SWE: 'Europe/Stockholm', SWZ: 'Africa/Mbabane', SXM: 'America/Lower_Princes',
  SYC: 'Indian/Mahe', SYR: 'Asia/Damascus', TCA: 'America/Grand_Turk', TCD: 'Africa/Ndjamena',
  TGO: 'Africa/Lome', THA: 'Asia/Bangkok', TJK: 'Asia/Dushanbe', TKM: 'Asia/Ashgabat',
  TLS: 'Asia/Dili', TON: 'Pacific/Tongatapu', TTO: 'America/Port_of_Spain', TUN: 'Africa/Tunis',
  TUR: 'Europe/Istanbul', TWN: 'Asia/Taipei', TZA: 'Africa/Dar_es_Salaam', UGA: 'Africa/Kampala',
  UKR: 'Europe/Kyiv', URY: 'America/Montevideo', USG: 'America/Havana',
  UZB: 'Asia/Tashkent', VCT: 'America/St_Vincent',
  VEN: 'America/Caracas', VGB: 'America/Tortola', VIR: 'America/St_Thomas', VNM: 'Asia/Ho_Chi_Minh',
  VUT: 'Pacific/Efate', WLF: 'Pacific/Wallis', WSB: 'Asia/Nicosia', WSM: 'Pacific/Apia',
  YEM: 'Asia/Aden',
  ZAF: 'Africa/Johannesburg', ZMB: 'Africa/Lusaka', ZWE: 'Africa/Harare',
};

/**
 * The zone under a point.
 *
 * The wide countries are decided here rather than in the table because a
 * longitude decides them, and the meridians below are the real boundaries
 * rounded to something a coastline-accurate globe can honour — this world has
 * no state lines on it, so Indiana and Arizona are going to be an hour out and
 * that is the deal. The ones that matter — a continent's worth of Russia, the
 * four American bands, Australia's three — are right.
 */
export function zoneFor(iso: string, lon: number, lat: number): string | null {
  switch (iso) {
    case 'USA':
      if (lon >= -85) return 'America/New_York';
      if (lon >= -100) return 'America/Chicago';
      if (lon >= -114) return 'America/Denver';
      if (lon >= -128) return 'America/Los_Angeles';
      return lat > 50 ? 'America/Anchorage' : 'Pacific/Honolulu';
    case 'CAN':
      if (lon >= -57.5) return 'America/St_Johns';
      if (lon >= -68) return 'America/Halifax';
      if (lon >= -90) return 'America/Toronto';
      if (lon >= -102) return 'America/Winnipeg';
      if (lon >= -114) return 'America/Edmonton';
      return 'America/Vancouver';
    case 'RUS':
      if (lon < 22) return 'Europe/Kaliningrad';
      if (lon < 40) return 'Europe/Moscow';
      if (lon < 52.5) return 'Europe/Samara';
      if (lon < 67.5) return 'Asia/Yekaterinburg';
      if (lon < 82.5) return 'Asia/Omsk';
      if (lon < 97.5) return 'Asia/Krasnoyarsk';
      if (lon < 112.5) return 'Asia/Irkutsk';
      if (lon < 127.5) return 'Asia/Yakutsk';
      if (lon < 142.5) return 'Asia/Vladivostok';
      if (lon < 157.5) return 'Asia/Magadan';
      return 'Asia/Kamchatka';
    case 'BRA':
      if (lon >= -58) return 'America/Sao_Paulo';
      if (lon >= -68) return 'America/Manaus';
      return 'America/Rio_Branco';
    case 'AUS':
      if (lon >= 141) return lat > -29 ? 'Australia/Brisbane' : 'Australia/Sydney';
      if (lon >= 129) return lat > -26 ? 'Australia/Darwin' : 'Australia/Adelaide';
      return 'Australia/Perth';
    case 'IDN':
      if (lon < 114) return 'Asia/Jakarta';
      if (lon < 126) return 'Asia/Makassar';
      return 'Asia/Jayapura';
    case 'MEX':
      if (lon >= -89 && lat < 22) return 'America/Cancun';
      if (lon >= -102) return 'America/Mexico_City';
      if (lon >= -110) return 'America/Mazatlan';
      return 'America/Tijuana';
    case 'CHL':
      return lon < -100 ? 'Pacific/Easter' : 'America/Santiago';
    case 'ECU':
      return lon < -85 ? 'Pacific/Galapagos' : 'America/Guayaquil';
    case 'ESP':
      return lon < -12 ? 'Atlantic/Canary' : 'Europe/Madrid';
    case 'PRT':
      return lon < -20 ? 'Atlantic/Azores' : 'Europe/Lisbon';
    case 'FRA':
      return lon < -40 ? 'America/Cayenne' : 'Europe/Paris';
    case 'COD':
      return lon < 25 ? 'Africa/Kinshasa' : 'Africa/Lubumbashi';
    case 'KIR':
      return lon < 0 ? 'Pacific/Kiritimati' : 'Pacific/Tarawa';
    case 'PNG':
      return lon > 155 ? 'Pacific/Bougainville' : 'Pacific/Port_Moresby';
    default:
      return ZONES[iso] ?? null;
  }
}

/** Every zone name in the table, so `pnpm check` can resolve each one. */
export function allZoneNames(): string[] {
  return [...new Set(Object.values(ZONES))];
}

const pad = (n: number): string => (n < 10 ? `0${n}` : `${n}`);

/** Local mean solar time: the clock a place kept before the railways. */
function solarClock(now: Date, lon: number): string {
  const minutes = now.getUTCHours() * 60 + now.getUTCMinutes() + Math.round((lon / 15) * 60);
  const wrapped = ((minutes % 1440) + 1440) % 1440;
  return `${pad(Math.floor(wrapped / 60))}:${pad(wrapped % 60)}`;
}

/**
 * A `HH:MM` for a zone, falling back to the sun.
 *
 * The formatter is cached per zone because it is rebuilt every time otherwise
 * and this is called on a clock tick; constructing one is far more expensive
 * than using it.
 */
const formatters = new Map<string, Intl.DateTimeFormat | null>();

export function clockAt(now: Date, iso: string, lon: number, lat: number): string {
  const zone = zoneFor(iso, lon, lat);
  if (zone === null) return solarClock(now, lon);
  let formatter = formatters.get(zone);
  if (formatter === undefined) {
    try {
      formatter = new Intl.DateTimeFormat('en-GB', {
        timeZone: zone,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
    } catch {
      // A platform with no time zone data at all, which is a worse clock and
      // not a broken one. Same shape as the `localStorage` guards.
      formatter = null;
    }
    formatters.set(zone, formatter);
  }
  return formatter === null ? solarClock(now, lon) : formatter.format(now);
}
