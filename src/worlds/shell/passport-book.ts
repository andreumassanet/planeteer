/** The passport: the book's pages (a chapter for every world, in its own writing) and the stamps. */

import type { WorldHost } from '../../world-host.ts';
import { chaptersOf } from '../../system/geography.ts';
import { createPassport } from '../../passport.ts';
import type { Passport, PassportMoment } from '../../passport.ts';
import { createPassportCard } from '../../passport-card.ts';
import type { PassportCard } from '../../passport-card.ts';
import type { PassportChapter } from '../../planet.ts';
import type { Cue } from '../../audio.ts';
import type { Appearance } from '../../appearance.ts';
import { WORLDS, WORLD_IDS } from '../registry.ts';
import { scriptOf, svgOf, writeLine } from '../glyphs.ts';
import type { Script } from '../glyphs.ts';
import { svgNode } from './text.ts';

export interface PassportBook {
  passport: Passport;
  card: PassportCard;
  /** Where the traveller is, rewritten each frame and handed to `passport.observe`. */
  moment: PassportMoment;
}

/** Each walked world's writing, read off its spec when the book first opens. */
async function chapters(): Promise<readonly PassportChapter[]> {
  const scripts = new Map<string, Script>();
  await Promise.all(
    WORLD_IDS.map(async (id) => {
      try {
        // The spec alone, not `loadWorldSpec`, which fetches the world's
        // whole kit as well.
        const { WORLD: other } = await WORLDS[id]!();
        if (other.civilisation !== null) scripts.set(id, scriptOf(other.civilisation.script));
      } catch {
        // A world that will not load has a chapter without its writing.
      }
    }),
  );
  return chaptersOf().map((chapter) => {
    const script = scripts.get(chapter.body);
    return script === undefined ? chapter : { ...chapter, script: (text: string) => svgNode(svgOf(script, writeLine(script, text))) };
  });
}

export function createPassportBook(deps: {
  host: WorldHost;
  lockTarget: HTMLElement;
  cue: (name: Cue) => void;
  holder: () => { name: string; appearance: Appearance };
  /** Closes the map: one card at a time. */
  closeMap: () => void;
}): PassportBook {
  const { host, lockTarget, cue, holder, closeMap } = deps;
  const passport = createPassport();
  const moment: PassportMoment = {
    iso: '', aloft: false, mode: 'foot', time: new Date(0), lat: 0, lon: 0,
    town: { index: -1, name: '', iso: '', inside: false },
  };
  const card = createPassportCard({
    passport,
    countries: host.countries ?? [],
    chapters,
    holder,
    // It falls open at the visa of the nation underfoot.
    here: () => moment.iso,
    lockTarget,
    onOpen: () => {
      closeMap();
      cue('book-open');
    },
    onClose: () => cue('book-close'),
    onTurn: (leaves) => {
      cue('page');
      if (leaves > 1) window.setTimeout(() => cue('page'), 90);
    },
    onThud: () => cue('stamp'),
  });
  passport.onStamp = (stamp) => card.celebrate(stamp);
  return { passport, card, moment };
}
