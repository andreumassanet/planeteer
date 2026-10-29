/**
 * The map layer: each country's colour over its land, the dashed frontiers,
 * and the names of the towns and of the countries, each on its own fade with
 * the height over the ground (`map-layer.ts`, which the other worlds read
 * too). `B` turns the whole layer off, and that choice is kept.
 */
import type * as THREE from 'three';
import { landFlags } from '../globe.ts';
import { layerFades, type LayerFades } from '../map-layer.ts';
import type { FlagLayer } from '../land-flags.ts';
import type { App } from './context.ts';
import type { Tick } from './frame/tick.ts';
import { OVERLAY_KEY, readSetting, writeSetting } from './storage.ts';

/** Ms per frame spent building the flag attribute (11 MB, built once in slices under the fade). */
const FLAG_BUILD_MS = 4;

const DEG = Math.PI / 180;

export interface Overlay {
  readonly on: boolean;
  /** Turns the layer on or off and keeps the choice. */
  set(on: boolean): boolean;
  /** The last colour fade, for `atlas.flags()`. */
  readonly fade: number;
  readonly flagLayer: FlagLayer | null;
  /** What a full fade blends to, set from the console before or after the layer exists. */
  setCeiling(ceiling: number): void;
  /** The frame's fade, the flag attribute's build, and the frontiers and names. */
  update(tick: Tick): void;
}

export function createOverlay(app: App): Overlay {
  const { world, land, borders, rig } = app;
  let on = readSetting(OVERLAY_KEY) !== '0';
  const fades: LayerFades = { colour: 0, frontier: 0, country: 0, town: 0 };
  // The flag attribute is not built until a fade first asks for it; its specs arrive with it (`globe.ts`).
  let flagLayer: FlagLayer | null = null;
  let flagAsked = false;
  let flagCeiling: number | null = null;
  function askFlags(): void {
    if (flagAsked) return;
    flagAsked = true;
    void landFlags(world, land)
      .then((layer) => {
        if (flagCeiling !== null) layer.setCeiling(flagCeiling);
        flagLayer = layer;
      })
      // The frontiers and names do not need it, so a failed fetch costs the colour alone.
      .catch((error: unknown) => console.warn('the flag layer did not load:', error));
  }

  return {
    get on() {
      return on;
    },
    set(value) {
      on = value;
      writeSetting(OVERLAY_KEY, value ? '1' : '0');
      return value;
    },
    get fade() {
      return fades.colour;
    },
    get flagLayer() {
      return flagLayer;
    },
    setCeiling(ceiling) {
      flagCeiling = ceiling;
      flagLayer?.setCeiling(ceiling);
    },
    update(tick) {
      layerFades(tick.eyeOverGround, on, fades);
      if (fades.colour > 0) askFlags();
      if (flagLayer !== null) {
        if (!flagLayer.state.ready) flagLayer.build(FLAG_BUILD_MS);
        flagLayer.setFade(fades.colour);
      }
      // A frontier width that holds one CSS pixel at the ground's range (the device ratio is left out on purpose).
      app.guard('borders', () =>
        borders.update(fades.frontier, (2 * Math.tan(rig.camera.fov * 0.5 * DEG) * tick.eyeOverGround) / innerHeight),
      );
      app.guard('names', () => app.names.update(fades, rig.camera, tick.standingIn, (app.scene.fog as THREE.Fog | null)?.far));
    },
  };
}
