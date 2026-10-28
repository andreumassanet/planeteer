/**
 * The disc in the corner: where you are, at the scale of where you are.
 *
 * A local map. Its half-width is the ground you will cover: `LOCAL_VIEW` round
 * you on foot, closing to `TOWN_VIEW` inside a town's buildings, opening by `SPEED_VIEW` seconds of whatever you are moving at,
 * and to the horizon in the air, clamped to [`MIN_VIEW`, `MAX_VIEW`]. It turns
 * with the camera (what is ahead on the screen is up the disc) and an `N`
 * rides round the rim to say where north went. The country as a shape is the
 * map behind `M`'s; this one is steered by.
 *
 * On the disc: the roads as ink-cased lines, the built places as dots sized by
 * `radiusOf`, the rockets' pads, and the landmarks as pins. Under all of it,
 * where the sheet's paper is shared (`map-tiles.ts`), the tiles are
 * reprojected onto the disc a piece at a time (`drawTiles`) and the outlines
 * are the coast's and the frontiers' ink alone; without a paper the countries
 * are filled flat. While the player has a marker (`navigation.ts`) the rim
 * carries a violet wedge pointing at it, and a violet pin where it is on the disc;
 * while a ring course is shown, its waiting ring is a green ring on the disc,
 * or a green wedge on the rim (`setCourse`, drawn over the paper).
 *
 * The land, the towns and the pins are geography: they move when you move and
 * not when you turn, so they are drawn into their own buffer (the paper) and
 * a turn costs one `drawImage` and one arrow. The paper is redrawn at a rate
 * set by what drawing it costs (`BASE_GAP`) and carried by the camera in
 * between.
 *
 * The basis is `cartography.ts`'s: `setFrame` is the one definition of which
 * way round a map's screen goes.
 *
 * The state is one `MinimapState` (`minimap/state.ts`); each module of
 * `minimap/` is a set of functions over it.
 */
import type * as THREE from 'three';
import type { World } from './geo.ts';
import { createState } from './minimap/state.ts';
import { updateMinimap } from './minimap/update.ts';
import type { Minimap, MinimapOptions } from './minimap/types.ts';

export type {
  Minimap,
  MinimapHere,
  MinimapMonument,
  MinimapOptions,
  MinimapPad,
  MinimapStats,
} from './minimap/types.ts';

/**
 * @param options a bare number is read as `size`.
 */
export function createMinimap(world: World, options: MinimapOptions | number = {}): Minimap {
  const m = createState(world, options);
  return {
    canvas: m.canvas,
    update: (position: THREE.Vector3, forward: THREE.Vector3, here, look) => updateMinimap(m, position, forward, here, look),
    setMarker(direction) {
      m.marked = direction !== null;
      if (direction !== null) {
        m.markerPoint.x = direction.x;
        m.markerPoint.y = direction.y;
        m.markerPoint.z = direction.z;
      }
      // The disc skips redraws while you stand still, and placing a marker is
      // exactly something you do standing still.
      m.baseStale = true;
      m.overlayStale = true;
    },
    setCourse(ring, finish = false) {
      if (ring === null) {
        if (m.coursed) m.overlayStale = true;
        m.coursed = false;
        return;
      }
      const length = Math.hypot(ring.x, ring.y, ring.z) || 1;
      const point = m.coursePoint;
      const x = ring.x / length;
      const y = ring.y / length;
      const z = ring.z / length;
      if (!m.coursed || finish !== m.courseFinish || x !== point.x || y !== point.y || z !== point.z) m.overlayStale = true;
      m.coursed = true;
      m.courseFinish = finish;
      point.x = x;
      point.y = y;
      point.z = z;
    },
    get span() {
      return m.view;
    },
    invalidate() {
      m.baseStale = true;
      m.overlayStale = true;
    },
    setPeers(marks) {
      if (marks.length > 0 || m.peerMarks.length > 0) m.overlayStale = true;
      m.peerMarks = marks;
    },
    get stats() {
      const sorted = Array.from(m.samples.subarray(0, m.sampleCount)).sort((a, b) => a - b);
      return {
        view: Number((m.view * m.RADIUS).toFixed(1)),
        km: Number((m.view * m.RADIUS_KM).toFixed(1)),
        rings: m.drawnRings,
        points: m.drawnPoints,
        level: m.drawnLevel,
        places: m.drawnPlaces,
        pins: m.drawnPins,
        pads: m.drawnPads,
        tiles: m.drawnTiles,
        tileLevel: m.tileLevel,
        medianMs: Number((sorted[sorted.length >> 1] ?? 0).toFixed(3)),
        worstMs: Number((sorted[sorted.length - 1] ?? 0).toFixed(3)),
        baseMs: Number(m.baseMs.toFixed(3)),
      };
    },
    dispose() {
      m.canvas.remove();
      m.peerMarks = [];
    },
  };
}
