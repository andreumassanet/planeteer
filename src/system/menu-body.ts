/**
 * Another world, as the start menu's `MenuBody`: its nations as the regions
 * you pick first, its towns as the sites you pick second, and the frontiers
 * drawn over the planet while you choose.
 *
 * `menu.ts`'s `earthBody` is the model and this is its other half. The menu
 * draws every region from its rings and resolves a click through `regionAt`,
 * so what this hands it is `geography.ts`'s map — the same rings, the same
 * `countryAt` and the same towns the HUD, the minimap and the passport read
 * on the ground — and nothing the menu has to learn.
 *
 * The body is drawn at the orrery's size, not its walking one, so its relief
 * is handed over at that scale: the ground's height times `drawnRadius` over
 * the surface radius, a hill on Mars a few hundredths of a unit on a disc of
 * fifteen. It is behind the menu's `import()` with the rest of `src/system/`.
 */

import * as THREE from 'three';
import type { MenuBody, MenuRegion, MenuRing, MenuSite } from '../menu.ts';
import { registerFlagPainter } from '../flags.ts';
import { latLonOf, unitAt } from '../sphere.ts';
import { PALETTE } from '../theme.ts';
import { paintBanner } from './banners.ts';
import { surfaceRadiusOf } from './contract.ts';
import { WALKABLE, geographyOf, localHour, walkableBody } from './geography.ts';
import { outlinesOf } from './outlines.ts';

/** How far over the drawn ground the frontiers ride, as a share of the radius. */
const FRONTIER_LIFT = 0.004;

/** `HH:MM` of a local solar hour. */
function formatHour(hour: number): string {
  const minutes = Math.floor(hour * 60) % (24 * 60);
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

/** A site with the id of the town it is, which the menu's spawn carries on. */
export type BodySite = MenuSite & { id: string };

/**
 * What this hands the menu beyond `MenuBody`'s required fields: the local
 * clock at a town, the frontiers to lay over the drawn planet, and each
 * site's id. Optional on the menu's side, so it is a `MenuBody` either way.
 */
export type WorldMenuBody = MenuBody & {
  sites: readonly BodySite[];
  /** The local solar time at a site, `HH:MM`, as the walking engine's sky would show it. */
  clock(site: MenuSite, time: Date): string;
  /**
   * The frontiers between nations as ink lines on a sphere of the drawn
   * radius, centred on the origin of its own frame: placed at `centre`,
   * unrotated, so north is +y exactly as `sphere.ts` lays the regions' rings.
   */
  overlay: THREE.Object3D;
};

/**
 * A walkable world as the menu's `MenuBody`, or null for Earth (which has
 * `earthBody`), the Sun and anything that is not a world one can stand on.
 * `centre` is where the menu draws the body and `drawnRadius` how big.
 */
export function menuBodyOf(
  id: string,
  centre: THREE.Vector3,
  drawnRadius: number,
  drawn?: (x: number, y: number, z: number) => number,
): WorldMenuBody | null {
  const body = walkableBody(id);
  if (body === undefined) return null;
  const geography = geographyOf(body);
  const scale = drawnRadius / surfaceRadiusOf(body.radiusKm);
  const ground = body.ground;
  const at = { lat: 0, lon: 0 };
  // The drawn globe's own height where it has one (`menuWorldOf`), so the
  // frontiers and the ribbon ride on the ground that is there.
  const relief = drawn ?? ((x: number, y: number, z: number): number => {
    if (ground === null) return 0;
    latLonOf({ x, y, z }, at);
    return ground.relief(at.lat, at.lon) * scale;
  });

  // The outlines joined back along their cuts: the highlight ribbon runs
  // round every ring it is handed, and round the raw rings it ran down a
  // meridian and along the equator through any nation that crosses one.
  // `regionAt` stays the rings' own `countryAt`.
  const outlined = outlinesOf(geography).countries;
  const regions: MenuRegion[] = geography.countries.map((country, i) => ({
    key: country.iso,
    name: country.name,
    // The line under the name, where Earth's says the continent.
    note: body.name,
    lat: country.lat,
    lon: country.lon,
    rings: (outlined[i]?.rings ?? country.rings).map((points): MenuRing => ({ points, height: 0 })),
    // The rings as cut, which never cross the antimeridian: what the globe's tint is painted flat from.
    flat: country.rings,
    ...(country.color === undefined ? {} : { color: country.color }),
  }));

  const sites: BodySite[] = geography.places.map((place, i) => ({
    id: body.settlements[i]!.id,
    name: place.name,
    key: place.iso,
    lat: place.lat,
    lon: place.lon,
    weight: place.pop,
    capital: place.capital,
  }));

  return {
    id: body.id,
    name: body.name,
    note: `${regions.length} nations · ${sites.length} towns`,
    radius: drawnRadius,
    // The orrery's own vector, live: the menu follows the body round its orbit.
    centre,
    relief,
    regions,
    regionAt: (lat, lon) => geography.world.countryAt(lat, lon),
    sites,
    clock: (site, time) => formatHour(localHour(body, site.lon, time)),
    overlay: frontierLines(geography.frontiers, drawnRadius, relief),
    words: { region: 'region', regions: 'regions', site: 'settlement', sites: 'settlements' },
  };
}

/**
 * The frontiers as one `LineSegments`: thin, ink, and left out of the
 * outline pass, which would hull a line as if it were a surface. Built about
 * the body's own origin; the menu puts it where the body is.
 */
function frontierLines(
  frontiers: readonly { points: number[][] }[],
  radius: number,
  relief: (x: number, y: number, z: number) => number,
): THREE.Object3D {
  const positions: number[] = [];
  const unit = new THREE.Vector3();
  const lift = radius * (1 + FRONTIER_LIFT);
  const push = (p: number[]): void => {
    unitAt(p[1]!, p[0]!, unit);
    const r = lift + relief(unit.x, unit.y, unit.z);
    positions.push(unit.x * r, unit.y * r, unit.z * r);
  };
  for (const frontier of frontiers) {
    for (let i = 1; i < frontier.points.length; i++) {
      push(frontier.points[i - 1]!);
      push(frontier.points[i]!);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const material = new THREE.LineBasicMaterial({ color: PALETTE.ink, transparent: true, opacity: 0.55, depthWrite: false });
  material.userData.outlineParameters = { visible: false };
  const lines = new THREE.LineSegments(geometry, material);
  lines.name = 'frontiers';
  // About the body's own origin: the menu places it at the centre.
  return lines;
}

/**
 * The same, drawn as the world itself is drawn: its own ground at the
 * orrery's size (`worlds/menu-globe.ts`) as the body's `globe`, and the
 * frontiers and the ribbon riding on that ground.
 */
export async function menuWorldOf(id: string, centre: THREE.Vector3, drawnRadius: number): Promise<WorldMenuBody | null> {
  const { menuGlobeOf } = await import('../worlds/menu-globe.ts');
  const globe = await menuGlobeOf(id, drawnRadius);
  const made = menuBodyOf(id, centre, drawnRadius, globe?.relief);
  if (made === null) {
    globe?.dispose();
    return null;
  }
  return globe === null ? made : { ...made, globe };
}

let installed = false;

/**
 * Hands every walked world's banners to `flags.ts`, one painter a body
 * prefix, so a flag drawn by key — the menu's pins, the HUD's card, a stamp —
 * draws the banner. Once; later calls do nothing.
 */
export function installBanners(): void {
  if (installed) return;
  installed = true;
  for (const body of WALKABLE) registerFlagPainter(body.id, paintBanner);
}
