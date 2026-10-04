/**
 * The map's painted tiles, kept between visits in IndexedDB.
 *
 * A tile is a pure function of the world's data and its key (`map-tiles.ts`),
 * so a tile painted once is good until the data or the style moves — and the
 * key carries both (`TilePainter.stamp`), so a stale tile is simply never
 * asked for again. What a new stamp leaves behind is cleared once, the first
 * time the store opens under it.
 *
 * **Optional, everywhere.** Every open, read and write is wrapped: a private
 * window, blocked site data or a full disk turns this into a store that holds
 * nothing, and the map paints what it would have read. A tile is a PNG of
 * 20 to 90 KB (2026-10-04); `MAX_TILES` of them is a few tens of megabytes at
 * the most, and the oldest go first past it.
 */

export interface TileStore {
  /** The tile under `key`, or null: never a rejection. */
  get(key: string): Promise<Blob | null>;
  /** Keeps a tile under `key`; fire and forget. */
  put(key: string, blob: Blob): void;
}

const DB_NAME = 'atlas-maps';
const STORE = 'tiles';
/** Tiles kept, the oldest written dropped past it. */
const MAX_TILES = 1500;

/**
 * The store for tiles keyed under `prefix` (the painter's stamp), or null
 * where the browser has no IndexedDB. Tiles under any other prefix are
 * deleted in the background once it opens.
 */
export function openTileStore(prefix: string): TileStore | null {
  let factory: IDBFactory | undefined;
  try {
    factory = typeof indexedDB === 'undefined' ? undefined : indexedDB;
  } catch {
    factory = undefined;
  }
  if (factory === undefined) return null;
  const opening = new Promise<IDBDatabase | null>((resolve) => {
    try {
      const request = factory.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        try {
          const store = request.result.createObjectStore(STORE);
          store.createIndex('at', 'at');
        } catch {
          // An older shape: the reads fail and the store holds nothing.
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  let written = 0;
  // What other stamps left, and what is over the cap, cleared once, after the world's arrival.
  opening.then((db) => {
    if (db === null) return;
    setTimeout(() => prune(db, prefix), 20_000);
  });
  return {
    get(key) {
      return opening.then(
        (db) =>
          db === null
            ? null
            : new Promise<Blob | null>((resolve) => {
                try {
                  const request = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
                  request.onsuccess = () => {
                    const value = request.result as { blob?: Blob } | undefined;
                    resolve(value?.blob instanceof Blob ? value.blob : null);
                  };
                  request.onerror = () => resolve(null);
                } catch {
                  resolve(null);
                }
              }),
        () => null,
      );
    },
    put(key, blob) {
      opening.then((db) => {
        if (db === null) return;
        try {
          const transaction = db.transaction(STORE, 'readwrite');
          transaction.objectStore(STORE).put({ blob, at: Date.now() }, key);
          transaction.onerror = () => undefined;
          if (++written % 200 === 0) prune(db, prefix);
        } catch {
          // A full disk or a closed database: this tile is painted next time.
        }
      }, () => undefined);
    },
  };
}

/** Deletes every tile not under `prefix`, then the oldest past `MAX_TILES`. */
function prune(db: IDBDatabase, prefix: string): void {
  try {
    const transaction = db.transaction(STORE, 'readwrite');
    const store = transaction.objectStore(STORE);
    const keys = store.getAllKeys();
    keys.onsuccess = () => {
      const all = keys.result as string[];
      let kept = 0;
      for (const key of all) {
        if (typeof key !== 'string' || !key.startsWith(`${prefix}/`)) store.delete(key);
        else kept++;
      }
      if (kept <= MAX_TILES) return;
      let over = kept - MAX_TILES;
      const cursor = store.index('at').openCursor();
      cursor.onsuccess = () => {
        const at = cursor.result;
        if (at === null || over <= 0) return;
        if (typeof at.primaryKey === 'string' && at.primaryKey.startsWith(`${prefix}/`)) {
          at.delete();
          over--;
        }
        at.continue();
      };
    };
    transaction.onerror = () => undefined;
  } catch {
    // Nothing kept is lost by not pruning.
  }
}
