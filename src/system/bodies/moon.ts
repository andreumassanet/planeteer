/**
 * The Moon: true numbers, invented countries and towns.
 *
 * **It is in this directory and not in the orrery.** `index.ts` keeps every
 * body of `kind: 'moon'` out of `BODIES`, because the orrery lays the planets
 * out round the Sun and a moon drawn there would sit on top of Earth; the
 * menu's dock reaches it by name. It is here at all because everything that
 * asks about a walked world's countries — `geography.ts`, the passport's
 * chapters, the menu's regions — reads `src/system/` and must not have to
 * load the walking engine to find the Moon's.
 *
 * Its ground is the walking world's own (`worlds/bodies/moon/ground.ts`, pure
 * and light), and its species is named by id rather than imported: the
 * Selenites are built by `worlds/bodies/moon/selenites.ts`, which brings the
 * walking engine's architecture with it.
 *
 * Earth's orbit (`orbit: 'earth'`) says where the Sun is: the Moon's own
 * wobble round Earth is a thousandth of an au and nothing in its sky can see
 * it.
 *
 * ---
 *
 * The Moon's countries and towns.
 *
 * **The countries are the map's own names**, as Mars's are: the maria Riccioli
 * named in 1651 and the IAU still uses, a highland Riccioli called the Land of
 * Snows, the far side's basins as Luna 3 and the orbiters found them. Every
 * centre is the feature's real one; every cap's radius is chosen to hold its
 * towns, and two are enclaves (Moscoviense in the Far Side, South Pole–Aitken
 * too), which `nationAt` resolves to the smaller exactly as `countryAt`
 * resolves Lesotho.
 *
 * **The towns are invented**, and so are their people: the Selenites live in
 * the lava tubes, and a town is the *porch* of one — what stands round a
 * skylight or a tube's mouth, with the rest of it below. So a population
 * counts the tube, and most towns are an outpost on the surface however many
 * live under it. Where a town stands at a real place it is the real
 * coordinate: a skylight, a crater's floor, a landing site's neighbourhood.
 * Where a skylight is the point, the town stands beside it and not on it,
 * because a town is built on a levelled pad and a pad would fill the pit in.
 */

import { PALETTE } from '../../theme.ts';
import type { Body, Nation, Settlement } from '../contract.ts';
import { MOON_GROUND, RADIUS_KM } from '../../worlds/bodies/moon/ground.ts';
import { grownTowns } from '../towns.ts';

export const NATIONS: readonly Nation[] = [
  { id: 'procellarum', name: 'Oceanus Procellarum', lat: 18, lon: -57, radius: 24, color: PALETTE.steel,
    note: 'The Ocean of Storms: the biggest dark plain on the Moon, with no ocean, no storms and lava a few hundred metres deep.' },
  { id: 'imbrium', name: 'Mare Imbrium', lat: 34, lon: -16, radius: 16, color: PALETTE.slate,
    note: 'The Sea of Showers, a basin a thousand kilometres wide walled by the Apennines, the Carpathians and the Alps.' },
  { id: 'frigoris', name: 'Mare Frigoris', lat: 57, lon: 0, radius: 9, color: PALETTE.bone,
    note: 'The Sea of Cold: a long dark ribbon across the north, with the flat dark floor of Plato at its edge.' },
  { id: 'serenitatis', name: 'Mare Serenitatis', lat: 28, lon: 17.5, radius: 9, color: PALETTE.cream,
    note: 'The Sea of Serenity, paler than its neighbour, rimmed by the mountains Apollo 15 and Apollo 17 came down beside.' },
  { id: 'tranquillitatis', name: 'Mare Tranquillitatis', lat: 8.5, lon: 31, radius: 11, color: PALETTE.skyBlue,
    note: 'The Sea of Tranquility, bluish with titanium, where the first boots came down on 20 July 1969.' },
  { id: 'crisium', name: 'Mare Crisium', lat: 17, lon: 59, radius: 8, color: PALETTE.tan,
    note: 'The Sea of Crises, a walled oval on the eastern limb. Luna 24 drilled two metres into it in 1976 and flew the core home.' },
  { id: 'fecunditatis', name: 'Mare Fecunditatis', lat: -6, lon: 50, radius: 9, color: PALETTE.olive,
    note: 'The Sea of Fertility, where nothing has ever grown. Luna 16 scooped a hundred grams of it in 1970, the first robot to bring the Moon home.' },
  { id: 'nubium', name: 'Mare Nubium', lat: -18, lon: -16, radius: 11, color: PALETTE.brown,
    note: 'The Sea of Clouds, with the Straight Wall drawn down its eastern side as if with a ruler.' },
  { id: 'insularum', name: 'Mare Insularum', lat: 7.5, lon: -30.9, radius: 8.5, color: PALETTE.sand,
    note: 'The Sea of Islands, between Copernicus and Kepler, both throwing bright rays across it. Apollo 12 landed on its south shore.' },
  { id: 'nivium', name: 'Terra Nivium', lat: -50, lon: -10, radius: 16, color: PALETTE.white,
    note: 'The Land of Snows, as Riccioli named the southern uplands: no snow, the brightest ground on the Moon, and Tycho and Clavius in it.' },
  { id: 'malapert', name: 'Malapert', lat: -90, lon: 0, radius: 9, color: PALETTE.apricot,
    note: 'The south pole: ridges where the sun almost never sets beside craters where it has never risen, and ice in the dark ones.' },
  { id: 'orientale', name: 'Mare Orientale', lat: -19.4, lon: -92.8, radius: 12, color: PALETTE.violet,
    note: 'A bull\'s-eye nine hundred kilometres across on the western limb, rings inside rings. From Earth you only ever see its edge.' },
  { id: 'farside', name: 'The Far Side', lat: 5, lon: 170, radius: 55, color: PALETTE.bark,
    note: 'The half that never faces Earth: crater on crater, almost no seas, and the only radio-quiet sky this side of the Sun.' },
  { id: 'aitken', name: 'South Pole–Aitken', lat: -53, lon: -169, radius: 32, color: PALETTE.clay,
    note: 'The biggest crater on the Moon: 2,500 kilometres across and eight deep. Chang\'e 4 landed inside it in 2019, the first craft on the far side.' },
  { id: 'moscoviense', name: 'Mare Moscoviense', lat: 27.3, lon: 147.9, radius: 5, color: PALETTE.pink,
    note: 'The Sea of Moscow, one of the far side\'s only dark seas, first seen in a Luna 3 photograph in October 1959.' },
];

/**
 * Eighteen towns, every one of them invented. The big four are the ones the
 * tubes are big under — Marius Hills, Tranquillitatis, Ingenii and the porch
 * beside the first landing — and they are the only ones large enough to build
 * a street of houses round their square; the rest are outposts, a skylight's
 * collar and little more, which on this world is honest.
 */
export const SETTLEMENTS: readonly Settlement[] = [
  // Beside the skylights, a pad's width and the pit's away.
  { id: 'marius-hollow', name: 'Marius Hollow', lat: 15.3, lon: -55.6, population: 600000, nation: 'procellarum' },
  { id: 'tranquillity-hollow', name: 'Tranquillity Hollow', lat: 9.5, lon: 34.0, population: 420000, nation: 'tranquillitatis' },
  { id: 'ingenii-deep', name: 'Ingenii Deep', lat: -35.0, lon: 167.3, population: 300000, nation: 'aitken' },
  // A mile and a half from Tranquility Base: the porch that keeps the shrine.
  // The IAU's name for the Apollo 11 site is Statio Tranquillitatis.
  { id: 'statio', name: 'Statio', lat: 1.9, lon: 24.4, population: 260000, nation: 'tranquillitatis' },
  // On crater floors: Clavius's south side, clear of the arc of craters across
  // its north; Plato's and Daedalus's middles.
  { id: 'clavius', name: 'Clavius', lat: -60.0, lon: -14.4, population: 280000, nation: 'nivium' },
  { id: 'plato', name: 'Plato', lat: 51.6, lon: -9.4, population: 90000, nation: 'frigoris' },
  { id: 'daedalus-quiet', name: 'Daedalus Quiet', lat: -5.9, lon: 179.4, population: 40000, nation: 'farside' },
  // Outposts at the named places.
  { id: 'aristarchus-lamp', name: 'Aristarchus Lamp', lat: 22.2, lon: -51.5, population: 70000, nation: 'procellarum' },
  { id: 'copernicus-gate', name: 'Copernicus Gate', lat: 9.0, lon: -24.0, population: 110000, nation: 'insularum' },
  { id: 'apennine-step', name: 'Apennine Step', lat: 25.0, lon: -3.0, population: 50000, nation: 'imbrium' },
  { id: 'rupes', name: 'Rupes', lat: -21.0, lon: -10.5, population: 35000, nation: 'nubium' },
  { id: 'crisium-bowl', name: 'Crisium Bowl', lat: 17.0, lon: 59.0, population: 80000, nation: 'crisium' },
  { id: 'messier', name: 'Messier', lat: -1.9, lon: 47.6, population: 26000, nation: 'fecunditatis' },
  { id: 'malapert-ridge', name: 'Malapert Ridge', lat: -86.0, lon: 2.0, population: 18000, nation: 'malapert' },
  { id: 'orientale-eye', name: 'Orientale Eye', lat: -19.4, lon: -92.8, population: 45000, nation: 'orientale' },
  { id: 'moscow-sea', name: 'Moscow Sea', lat: 26.5, lon: 147.0, population: 22000, nation: 'moscoviense' },
  { id: 'tsiolkovskiy', name: 'Tsiolkovskiy', lat: -20.4, lon: 129.1, population: 30000, nation: 'farside' },
  // On the smooth middle of Serenitatis, the one sea that had no porch: a
  // country with no town in it is a name on the map that leads nowhere.
  { id: 'serenity-porch', name: 'Serenity Porch', lat: 25.5, lon: 14.0, population: 38000, nation: 'serenitatis' },
];

export const MOON: Body = {
  id: 'moon',
  name: 'The Moon',
  kind: 'moon',
  orbit: 'earth',
  radiusKm: RADIUS_KM,
  // Sidereal: 27.32 days, the same as its orbit, which is why it shows Earth one face.
  rotationHours: 655.72,
  tiltDeg: 1.54,
  // The IAU's mean pole, J2000: within a few hundredths of a degree of the
  // ecliptic's own. The true one circles it at 1.54 degrees every 18.6 years.
  pole: { ra: 269.99, dec: 66.54 },
  // One face to Earth: the sky takes the Moon's turn from where Earth is.
  locked: true,
  gravity: 1.62,
  blurb:
    'A quarter of Earth across and a sixth of its gravity: every step a bound, every crater older than ' +
    'anything on Earth, and Earth itself hanging in a black sky that never moves.',
  look: {
    surface: PALETTE.bone,
    highland: PALETTE.white,
    lowland: PALETTE.steel,
    cap: PALETTE.white,
    sky: PALETTE.ink,
  },
  ground: MOON_GROUND,
  nations: NATIONS,
  // The file's own towns, and the nations filled out round them (`towns.ts`).
  settlements: grownTowns({ id: 'moon', radiusKm: RADIUS_KM, nations: NATIONS, settlements: SETTLEMENTS }),
  // `SELENITE.id` in `worlds/bodies/moon/selenites.ts`.
  species: 'selenite',
};
