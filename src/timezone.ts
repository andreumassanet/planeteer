/**
 * What time it is where you are standing.
 *
 * Local solar time is free (longitude over fifteen) but disagrees with the
 * player's own wrist: Spain keeps Central European time barely east of
 * Greenwich, so a solar clock there reads nearly two hours behind. So this is
 * civil time, with the platform doing the rules: `Intl.DateTimeFormat` carries
 * the full IANA offsets and daylight-saving transitions in every browser and in
 * Node, and only the zone names are shipped. They come from GeoNames' own zone
 * for every town (baked into `places.bin`, which the chip reads) and, for ground
 * whose nearest town is across a border, a table here of country to zone,
 * split by meridians where a country holds several.
 *
 * Where there is no zone for a place, or the platform cannot resolve one, the
 * clock falls back to local mean solar time from the longitude: never absent,
 * never wrong about the sky.
 */

/**
 * Country to IANA zone, one entry per country in `countries.bin`, keyed on
 * `ADM0_A3`. Countries wide enough to hold several zones are decided by
 * longitude in `zoneFor` instead.
 *
 * Seven entries are not countries but 1:10m admin-0 features where a player
 * still wants a clock; they take the zone of whoever keeps time on the ground:
 * the British base areas on Cyprus and their buffer zone read Nicosia,
 * Guantanamo Bay Havana, Baikonur Moscow (under its lease), Bir Tawil Khartoum
 * and the Southern Patagonian Ice Field Santiago.
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
  FJI: 'Pacific/Fiji', FLK: 'Atlantic/Stanley', FRO: 'Atlantic/Faroe',
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
 * The zone under a point, from the country and the meridians alone. This is the
 * fallback, not the clock: `clockAt` prefers the zone GeoNames gives the nearest
 * built town when it stands in the same country, because a zone boundary is a
 * province line and a longitude cannot follow one. What is left is ground whose
 * nearest town is across a border; the meridians are the real boundaries rounded
 * to something a coastline-accurate globe can honour. `pnpm check` reads both paths.
 */
export function zoneFor(iso: string, lon: number, lat: number): string | null {
  switch (iso) {
    case 'USA':
      // West of the antimeridian is the far Aleutians, not New York.
      if (lat > 50 && (lon > 0 || lon < -169.5)) return 'America/Adak';
      if (lon >= -85) return 'America/New_York';
      // Indiana and eastern Kentucky keep Eastern time west of -85.
      if (lat > 37.9 && lat < 41.8 && lon >= -87.1) return 'America/New_York';
      if (lon >= -100) return 'America/Chicago';
      if (lat > 31.3 && lat < 37 && lon < -109.05 && lon >= -114.8) return 'America/Phoenix';
      if (lon >= -114) return 'America/Denver';
      // Southern Idaho is Mountain as far west as the Snake.
      if (lat > 42 && lat < 45.5 && lon >= -117) return 'America/Boise';
      if (lon >= -128) return 'America/Los_Angeles';
      return lat > 50 ? 'America/Anchorage' : 'Pacific/Honolulu';
    case 'CAN':
      if (lon >= -57.5) return 'America/St_Johns';
      if (lon >= -68) return 'America/Halifax';
      if (lon >= -90) return 'America/Toronto';
      if (lon >= -102) return 'America/Winnipeg';
      if (lon >= -118.5) return 'America/Edmonton';
      return 'America/Vancouver';
    case 'RUS':
      // Chukotka east of the antimeridian.
      if (lon < 0) return 'Asia/Anadyr';
      if (lon < 22) return 'Europe/Kaliningrad';
      if (lon < 50) return 'Europe/Moscow';
      if (lon < 54.5) return 'Europe/Samara';
      if (lon < 67.5) return 'Asia/Yekaterinburg';
      if (lon < 82.5) return 'Asia/Omsk';
      if (lon < 97.5) return 'Asia/Krasnoyarsk';
      if (lon < 112.5) return 'Asia/Irkutsk';
      // Yakutsk and the Amur keep UTC+9; the coast from Vladivostok up to
      // Khabarovsk keeps +10.
      if (lon < 130) return 'Asia/Yakutsk';
      if (lon < 142.5) return lat > 57 ? 'Asia/Yakutsk' : 'Asia/Vladivostok';
      if (lon < 157.5) return 'Asia/Magadan';
      return 'Asia/Kamchatka';
    case 'BRA':
      // Mato Grosso and Mato Grosso do Sul keep Amazon time east of -58.
      if (lon >= -58 && !(lon < -52 && lat < -7.3 && lat > -24.1)) return 'America/Sao_Paulo';
      if (lon >= -67) return 'America/Manaus';
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
      if (lon < -112.8 && lat > 28) return 'America/Tijuana';
      if (lat > 26.3 && lon < -108.6) return 'America/Hermosillo';
      // Baja California Sur, Sinaloa and Nayarit.
      if ((lon < -105.5 && lat < 26) || (lon < -104.3 && lat < 22.8)) return 'America/Mazatlan';
      return lat > 26 && lon < -103.3 ? 'America/Chihuahua' : 'America/Mexico_City';
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
      // West Africa Time is the old Kinshasa, Bandundu and Équateur provinces;
      // the Kasaïs south of them are Central Africa Time, like Lubumbashi.
      return lon < 20.5 || (lat > -2 && lon < 24.5) ? 'Africa/Kinshasa' : 'Africa/Lubumbashi';
    case 'FSM':
      return lon < 155 ? 'Pacific/Chuuk' : 'Pacific/Pohnpei';
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

/** Where the nearest built town is and which zone it keeps; a `Place` fits. */
export interface NearestZone {
  iso: string;
  zone: string;
}

const pad = (n: number): string => (n < 10 ? `0${n}` : `${n}`);

/** Local mean solar time: the clock a place kept before the railways. */
function solarClock(now: Date, lon: number): string {
  const minutes = now.getUTCHours() * 60 + now.getUTCMinutes() + Math.round((lon / 15) * 60);
  const wrapped = ((minutes % 1440) + 1440) % 1440;
  return `${pad(Math.floor(wrapped / 60))}:${pad(wrapped % 60)}`;
}

/** A formatter per zone, cached because constructing one is far more expensive than using it and this runs on a clock tick. */
const formatters = new Map<string, Intl.DateTimeFormat | null>();

function formatterFor(zone: string): Intl.DateTimeFormat | null {
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
      // A platform with no time zone data, or one older than the name
      // (`Europe/Kyiv` is 2022): a worse clock, not a broken one.
      formatter = null;
    }
    formatters.set(zone, formatter);
  }
  return formatter;
}

/**
 * The time where you stand as `HH:MM`. `nearest` is the nearest built town, and
 * its own zone is the answer when it stands in the country you are standing in
 * (a town is on the right side of every province line by construction). Across
 * a border the country and the meridians decide (`zoneFor`), and at sea the sun does.
 */
export function clockAt(
  now: Date,
  iso: string,
  lon: number,
  lat: number,
  nearest?: NearestZone | null,
): string {
  const local = nearest && iso !== '' && nearest.iso === iso ? formatterFor(nearest.zone) : null;
  if (local !== null) return local.format(now);
  const zone = zoneFor(iso, lon, lat);
  const formatter = zone === null ? null : formatterFor(zone);
  return formatter === null ? solarClock(now, lon) : formatter.format(now);
}
