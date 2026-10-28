/** The tooltip under the pointer: a country's name, capital and when and how it was stamped; or a landmark's ring. */
import { createFlagCanvas } from '../flags.ts';
import { stampDateText } from '../passport.ts';
import { MODE_TEXT } from './constants.ts';
import type { BookDom } from './dom.ts';
import { readRings, stampsByIso } from './model.ts';
import type { BookModel } from './model.ts';

export interface Tip {
  hide(): void;
}

/** Wires the tooltip to the cells of the book; its listeners go with `signal`. */
export function createTip(model: BookModel, dom: BookDom, signal: AbortSignal): Tip {
  const { tip, tipFlag, tipName, tipCapital, tipStamp, book } = dom;
  let tipIso = '';
  function hide(): void {
    tipIso = '';
    tip.classList.remove('on');
  }
  /** A landmark's ring: the landmark, its country, and whether it has been flown through. */
  function showLandmark(id: string): boolean {
    const rings = readRings(model.rings);
    const landmark = rings?.landmarks.find((each) => each.id === id);
    if (rings === null || landmark === undefined) return false;
    if (`ring:${id}` !== tipIso) {
      tipIso = `ring:${id}`;
      const flag = createFlagCanvas(landmark.iso, 34, 23);
      flag.className = 'ui-flag';
      tipFlag.replaceChildren(flag);
      tipName.textContent = landmark.name;
      tipCapital.textContent = model.countryOf.get(landmark.iso)?.name ?? '';
      tipStamp.textContent = rings.collected.has(id) ? 'Ring collected' : 'Not yet: its gold ring hangs high over it';
    }
    return true;
  }
  function show(cell: HTMLElement): void {
    const landmark = cell.dataset.landmark;
    if (landmark !== undefined) {
      if (!showLandmark(landmark)) {
        hide();
        return;
      }
      place(cell);
      return;
    }
    const iso = cell.dataset.iso ?? '';
    const country = model.countryOf.get(iso);
    const nation = model.nationOf.get(iso);
    if (country === undefined && nation === undefined) {
      hide();
      return;
    }
    if (iso !== tipIso) {
      tipIso = iso;
      const flag = createFlagCanvas(iso, 34, 23);
      flag.className = 'ui-flag';
      tipFlag.replaceChildren(flag);
      tipName.textContent = country?.name ?? nation!.name;
      const capital = country === undefined ? undefined : model.facts?.[iso]?.capital;
      tipCapital.textContent = nation !== undefined ? `A nation of ${nation.world}` : capital === undefined ? '' : `Capital: ${capital}`;
      const stamp = stampsByIso(model).get(iso);
      tipStamp.textContent =
        stamp === undefined
          ? 'Not visited yet'
          : `Stamped ${stampDateText(stamp.date)}${stamp.town === '' ? '' : ` near ${stamp.town}`}, ${MODE_TEXT[stamp.mode]}`;
    }
    place(cell);
  }
  function place(cell: HTMLElement): void {
    const box = cell.getBoundingClientRect();
    tip.style.left = `${Math.max(160, Math.min(innerWidth - 160, box.left + box.width / 2)).toFixed(1)}px`;
    tip.style.top = `${box.top.toFixed(1)}px`;
    tip.classList.add('on');
  }
  book.addEventListener('pointerover', (event) => {
    const cell = event.target instanceof Element ? event.target.closest('.p-cell') : null;
    if (cell instanceof HTMLElement) show(cell);
    else hide();
  }, { signal });
  book.addEventListener('pointerleave', hide, { signal });
  return { hide };
}
