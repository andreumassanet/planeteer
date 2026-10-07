/**
 * One gazetteer for every world: Earth's built towns and countries, then each
 * walkable body's towns and nations (`geographyOf`, cached — the menu has
 * made every one of them under the loading screen). `/goto` and the menu's
 * search read it, so a town on Mars is found from Earth and Paris from Mars.
 *
 * A world's place says which world it is on by its key: Earth's countries
 * are outline codes (`ESP`), another world's nations `'<body>:<nation>'`
 * (`keyOf` in `geography.ts`), so nothing more is carried (`worldOfKey`).
 *
 * **Only towns and countries, and a town's own name.** Earth's list also
 * carries the names its bake folded into a bigger neighbour (`aliases`), so
 * `Kobe` finds Osaka; an alias that is also the name of a built town, on any
 * world, is dropped, because "Madrid" is Madrid and not the suburb of
 * Bogotá that was called that.
 *
 * Imported with `import()` only: `src/system/` stays out of Earth's first load.
 */
import type { Gazetteer } from '../chat-core.ts';
import { isShown } from '../places.ts';
import { fold } from '../ui.ts';
import { WALKABLE, geographyOf } from './geography.ts';

export function allWorlds(earth: Gazetteer): Gazetteer {
  const places = [...earth.places];
  const countries = [...earth.countries];
  for (const body of WALKABLE) {
    const geography = geographyOf(body);
    places.push(...geography.places);
    countries.push(...geography.countries.map((country) => ({ iso: country.iso, name: country.name })));
  }
  // A town that stands: the hidden ones are not somewhere to go.
  const named = new Set(places.filter((place) => isShown(place)).map((place) => fold(place.name)));
  const aliases = new Map<string, number>();
  for (const [alias, index] of earth.aliases) if (!named.has(fold(alias))) aliases.set(alias, index);
  return { places, aliases, countries };
}
