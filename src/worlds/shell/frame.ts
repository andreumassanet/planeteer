/** The shell's frame: `E`, the prompts, the badge, the maps, the passport, the sound and the others, then the frame counter. */

import * as THREE from 'three';
import type { Hud } from '../../hud.ts';
import type { Minimap } from '../../minimap.ts';
import type { WorldMap } from '../../map.ts';
import type { Navigation } from '../../navigation.ts';
import type { CountryNames } from '../../names.ts';
import type { PlayerList } from '../../player-list.ts';
import type { Passport, PassportMoment } from '../../passport.ts';
import type { PassportCard } from '../../passport-card.ts';
import type { Peers, PeerSelf } from '../../peers.ts';
import type { Places } from '../../places.ts';
import type { Chat } from '../../chat.ts';
import type { Settings } from '../../settings.ts';
import type { Cue } from '../../audio.ts';
import type { TravelMode } from '../../controls.ts';
import type { Geography } from '../../system/geography.ts';
import { bearingTo } from '../../cartography.ts';
import { latLonOf } from '../../sphere.ts';
import { createEar } from './ear.ts';
import { createInteraction } from './interact.ts';
import { MODE_OF, smoothstep } from './tables.ts';
import type { Clock } from './clock.ts';
import type { Gear } from './gear.ts';
import type { Overlay } from './overlay.ts';
import type { Photo } from './gestures.ts';
import type { Talking } from './talking.ts';
import { WELCOME_KEY, readSetting, writeSetting } from './storage.ts';
import { clockText } from './text.ts';
import type { ShellWorld } from './types.ts';

/** The map layer comes in between these heights over the ground, as on Earth (`OVERLAY_LOW`, `OVERLAY_HIGH`). */
const OVERLAY_LOW = 500;
const OVERLAY_HIGH = 2500;
/** How much of a nation's colour the ground takes at a full fade: enough to read as a map, never enough to hide the hills. */
const POLITICAL_CEILING = 0.72;
/** How long the frame counter averages over, ms. */
const STATS_MS = 500;

export interface ShellFrame {
  update(dt: number): void;
  drawn(updateMs: number, drawMs: number): void;
}

export interface FrameDeps {
  world: ShellWorld;
  clock: Clock;
  overlay: Overlay;
  hud: Hud;
  names: CountryNames;
  minimap: Minimap;
  map: WorldMap;
  nav: Navigation;
  playerList: PlayerList;
  settings: Settings;
  gear: Gear;
  chat: Chat;
  passport: Passport;
  passportCard: PassportCard;
  moment: PassportMoment;
  talking: Talking;
  photo: Photo;
  peers: Peers | null;
  self: PeerSelf;
  places: Places;
  countries: Geography['countries'];
  cue: (name: Cue) => void;
}

export function createShellFrame(deps: FrameDeps): ShellFrame {
  const { world, clock, overlay, hud, names, minimap, map, nav, playerList, settings, gear, chat, passport, passportCard, moment, talking, photo, peers, self, places, countries, cue } = deps;
  const { host, player, rig, sky, ground, frontiers, input } = world;
  const political = world.geography.world;
  const ear = createEar(world);
  const interact = createInteraction({ world, hud, talking, cue });


  /** Once per device, after the first arrival, on any world. */
  let welcomePending = readSetting(WELCOME_KEY) !== '1' && navigator.webdriver !== true;
  const stats = { fps: 0, frameMs: 0, updateMs: 0, drawMs: 0, p95Ms: 0, worstMs: 0, triangles: 0, calls: 0 };
  let frames = 0;
  let sampledAt = performance.now();
  let updateSum = 0;
  let drawSum = 0;
  let worst = 0;

  /** The map layer, on one number: the nations' colour over the ground and the frontiers widening to the map's line. */
  function mapLayer(standingIn: number): void {
    const fade = overlay.on ? smoothstep(OVERLAY_LOW, OVERLAY_HIGH, rig.altitude) : 0;
    ground.political = fade * POLITICAL_CEILING;
    const pixel = (2 * Math.tan((rig.camera.fov * Math.PI) / 360) * Math.max(1, rig.altitude)) / Math.max(1, innerHeight);
    const fog = world.scene.fog as THREE.Fog | null;
    frontiers.enabled = overlay.on;
    frontiers.update(rig.camera.position, fade, pixel, fog?.near ?? 1e9, fog?.far ?? 2e9, 3);
    names.update(fade, rig.camera, standingIn);
  }

  function update(dt: number): void {
    const state = input.state;
    // Time runs on, faster under the lapse.
    clock.advance(dt);
    const inRocket = world.riding();
    interact(state, inRocket);

    const mode: TravelMode = player.craft === null ? 'foot' : MODE_OF[player.craft.kind];
    hud.setMode(mode, player.craft?.airborne ?? false, rig.firstPerson);
    hud.setPaused(
      !input.looking && !map.open && !settings.open && !(host.traveller?.open ?? false) && !chat.open && !passportCard.open,
      input.dragging,
    );
    if (welcomePending && frames > 2) {
      welcomePending = false;
      writeSetting(WELCOME_KEY, '1');
      void hud.welcome();
    }

    // Where you are, asked once and handed to the disc, the chip and the book.
    const standingIn = political.countryAtPoint(player.position);
    const nearby = places.nearest(player.position);
    if (peers !== null) minimap.setPeers(peers.marks);
    minimap.update(player.position, player.facing, { country: standingIn, place: nearby }, rig.heading);
    nav.update(dt, player, rig.camera);
    playerList.update(dt);
    map.update(player.position, player.facing);
    mapLayer(standingIn);

    const here = latLonOf(player.position);
    const nearest = nearby.place;
    hud.update(standingIn, nearby, clockText(sky.state.hour), dt, bearingTo(player.position, player.facing, nearest.lat, nearest.lon));

    moment.iso = standingIn > 0 ? countries[standingIn - 1]!.iso : '';
    moment.aloft = player.airborne || (player.craft?.airborne ?? false);
    moment.mode = player.craft === null ? 'foot' : MODE_OF[player.craft.kind];
    moment.time = clock.date();
    moment.lat = here.lat;
    moment.lon = here.lon;
    moment.town.index = nearby.index;
    moment.town.name = nearest.name;
    moment.town.iso = nearest.iso;
    moment.town.inside = nearby.inside;
    passport.observe(moment);

    ear(dt, here, nearby);

    if (peers !== null) {
      self.velocity = player.craft === null ? player.velocity.length() : Math.abs(player.craft.speed);
      self.airborne = moment.aloft;
      self.canopy = player.canopy;
      self.state = player.craft === null && world.riding() === null ? 'foot' : 'seated';
      peers.update(dt, self);
    }
    talking.update(dt);
  }

  function drawn(updateMs: number, drawMs: number): void {
    photo.flush(map.open);
    frames++;
    updateSum += updateMs;
    drawSum += drawMs;
    worst = Math.max(worst, updateMs + drawMs);
    const now = performance.now();
    if (now - sampledAt >= STATS_MS) {
      const span = now - sampledAt;
      stats.fps = Math.round((frames * 1000) / span);
      stats.updateMs = updateSum / frames;
      stats.drawMs = drawSum / frames;
      stats.frameMs = stats.updateMs + stats.drawMs;
      stats.p95Ms = worst;
      stats.worstMs = worst;
      stats.triangles = host.renderer.info.render.triangles;
      stats.calls = host.renderer.info.render.calls;
      frames = 0;
      updateSum = 0;
      drawSum = 0;
      worst = 0;
      sampledAt = now;
      if (gear.performanceOn()) hud.showPerformance(stats);
    }
  }

  return { update, drawn };
}
