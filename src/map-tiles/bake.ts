import type { TileCache } from './cache.ts';

const BAKE_TRIES = 4;
const BAKE_RETRY_MS = 1200;

/** A fetch tried again on a network failure, `BAKE_TRIES` times a `BAKE_RETRY_MS` apart. */
export async function fetchRetry(url: string): Promise<Response> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fetch(url);
    } catch (error) {
      if (attempt >= BAKE_TRIES) throw error;
      await new Promise((resolve) => setTimeout(resolve, BAKE_RETRY_MS * attempt));
    }
  }
}

/** Whether the bake on offer was painted by this painter's data (checked once). */
export function bakeOk(c: TileCache): Promise<boolean> | boolean {
  const { options, painter } = c;
  if (options.baked === undefined) return false;
  if (c.bakeChecked !== null) return c.bakeChecked;
  c.bakeChecked = fetchRetry(`${options.baked}stamp.txt`)
    .then((response) => (response.ok ? response.text() : ''))
    .then((text) => (c.bakeChecked = text.trim() === painter.groundStamp))
    .catch(() => (c.bakeChecked = false));
  return c.bakeChecked;
}

/** One baked level's image, or null where the bake is missing or fails: that level is painted like any other. */
export function bakedLevel(c: TileCache, z: number): Promise<ImageBitmap | null> | ImageBitmap | null {
  const { options, bakedLevels } = c;
  const known = bakedLevels[z];
  if (known !== undefined) return known;
  const loading = Promise.resolve(bakeOk(c))
    .then((ok) => (ok ? fetchRetry(`${options.baked}z${z}.png`) : null))
    .then((response) => (response !== null && response.ok ? response.blob() : null))
    .then((blob) => (blob === null ? null : createImageBitmap(blob)))
    .catch(() => null)
    .then((bitmap) => (bakedLevels[z] = bitmap));
  bakedLevels[z] = loading;
  return loading;
}
