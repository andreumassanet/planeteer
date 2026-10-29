/**
 * The HUD and the passport: the overlay's bar, badge and prompts, and the
 * book of stamps behind `J`.
 */
import { createTouchPad } from '../touch.ts';
import { heroAppearance } from '../avatar.ts';
import type { Hud } from '../hud.ts';
import type { Passport, PassportMoment } from '../passport.ts';
import type { PassportCard } from '../passport-card.ts';
import type { App } from './context.ts';

export async function createWorldHud(app: App): Promise<Hud> {
  const { createHud } = await app.deferred.hud;
  // The callbacks run on a click, long after everything they name exists.
  const hud = createHud(app.world, {
    touch: createTouchPad(app.input.touchSink, app.renderer.domElement),
    onSettings: () => app.settings.toggle(),
    onMap: () => (app.map.open ? app.map.hide() : app.map.show()),
    // A new country is a candidate stamp, given once you are down in it; no card, no jingle.
    onArrival: (id) => {
      const country = app.world.countries[id - 1];
      if (country !== undefined) app.passport.arrived(country.iso, country.name);
    },
    onPassport: () => app.passportCard.toggle(),
    // Earth's game is built once behind the menu, so back to the title is a reload.
    leave: { label: 'Main menu', run: () => app.toTitle() },
    // Inside the welcome card's click, so the pointer lock is still a user gesture.
    onStart: () => app.input.lock(),
    weather: () => app.weather.here().kind,
    profile: () => ({
      name: app.peersLink?.name ?? app.peersModule.storedName(),
      stamps: app.passport.data.stamps.length,
      towns: app.passport.data.towns.length,
    }),
  });
  document.body.appendChild(hud.root);
  return hud;
}

export interface WorldPassport {
  passport: Passport;
  passportCard: PassportCard;
  /** Where the passport thinks the player is, filled by the loop. */
  passportMoment: PassportMoment;
}

export async function createWorldPassport(app: App): Promise<WorldPassport> {
  const { createPassport } = await app.deferred.passport;
  const { createPassportCard } = await app.deferred.passportCard;
  const { audio } = app.sound;
  const passport = createPassport();
  const passportMoment: PassportMoment = {
    iso: '', aloft: false, mode: 'foot', time: new Date(0), lat: 0, lon: 0,
    town: { index: -1, name: '', iso: '', inside: false },
  };
  const passportCard = createPassportCard({
    passport,
    countries: app.world.countries,
    // One chapter per other world, read off their geography when the book first opens.
    chapters: () => import('../system/geography.ts').then((module) => module.chaptersOf()),
    holder: () => ({ name: app.peersLink?.name ?? app.peersModule.storedName(), appearance: heroAppearance() }),
    // It falls open at the visa of the country underfoot.
    here: () => passportMoment.iso,
    lockTarget: app.renderer.domElement,
    onOpen: () => {
      // One card at a time: the world map is put away under the book.
      if (app.map?.open) app.map.hide(false);
      audio.cue('book-open');
    },
    onClose: () => audio.cue('book-close'),
    // A riffle for a bookmark that skips several leaves.
    onTurn: (leaves) => {
      audio.cue('page');
      if (leaves > 1) window.setTimeout(() => audio.cue('page'), 90);
    },
    onThud: () => audio.cue('stamp'),
    // The rings come after the book at start-up; asked for whenever a page of them is laid.
    rings: () => {
      const rings = app.thrills?.rings;
      if (rings === undefined) return null;
      const totals = { air: 0, land: 0, sea: 0 };
      for (const site of rings.catalogue) totals[site.kind]++;
      return { landmarks: app.placements, collected: rings.record.landmarks, courses: rings.record.courses, totals };
    },
  });
  document.body.appendChild(passportCard.root);
  passport.onStamp = (stamp) => passportCard.celebrate(stamp);
  return { passport, passportCard, passportMoment };
}
