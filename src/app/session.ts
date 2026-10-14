/**
 * The game once a place has been chosen: the player, the vehicles, the
 * camera and input, the maps, the HUD and its cards, the chat, then the
 * loop and the console surface. Built behind the menu's curtain.
 */
import { biomeSample } from '../biome.ts';
import type { App } from './context.ts';
import { createRigAndInput } from './camera.ts';
import { createWorldChat } from './chat.ts';
import { createConversation } from './conversation.ts';
import { exposeDebug } from './debug.ts';
import { createWorldFleet, wireFleet } from './fleet.ts';
import { createGestures } from './gestures.ts';
import { watchResize } from './graphics.ts';
import { createHero } from './hero.ts';
import { createWorldHud, createWorldPassport } from './hud.ts';
import { createJumps } from './jump.ts';
import { createHorns, listenForSettingKeys } from './keys.ts';
import { keepLastPlace } from './last-place.ts';
import { createLoop } from './loop.ts';
import { createMapPaper } from './map-paper.ts';
import { createOverlay } from './overlay.ts';
import { renderDistanceWords } from './render-distance.ts';
import { createRockets } from './rockets.ts';
import { createTimeOfDay } from './time-of-day.ts';
import { createWalls } from './walls.ts';
import { createWorldSettings } from './world-settings.ts';
import { createPlanetMap, createWorldNames, createWorldNavigation, createWorldPlayerList } from './world-map.ts';

export async function startSession(app: App): Promise<void> {
  app.announce = (text, iconName = 'sparkle') => app.hud.toast(text, iconName);
  app.showDetail = (value) => app.announce(`Render distance ${renderDistanceWords(value)} (${value.toFixed(2)}×)`, 'eye');
  app.photoWanted = false;
  app.footing = 'grass';
  app.biomeHere = biomeSample();
  app.walls = createWalls(app);
  app.player = await createHero(app);
  Object.assign(app, await createWorldFleet(app));
  wireFleet(app);
  Object.assign(app, createRigAndInput(app));

  Object.assign(app, await createMapPaper(app));
  const { bearingTo, EARTH_KM } = await app.deferred.cartography;
  app.bearingTo = bearingTo;
  app.EARTH_KM = EARTH_KM;
  app.conversation = createConversation(app);
  app.hud = await createWorldHud(app);
  Object.assign(app, await createWorldPassport(app));
  app.nav = await createWorldNavigation(app);
  Object.assign(app, createJumps(app));
  app.gestures = createGestures(app);
  app.rockets = createRockets(app);
  app.map = await createPlanetMap(app);
  app.playerList = await createWorldPlayerList(app);
  app.names = await createWorldNames(app);

  app.overlay = createOverlay(app);
  listenForSettingKeys(app);
  app.horns = createHorns(app);
  app.timeOfDay = createTimeOfDay(app);
  app.settings = await createWorldSettings(app);
  app.chat = await createWorldChat(app);
  app.resize = watchResize(app, app.rig);
  app.toSolarSystem = keepLastPlace(app).toSolarSystem;

  // Without this the first frames render from the planet's centre.
  app.rig.snap(app.player, app.groundAt);
  app.menu.dispose();
  app.title?.dispose();
  app.frontSettings.hide();
  app.frontSettings.root.remove();

  const startLoop = createLoop(app);
  startLoop();
  exposeDebug(app);
}
