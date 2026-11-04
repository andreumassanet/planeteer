/** The guild's and the Field Guide's text as paragraphs, every `{action}` in it drawn as the player's own key cap. */
import { labelOf } from '../controls.ts';
import type { Action } from '../controls/types.ts';
import { h, kbd } from '../ui.ts';

/** A line of text, split at its blank lines into paragraphs, with its keys as caps. Text only, never markup. */
export function paragraphsOf(text: string): HTMLParagraphElement[] {
  return text.split(/\n\s*\n/).map((paragraph) => {
    const p = h('p');
    let last = 0;
    for (const match of paragraph.matchAll(/\{([a-zA-Z]+)\}/g)) {
      if (match.index > last) p.append(paragraph.slice(last, match.index));
      p.append(kbd(labelOf(match[1] as Action)));
      last = match.index + match[0].length;
    }
    if (last < paragraph.length) p.append(paragraph.slice(last));
    return p;
  });
}

/** The same text with each key written as its name, for a label or a voice. */
export function plainOf(text: string): string {
  return text.replace(/\{([a-zA-Z]+)\}/g, (_, action: string) => labelOf(action as Action));
}
