/** Small text helpers the shell shares. */

/** A line of glyphs as an element: `svgOf`'s markup, parsed once into the page's own document. */
export function svgNode(markup: string): SVGElement {
  const parsed = new DOMParser().parseFromString(markup, 'image/svg+xml').documentElement;
  return document.importNode(parsed, true) as unknown as SVGElement;
}

/** `HH:MM` for an hour of the day, 0 to 24. */
export function clockText(hour: number): string {
  const minutes = ((Math.floor(hour * 60) % 1440) + 1440) % 1440;
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}
