/**
 * The map layer: each country's colour over its land, the dashed frontiers
 * and the names. All three fade in together with altitude, so none shows on
 * foot (`OVERLAY_LOW` clears every hill and a takeoff) and by `OVERLAY_HIGH`
 * a country is a shape on the screen rather than a horizon. `B` turns the
 * whole layer off, and that choice is kept.
 */
import { landFlags } from '../globe.ts';
import type { FlagLayer } from '../land-flags.ts';
import type { App } from './context.ts';
import type { Tick } from './frame/tick.ts';
import { OVERLAY_KEY, readSetting, writeSetting } from './storage.ts';

/** Where the layer starts and finishes fading in, in units of camera height over the ground. */
const OVERLAY_LOW = 500;
const OVERLAY_HIGH = 2500;
/** Ms per frame spent building the flag attribute (11 MB, built once in slices under the fade). */
const FLAG_BUILD_MS = 4;

const DEG = Math.PI / 180;

const smoothstep = (edge0: number, edge1: number, x: number): number => {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

export interface Overlay {
  readonly on: boolean;
  /** Turns the layer on or off and keeps the choice. */
  set(on: boolean): boolean;
  /** The last fade, for `atlas.flags()`. */
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
  let fade = 0;
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
      return fade;
    },
    get flagLayer() {
      return flagLayer;
    },
    setCeiling(ceiling) {
      flagCeiling = ceiling;
      flagLayer?.setCeiling(ceiling);
    },
    update(tick) {
      fade = on ? smoothstep(OVERLAY_LOW, OVERLAY_HIGH, tick.eyeOverGround) : 0;
      if (fade > 0) askFlags();
      if (flagLayer !== null) {
        if (!flagLayer.state.ready) flagLayer.build(FLAG_BUILD_MS);
        flagLayer.setFade(fade);
      }
      // A frontier width that holds one CSS pixel at the ground's range (the device ratio is left out on purpose).
      app.guard('borders', () =>
        borders.update(fade, (2 * Math.tan(rig.camera.fov * 0.5 * DEG) * tick.eyeOverGround) / innerHeight),
      );
      app.guard('names', () => app.names.update(fade, rig.camera, tick.standingIn));
    },
  };
}
