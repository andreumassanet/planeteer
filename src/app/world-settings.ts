/**
 * The world's settings card. It owns no state: each row reads and writes a
 * value where it lives (the detail knob in `view.ts`, the map layer, the
 * input's sensitivity) and keeps it in storage.
 */
import { DETAIL_MAX, DETAIL_MIN, autoDetail, detail, setAutoDetail, setDetail } from '../view.ts';
import type { Settings } from '../settings.ts';
import type { App } from './context.ts';
import { QUALITIES, chosenQuality } from '../graphics-quality.ts';
import type { Quality } from '../graphics-quality.ts';
import { RESOLUTIONS } from './graphics.ts';
import { renderDistanceWords } from './render-distance.ts';
import {
  EFFECTS_KEY, GRAPHICS_KEY, HINTS_KEY, PERFORMANCE_KEY, RESOLUTION_KEY, SENSITIVITY_KEY, SHAKE_KEY, WEATHER_KEY,
  readSetting, writeSetting,
} from './storage.ts';

/** Fills `app.performanceOn` too, and applies the stored HUD and mouse settings. */
export async function createWorldSettings(app: App): Promise<Settings> {
  const { hud, input, effects, ambient, seaLife, weather, rig, overlay } = app;
  const { audio } = app.sound;
  app.performanceOn = readSetting(PERFORMANCE_KEY) === '1';
  hud.setPerformance(app.performanceOn);
  hud.setHints(readSetting(HINTS_KEY) !== '0');
  input.sensitivity = Number(readSetting(SENSITIVITY_KEY) ?? '1') || 1;
  let quality: Quality = readSetting(GRAPHICS_KEY) === 'standard' ? 'standard' : 'ultra';
  const applyQuality = (): void => {
    chosenQuality.value = quality === 'ultra' ? 1 : 0;
    app.post.dof = quality === 'ultra' ? 1 : 0;
  };
  applyQuality();
  const { createSettings } = await app.deferred.settings;
  const settings = createSettings({
    detail: { get: detail, set: setDetail, min: DETAIL_MIN, max: DETAIL_MAX },
    detailDistance: renderDistanceWords,
    autoDetail: {
      get: autoDetail,
      set: (on) => setAutoDetail(on),
    },
    flags: { get: () => overlay.on, set: (on) => overlay.set(on) },
    sensitivity: {
      get: () => input.sensitivity,
      set: (value) => {
        input.sensitivity = value;
        writeSetting(SENSITIVITY_KEY, value.toFixed(3));
        return input.sensitivity;
      },
      min: 0.3,
      max: 3,
    },
    effects: {
      get: () => effects.enabled,
      set: (on) => {
        effects.enabled = on;
        ambient.enabled = on;
        seaLife.enabled = on;
        writeSetting(EFFECTS_KEY, on ? '1' : '0');
        return on;
      },
    },
    weather: {
      get: () => weather.enabled,
      set: (on) => {
        weather.enabled = on;
        writeSetting(WEATHER_KEY, on ? '1' : '0');
        return on;
      },
    },
    shake: {
      get: () => rig.shakes,
      set: (on) => {
        rig.shakes = on;
        writeSetting(SHAKE_KEY, on ? '1' : '0');
        return on;
      },
    },
    performance: {
      get: () => app.performanceOn,
      set: (on) => {
        app.performanceOn = on;
        hud.setPerformance(on);
        writeSetting(PERFORMANCE_KEY, on ? '1' : '0');
        return on;
      },
    },
    hints: {
      get: () => hud.hints,
      set: (on) => {
        writeSetting(HINTS_KEY, on ? '1' : '0');
        return hud.setHints(on);
      },
    },
    resolution: {
      get: () => app.resolution,
      set: (value) => {
        app.resolution = RESOLUTIONS.find(([option]) => option === value)?.[0] ?? 'auto';
        writeSetting(RESOLUTION_KEY, app.resolution);
        app.resize();
        return app.resolution;
      },
      options: RESOLUTIONS,
    },
    graphics: {
      get: () => quality,
      set: (value) => {
        quality = QUALITIES.find(([option]) => option === value)?.[0] ?? 'ultra';
        writeSetting(GRAPHICS_KEY, quality);
        applyQuality();
        return quality;
      },
      options: QUALITIES,
    },
    time: app.timeOfDay,
    sound: app.sound.soundRows,
    music: app.sound.musicRows,
    lockTarget: app.renderer.domElement,
    // One card at a time: not over the world map.
    onOpen: () => {
      if (app.map.open) app.map.hide(false);
      audio.cue('ui-open');
    },
    onClose: () => audio.cue('ui-close'),
  });
  document.body.appendChild(settings.root);
  return settings;
}
