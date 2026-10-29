/**
 * The whole planet on one sheet, behind `M`.
 *
 * A flat Miller-cylindrical map (north up, wrapping east to west) that drags
 * and zooms from the whole world down to the streets round a town. It
 * decides nothing itself: a click puts the player's one marker down through
 * `navigation.ts`, and a player clicked goes to `onJoin`.
 *
 * The ground is drawn from the tiles it shares with the minimap
 * (`map-tiles.ts`); what has to stay crisp (coast and frontiers, roads,
 * names, pins, pads, ring courses, players, you) is vector work over them, on two canvases:
 * the sheet, redrawn when the view, a tile, the destination or the names
 * change, and the marks over it, which is all a flight with the map open
 * redraws. Painting yields to the frame (`TILE_BUDGET_MS`). The world keeps
 * running while it is open; pointer lock is released for a cursor and asked
 * back on close.
 *
 * The state lives in one `MapSheet` (`map/sheet.ts`) and each module of
 * `map/` is a set of functions over it.
 */
import type * as THREE from 'three';
import type { World } from './geo.ts';
import { uOf, vOf } from './map-tiles.ts';
import { createSheet } from './map/create-sheet.ts';
import { attachControls, attachPointer } from './map/pointer.ts';
import { attachWindowEvents, hide, show } from './map/lifecycle.ts';
import { updateSheet } from './map/update.ts';
import { clampView, resize } from './map/view.ts';
import type { WorldMap, WorldMapOptions } from './map/types.ts';

export type { MapCourse, MapCourseSite, MapMarker, MapPad, MapPeer, WorldMap, WorldMapOptions, WorldMapStats } from './map/types.ts';

export function createWorldMap(world: World, options: WorldMapOptions): WorldMap {
  const s = createSheet(world, options);
  attachPointer(s);
  attachControls(s);
  attachWindowEvents(s);

  return {
    root: s.root,
    get open() {
      return s.showing;
    },
    toggle() {
      if (s.showing) hide(s);
      else show(s);
    },
    show: () => show(s),
    hide: (relock?: boolean) => hide(s, relock),
    focus(lat, lon, degreesAcross) {
      if (s.width === 0) resize(s);
      s.cu = uOf(lon);
      s.cv = vOf(lat);
      if (degreesAcross !== undefined) s.S = (s.width * 360) / degreesAcross;
      s.zoomSet = true;
      clampView(s);
      s.dirty = true;
    },
    get stats() {
      const paper = s.mapTiles.stats;
      return {
        tiles: paper.ready,
        pending: paper.pending,
        pixelsPerDegree: s.S / 360,
        level: s.level,
        drawMs: s.drawMs,
        marksMs: s.marksMs,
      };
    },
    update: (position: THREE.Vector3, forward: THREE.Vector3) => updateSheet(s, position, forward),
    dispose() {
      s.events.abort();
      if (s.ownTiles) s.mapTiles.dispose();
      else s.mapTiles.want('map', []);
      s.root.remove();
    },
  };
}
