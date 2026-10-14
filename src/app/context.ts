/**
 * The long-lived parts of Earth's game, in one object. `main.ts` fills it
 * phase by phase in the order the parts are built; closures that need a
 * part made later (the HUD, the map, the camera) read it from here when
 * they run, which is always after it has been set.
 */
import type { Surface } from '../audio.ts';
import type { BiomeSample } from '../biome.ts';
import type { bearingTo } from '../cartography.ts';
import type { CameraRig } from '../camera.ts';
import type { Chat } from '../chat.ts';
import type { Gazetteer } from '../chat-core.ts';
import type { Fleet } from '../fleet.ts';
import type { FleetSync } from '../fleet-sync.ts';
import type { Hud } from '../hud.ts';
import type { Input } from '../input.ts';
import type { WorldMap } from '../map.ts';
import type { CountryNames } from '../names.ts';
import type { Navigation } from '../navigation.ts';
import type { PlayerList } from '../player-list.ts';
import type { Model } from '../models.ts';
import type { Peers } from '../peers.ts';
import type * as PeersModule from '../peers.ts';
import type { Player } from '../player.ts';
import type { Settings, TimeOfDay } from '../settings.ts';
import type { Title } from '../title.ts';
import type { IconName } from '../ui.ts';
import type { Arrival } from './arrival.ts';
import type { WorldData } from './data.ts';
import type { Deferred } from './deferred.ts';
import type { EarthMeshes } from './earth-meshes.ts';
import type { FrameStats } from './frame/stats.ts';
import type { FrontDoor } from './front-door.ts';
import type { Gestures } from './gestures.ts';
import type { Graphics } from './graphics.ts';
import type { Guard } from './guard.ts';
import type { WorldPassport } from './hud.ts';
import type { Jumps } from './jump.ts';
import type { Horns } from './keys.ts';
import type { MapPaper } from './map-paper.ts';
import type { SkyDiscs } from './menu-frame.ts';
import type { Movers } from './movers.ts';
import type { Nature } from './nature.ts';
import type { Overlay } from './overlay.ts';
import type { Conversation } from './conversation.ts';
import type { Rockets } from './rockets.ts';
import type { WorldSky } from './sky.ts';
import type { Sound } from './sound.ts';
import type { Towns } from './towns.ts';
import type { Vehicles } from './vehicles.ts';
import type { Walls } from './walls.ts';

export interface App
  extends WorldData, Graphics, WorldSky, EarthMeshes, FrontDoor, Towns, Movers, Nature, Vehicles, Arrival,
    MapPaper, WorldPassport, Jumps, Guard {
  /** When the page started building, ms. */
  began: number;
  query: URLSearchParams;
  deferred: Deferred;
  vehicleKit: Promise<Model[]>;
  avatarReady: Promise<void>;

  /** The relay's address (`VITE_PEERS_URL`, or the local relay in development); `''` for none. */
  peersUrl: string;
  peersModule: typeof PeersModule;
  /** The relay connection once there is one; the traveller's card is made long before it. */
  peersLink: Peers | null;
  sound: Sound;
  /** The title screen, unless a link skipped every menu. */
  title: Title | null;
  /** Every world's towns and nations, once the menu has made them. */
  everyWorld: Gazetteer | null;
  skyDiscs: SkyDiscs;

  walls: Walls;
  /** What the foot is on, and the biome underfoot: refreshed twice a second by the sound phase. */
  footing: Surface;
  biomeHere: BiomeSample;
  player: Player;
  fleet: Fleet;
  fleetSync: FleetSync | null;
  rig: CameraRig;
  input: Input;
  bearingTo: typeof bearingTo;
  EARTH_KM: number;
  conversation: Conversation;
  hud: Hud;
  nav: Navigation;
  gestures: Gestures;
  rockets: Rockets;
  map: WorldMap;
  playerList: PlayerList;
  names: CountryNames;
  overlay: Overlay;
  horns: Horns;
  timeOfDay: TimeOfDay;
  settings: Settings;
  chat: Chat;

  /** A toast on the HUD. */
  announce(text: string, iconName?: IconName): void;
  /** Says the render distance after it changed. */
  showDetail(value: number): void;
  /** A photo was asked for; the next draw takes it. */
  photoWanted: boolean;
  /** Whether the performance overlay is shown. */
  performanceOn: boolean;
  resize(): void;
  /** Saves the place and reloads to the solar system. */
  toSolarSystem(): void;
  frameStats: FrameStats;
  /** When the loop started, for the curtain's timeout. */
  loopStarted: number;
}
