/** The airstrips drawn round the player: the plane sites near enough, their mesh and their swinging windsocks. */
import * as THREE from 'three';
import { BIOMES, biomeAt, biomeSample } from '../biome.ts';
import { PLANET_RADIUS, groundColorAt, groundRadius } from '../globe.ts';
import { NEAR_BUILD, mayBuild } from '../view.ts';
import { latOf, lonOf } from '../sphere.ts';
import { rngFrom } from '../scenery/random.ts';
import type { WirePose } from '../craft/contract.ts';
import { STRIP_LENGTH, buildStrip, buildWindsock, stripColor, stripPoint } from '../craft/airstrip.ts';
import { writePose } from '../player/pose.ts';
import { BUILD_MS, SOCK_ALONG, SOCK_OFF, SOCK_REACH, STRIP_KEEP, STRIP_REACH } from './limits.ts';
import { applyPose } from './pose.ts';
import type { Placing } from './placing.ts';
import type { FleetSite } from './site-types.ts';
import type { DrawnStrip, FleetContext } from './state.ts';

export interface Airstrips {
  /** The plane sites near the player, worked out by the last scan; the fleet's scan also draws on them. */
  readonly planeSites: FleetSite[];
  readonly strips: ReadonlyMap<string, DrawnStrip>;
  /** How many strips are wanted and not yet standing. */
  pending(): number;
  /** Works out which strips are wanted, and puts away those that are not. */
  scan(): void;
  /** Builds what is wanted and not standing, inside the frame's allowance, and swings the near windsocks. */
  update(dt: number, began: number): void;
}

export function createAirstrips(ctx: FleetContext, placing: Placing): Airstrips {
  const { options, sites, group, point, up, centre } = ctx;
  const { world, player } = options;
  const { probe, surface } = placing;
  const strips = new Map<string, DrawnStrip>();
  /** The plane sites near enough to have their strip drawn, nearest first; rewritten by every scan. */
  let stripsWanted: { site: FleetSite; distance: number }[] = [];
  const planeSites: FleetSite[] = [];
  const stripColour = new THREE.Color();
  const stripGround = new THREE.Color();
  const stripBiome = biomeSample();
  const stripPose: WirePose = new Array(9).fill(0);
  let clock = 0;

  function middleOf(site: FleetSite, out: THREE.Vector3): THREE.Vector3 {
    stripPoint(site, STRIP_LENGTH / 2, 0, out);
    return out.multiplyScalar(groundRadius(world, point.copy(out).multiplyScalar(PLANET_RADIUS)));
  }

  function scanStrips(): void {
    planeSites.length = 0;
    up.copy(player.position).normalize();
    sites.planesNear(up, STRIP_KEEP, planeSites);
    stripsWanted = [];
    for (const site of planeSites) {
      const distance = middleOf(site, centre).distanceTo(player.position);
      if (distance <= (strips.has(site.id) ? STRIP_KEEP : STRIP_REACH)) stripsWanted.push({ site, distance });
    }
    stripsWanted.sort((a, b) => a.distance - b.distance || (a.site.id < b.site.id ? -1 : 1));
    const keep = new Set(stripsWanted.map((want) => want.site.id));
    for (const [id, drawnStrip] of strips) {
      if (keep.has(id)) continue;
      group.remove(drawnStrip.group);
      // The windsock shares its template's geometry; only the strip's own goes.
      drawnStrip.strip.geometry.dispose();
      strips.delete(id);
    }
  }

  function buildStripFor(site: FleetSite): DrawnStrip {
    // The land's own colour under the middle, and whether it has a sward to mow.
    stripPoint(site, STRIP_LENGTH / 2, 0, centre);
    point.copy(centre).multiplyScalar(PLANET_RADIUS);
    groundColorAt(world, point, stripGround);
    const lat = latOf(centre.y);
    const lon = lonOf(centre.x, centre.z);
    biomeAt(centre.x, centre.y, centre.z, lat, lon, world.elevationAt(point), stripBiome);
    stripColor(stripGround, BIOMES[stripBiome.id].sward, stripColour);

    const holder = new THREE.Group();
    holder.name = `airstrip:${site.id}`;
    const strip = buildStrip(site, surface, stripColour);
    holder.add(strip);

    // The windsock, stood upright off the strip's left edge and facing down it.
    const sock = buildWindsock();
    stripPoint(site, SOCK_ALONG, -SOCK_OFF, centre);
    point.copy(centre).multiplyScalar(surface(centre));
    applyPose(writePose(point, site.forward, centre, stripPose), sock);
    holder.add(sock);
    group.add(holder);
    const rng = rngFrom('fleet-windsock', site.place);
    return {
      site,
      group: holder,
      strip,
      sock: sock.getObjectByName('rotor') ?? null,
      middle: middleOf(site, new THREE.Vector3()),
      // A strip is laid into the prevailing wind, so the sock points back
      // down it, give or take a seeded quarter of a right angle.
      wind: Math.PI + (rng.unit() - 0.5) * 0.8,
      phase: rng.unit() * Math.PI * 2,
    };
  }

  /** Builds what is wanted and not standing, inside the frame's allowance, and swings the near windsocks. */
  function updateStrips(dt: number, began: number): void {
    clock += dt;
    for (const want of stripsWanted) {
      if (strips.has(want.site.id)) continue;
      if (!mayBuild(began, BUILD_MS, want.distance < NEAR_BUILD, 'fleet')) break;
      // Gathered a slice a frame; the strips wait for it rather than lie on the relief.
      if (probe !== null && !probe.prepare(player.position)) break;
      strips.set(want.site.id, buildStripFor(want.site));
    }
    for (const drawnStrip of strips.values()) {
      if (drawnStrip.sock === null || drawnStrip.middle.distanceTo(player.position) > SOCK_REACH + STRIP_LENGTH / 2) continue;
      // A slow swing and a quicker gust over it, never the same twice, and the
      // tail lifting as the gust fills it.
      const t = clock + drawnStrip.phase;
      const gust = 0.5 + 0.5 * Math.sin(t * 0.9) * Math.sin(t * 0.37 + 1.3);
      drawnStrip.sock.rotation.y = drawnStrip.wind + 0.3 * Math.sin(t * 0.45) + 0.1 * Math.sin(t * 1.7);
      drawnStrip.sock.rotation.x = 0.55 - 0.45 * gust;
    }
  }

  return {
    planeSites,
    strips,
    pending: () => stripsWanted.filter((want) => !strips.has(want.site.id)).length,
    scan: scanStrips,
    update: updateStrips,
  };
}
