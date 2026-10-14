/**
 * What the HUD offers this frame: a landmark's card as you walk up to it,
 * the travel mode, and what `E` would do, decided here so the key does what
 * the prompt says. Also lifts the menu's curtain once the ground under it
 * has built, and shows the welcome card once per device.
 */
import { LANDMARK_RANGE } from '../../placement.ts';
import type { App } from '../context.ts';
import { TALK_REACH } from '../conversation.ts';
import { modeIcon } from '../craft-kinds.ts';
import { WELCOME_KEY, readSetting, writeSetting } from '../storage.ts';
import type { Tick } from './tick.ts';

export function createPrompts(app: App): (tick: Tick) => void {
  const { player, monuments, world, hud, fleet, talk, townsfolk, launchPads, input, rig, conversation, gestures, rockets, personRadius } = app;
  /** The landmark whose card came up last, until you walk off from it. */
  let landmarkHere: string | null = null;
  /** The welcome card waits for the first arrival: the curtain up, or a link's first frame. */
  let welcomePending = readSetting(WELCOME_KEY) !== '1' && navigator.webdriver !== true;

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
        note: near.note,
      });
    } else if (near === null && landmarkHere !== null && monuments.landmarkNear(player.position, LANDMARK_RANGE * 1.5) === null) {
      landmarkHere = null;
    }
  }

  /** Somebody to talk to, then a bench, then a rocket, each only when nearer than the nearest seat. */
  function offers(): void {
    const offer = fleet.prompt;
    const afoot = !talk.open && player.mode === 'foot' && !player.airborne;
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
    if (riding !== null) hud.setPrompt(riding.state === 'boarded' ? 'Get out' : null, 'walk');
    else if (talk.open) hud.setPrompt(null);
    else if (talkOffer !== null) hud.setPrompt('Talk', 'talk');
    else if (player.sitting) hud.setPrompt('Stand up', 'walk');
    else if (benchOffer !== null) hud.setPrompt('Sit', 'seat');
    else if (rockets.offer !== null) hud.setPrompt('Board the rocket', 'sparkle');
    else hud.setPrompt(offer === null ? null : offer.label, modeIcon(offer?.model.kind ?? null));
  }

  return ({ now }) => {
    landmarkCard();
    hud.setMode(player.mode, player.airborne, rig.firstPerson, fleet.stranded);
    offers();
    hud.setPaused(!input.looking && !app.map.open && !app.settings.open && !app.traveller.open && !app.chat.open && !app.passportCard.open, input.dragging);
    // The curtain lifts once the towns, roads and near wood have built, or after 1.5 s regardless.
    const curtain = app.curtain;
    if (curtain !== null) {
      const waited = now - app.loopStarted;
      const settled =
        app.settlements.stats.pending === 0 && app.roads.stats.pending === 0 && app.vegetation.stats.nearPending === 0;
      if ((waited > 450 && settled) || waited > 1500) {
        curtain.lift();
        app.curtain = null;
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
