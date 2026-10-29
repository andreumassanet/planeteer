/**
 * What the HUD offers this frame: a landmark's card as you walk up to it,
 * the travel mode, and what `E` would do, decided here so the key does what
 * the prompt says. Also lifts the menu's curtain once the ground under it
 * has built, and shows the welcome card once per device.
 */
import * as THREE from 'three';
import { LANDMARK_RANGE } from '../../placement.ts';
import { AVATAR_HEIGHT } from '../../stature.ts';
import { PLANE_THROTTLE_UP, planeCruiseAt, topSpeedOf } from '../../vehicles.ts';
import { unitFor } from '../speed-units.ts';
import type { App } from '../context.ts';
import { TALK_REACH } from '../conversation.ts';
import { modeIcon } from '../craft-kinds.ts';
import { WELCOME_KEY, readSetting, writeSetting } from '../storage.ts';
import type { Tick } from './tick.ts';

/** Camera distances, units, inside which a tag over a thing is whole, and past which it is faintest. */
const TAG_NEAR = 18;
const TAG_FAR = 70;
/** The faintest a tag gets with distance. */
const TAG_FLOOR = 0.45;
/** How far in from the screen's edges a tag must stand, px, or the prompt goes back to the bottom. */
const TAG_MARGIN = 40;

/** The longest the arrival's curtain waits for the ground to build, ms; the menu builds none of it beforehand. */
const CURTAIN_LIMIT_MS = 4000;

export function createPrompts(app: App): (tick: Tick) => void {
  const { player, monuments, world, hud, fleet, talk, townsfolk, launchPads, input, rig, conversation, gestures, rockets, personRadius, trainRide } = app;
  /** The landmark whose card came up last, until you walk off from it. */
  let landmarkHere: string | null = null;
  /** The welcome card waits for the first arrival: the curtain up, or a link's first frame. */
  let welcomePending = readSetting(WELCOME_KEY) !== '1' && navigator.webdriver !== true;
  /** Where this frame's offer stands, the point its tag hangs from; null for one with no place (getting out, standing up). */
  const anchor = new THREE.Vector3();
  let anchored = false;
  const projected = new THREE.Vector3();
  const sight = new THREE.Vector3();

  /** Hangs the tag a height over a point on the ground, along the planet's up. */
  function hangOver(point: THREE.Vector3, height: number): void {
    anchor.copy(point).addScaledVector(sight.copy(point).normalize(), height);
    anchored = true;
  }

  /** Whether a building, a landmark or a tree stands between the eye and the tag. */
  function hidden(camera: THREE.Camera): boolean {
    for (const t of [0.4, 0.75]) {
      sight.copy(camera.position).lerp(anchor, t);
      if (app.settlements.blocksSight(sight) || monuments.blocksSight(sight)) return true;
    }
    return false;
  }

  /** The prompt over the thing it is about, or back over the bottom when that is off screen, behind or hidden. */
  function placeTag(): void {
    const camera = rig.camera;
    if (!anchored) {
      hud.placePrompt(null, 0, 1);
      return;
    }
    camera.updateMatrixWorld();
    projected.copy(anchor).project(camera);
    const x = (projected.x * 0.5 + 0.5) * innerWidth;
    const y = (0.5 - projected.y * 0.5) * innerHeight;
    const onScreen = projected.z < 1 && x > TAG_MARGIN && x < innerWidth - TAG_MARGIN && y > TAG_MARGIN * 2 && y < innerHeight - TAG_MARGIN;
    if (!onScreen || hidden(camera)) {
      hud.placePrompt(null, 0, 1);
      return;
    }
    const distance = camera.position.distanceTo(anchor);
    const fade = 1 - (1 - TAG_FLOOR) * Math.min(1, Math.max(0, (distance - TAG_NEAR) / (TAG_FAR - TAG_NEAR)));
    hud.placePrompt(x, y, fade);
  }

  /** The dial while in a vehicle: its speed, its top, and the gear or the altitude. */
  function speedometer(dt: number): void {
    const ride = player.state === 'seated' ? player.ride : null;
    if (ride === null) {
      hud.setSpeed(null, 'kmh', dt);
      return;
    }
    const { kind, medium } = ride.model;
    const top = kind === 'plane' ? planeCruiseAt(player.altitude) * (1 + PLANE_THROTTLE_UP) : topSpeedOf(kind);
    hud.setSpeed(
      { speed: player.speed, top, air: medium === 'air', road: medium === 'road' && kind !== 'horse' && kind !== 'bicycle', altitude: player.altitude },
      unitFor(medium),
      dt,
    );
  }

  /** A landmark's card once each time you come, out of a vehicle; walking off half as far again resets it. */
  function landmarkCard(): void {
    if (player.state === 'seated') return;
    const near = monuments.landmarkNear(player.position);
    if (near !== null && near.id !== landmarkHere) {
      landmarkHere = near.id;
      // The landmark's own country, not the ground's: a few stand on a shore or a border.
      const owner = world.countries.find((c) => c.iso === near.iso);
      hud.showLandmark({
        name: near.name,
        iso: near.iso,
        country: owner?.name ?? near.iso,
        height: near.height,
        year: near.year,
      });
    } else if (near === null && landmarkHere !== null && monuments.landmarkNear(player.position, LANDMARK_RANGE * 1.5) === null) {
      landmarkHere = null;
    }
  }

  /** Somebody to talk to, then a bench, then a rocket, each only when nearer than the nearest seat. */
  function offers(): void {
    const offer = fleet.prompt;
    const afoot = !talk.open && player.mode === 'foot' && !player.airborne && !trainRide.riding;
    const talker = afoot ? townsfolk.nearest(player.position, TALK_REACH) : null;
    const talkGap = talker === null ? Infinity : talker.distance - personRadius;
    conversation.offer = talker !== null && (offer === null || talkGap < offer.gap) ? talker.key : null;
    const talkOffer = conversation.offer;
    const bench = talk.open || talkOffer !== null || player.sitting || player.mode !== 'foot' || player.airborne ? null : gestures.nearestBench();
    gestures.benchOffer = bench !== null && (offer === null || bench.distance < offer.gap) ? bench.bench : null;
    const benchOffer = gestures.benchOffer;
    const rocketNear = talkOffer !== null || benchOffer !== null || talk.open || !afoot || player.sitting ? null : launchPads.offer(player.position);
    rockets.offer = rocketNear !== null && (offer === null || rocketNear.gap < offer.gap) ? rocketNear.rocket : null;
    const riding = launchPads.riding;
    anchored = false;
    if (riding === null && !talk.open) {
      if (talkOffer !== null && talker !== null) hangOver(talker.position, talker.height + AVATAR_HEIGHT * 0.25);
      else if (player.sitting) anchored = false;
      else if (benchOffer !== null) hangOver(benchOffer.position, AVATAR_HEIGHT * 0.6);
      else if (rockets.offer !== null) hangOver(rockets.offer.position, AVATAR_HEIGHT * 2);
      else if (offer !== null) hangOver(offer.at, offer.model.size[2] + AVATAR_HEIGHT * 0.2);
    }
    // The railway's board, after a bench and a rocket: a platform has benches to wait on.
    const train = trainRide.prompt;
    if (riding !== null) hud.setPrompt(riding.state === 'boarded' ? 'Get out' : null, 'walk');
    else if (trainRide.riding) hud.setPrompt(train?.label ?? null, train?.icon);
    else if (talk.open) hud.setPrompt(null);
    else if (talkOffer !== null) hud.setPrompt('Talk', 'talk');
    else if (player.sitting) hud.setPrompt('Stand up', 'walk');
    else if (benchOffer !== null) hud.setPrompt('Sit', 'seat');
    else if (rockets.offer !== null) hud.setPrompt('Board the rocket', 'sparkle');
    else if (train !== null && (offer === null || trainRide.acts)) hud.setPrompt(train.label, train.icon);
    else hud.setPrompt(offer === null ? null : offer.label, modeIcon(offer?.model.kind ?? null));
  }

  return ({ now, dt }) => {
    trainRide.offer(app.trainRide.clock ?? app.sky.state.time.getTime() / 1000);
    landmarkCard();
    hud.setMode(player.mode, player.airborne, rig.firstPerson, fleet.stranded);
    offers();
    placeTag();
    speedometer(dt);
    hud.setPaused(!input.looking && !app.map.open && !app.settings.open && !app.traveller.open && !app.chat.open && !app.passportCard.open, input.dragging);
    // The curtain lifts once the towns, roads and near wood have built, or after `CURTAIN_LIMIT_MS` regardless.
    const curtain = app.curtain;
    if (curtain !== null) {
      const waited = now - app.loopStarted;
      const settled =
        app.settlements.stats.pending === 0 && app.roads.stats.pending === 0 && app.vegetation.stats.nearPending === 0;
      // The bar runs on the clock towards the limit, and fills the moment the ground has stood.
      curtain.progress(settled ? 1 : 0.3 + 0.65 * Math.min(1, waited / CURTAIN_LIMIT_MS));
      if ((waited > 450 && settled) || waited > CURTAIN_LIMIT_MS) {
        curtain.lift();
        app.curtain = null;
        // The world is heard from the moment it is seen.
        app.sound.audio.hush(false);
      }
    }
    // Kept as soon as it is shown, so a reload does not show it twice.
    if (welcomePending && app.curtain === null) {
      welcomePending = false;
      writeSetting(WELCOME_KEY, '1');
      void hud.welcome();
    }
  };
}
