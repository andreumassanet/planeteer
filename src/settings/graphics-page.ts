/** The graphics page: render distance, resolution, what is drawn in the world, the hour of the sun. */
import { labelOf } from '../controls.ts';
import { h } from '../ui.ts';
import { detailWord, hourText } from './format.ts';
import type { SettingsOptions } from './types.ts';
import { section, type Widgets } from './widgets.ts';

export function createGraphicsPage(options: SettingsOptions, w: Widgets, signal: AbortSignal) {
  const { labelled, row, makeSwitch, makeSlider, makeChoice } = w;
  // The switch says what the knob is doing, and the slider says it too: on, the value reads *auto*.
  const autoToggle = options.autoDetail;
  const autoDetail = autoToggle === undefined ? null : makeSwitch({
    get: autoToggle.get,
    set: (on) => {
      const set = autoToggle.set(on);
      detail.refresh();
      return set;
    },
  }, 'Automatic render distance');
  const detail = makeSlider(
    {
      ...options.detail,
      // A hand on the slider is a choice, and `setDetail` turns the automatic knob off; the switch has to say so at once.
      set: (value) => {
        const set = options.detail.set(value);
        autoDetail?.refresh();
        return set;
      },
    },
    'Render distance',
    (v) => [
      options.detailDistance === undefined ? detailWord(v) : `${detailWord(v)} · ${options.detailDistance(v)}`,
      `${v.toFixed(2)}×${autoToggle?.get() === true ? ' · auto' : ''}`,
    ],
  );
  const performance = makeSwitch(options.performance, 'Performance overlay');
  const effects = options.effects === undefined ? null : makeSwitch(options.effects, 'Effects');
  const shake = options.shake === undefined ? null : makeSwitch(options.shake, 'Camera shake');
  const weather = options.weather === undefined ? null : makeSwitch(options.weather, 'Weather');
  const flags = makeSwitch(options.flags, 'Flags and borders');
  const speedUnit = options.units === undefined ? null : makeChoice(options.units.speed, 'Speed units');
  const nautical = options.units === undefined ? null : makeSwitch(options.units.nautical, 'Knots on water and in the air');

  const resolution = makeChoice(options.resolution, 'Resolution');
  const graphics = options.graphics === undefined ? null : makeChoice(options.graphics, 'Graphics');

  /** The time of day: a slider over the hour where you stand, a button back to the real one, and the time-lapse. */
  const time = options.time;
  const timeValue = h('div', { class: 'atlas-settings-value' });
  const timeLive = h('button', { class: 'ui-btn small', type: 'button', text: 'Live' });
  const timeInput = h('input', { class: 'ui-range', type: 'range', min: 0, max: 96, step: 1, 'aria-label': 'Hour of the day' });
  const timeFast = time === undefined ? null : makeSwitch(time.fast, 'Time-lapse');
  /** `chosen` is the hour just picked, which the chip's clock shows only from the next frame. */
  const showTime = (chosen?: number): void => {
    if (time === undefined) return;
    const hour = chosen ?? time.hour();
    const live = time.live();
    timeValue.replaceChildren(document.createTextNode(hourText(hour)), h('small', { text: live ? 'live' : 'chosen' }));
    timeLive.disabled = live;
    if (document.activeElement !== timeInput) timeInput.value = String(Math.round(hour * 4) % 96);
    timeInput.style.setProperty('--fill', `${((Number(timeInput.value) / 96) * 100).toFixed(1)}%`);
    timeFast?.refresh();
  };
  if (time !== undefined) {
    timeInput.addEventListener('input', () => {
      showTime(time.setHour(Number(timeInput.value) / 4));
    }, { signal });
    timeLive.addEventListener('click', () => {
      time.setLive();
      showTime();
    }, { signal });
  }

  // The two rows whose help names a key, written again when the key moves.
  const detailRow = labelled('Render distance', '…');
  const flagsRow = labelled('Flags and borders from the air', '…');

  const sections = [

    section(
      'Quality',
      h('div', { class: 'atlas-settings-row' }, detailRow.label, h('div', { class: 'atlas-settings-side' }, detail.value, detail.input)),
      autoDetail === null
        ? null
        : row('Automatic distance', 'Turns the render distance up while frames are to spare and down when they drop. Moving the slider, or a render distance key, takes over and turns this off.', autoDetail.element),
      row('Resolution', "Auto is the screen's own sharpness, up to twice the pixels. Balanced stops at one and a half; Fast is the lightest.", resolution.element),
      graphics === null
        ? null
        : row('Graphics', 'Ultra draws brick, stone, tiles and paving with their relief, rooms behind the windows, waves on the water, rock on the slopes and a soft distance. Standard is the plain look and lighter.', graphics.element),
    ),
    section(
      'In the world',
      effects === null ? null : row('Effects', 'Wakes, engine smoke, dust off wheels and feet, splashes and the debris of a crash.', effects.element),
      weather === null ? null : row('Weather', 'Rain, snow, storms and fog where the climate brings them. Off is clear skies; winter snow on the ground stays.', weather.element),
      shake === null ? null : row('Camera shake', 'A knock through the camera when you crash. Off by default if your system asks for less motion.', shake.element),
      h('div', { class: 'atlas-settings-row' }, flagsRow.label, h('div', { class: 'atlas-settings-side' }, flags.element)),
    ),
    time === undefined
      ? null
      : section(
          'Sky',
          row('Time of day', 'Live is the real sun where you stand. Drag to choose another hour; it runs on from there until you reload.', timeLive, timeValue, timeInput),
          row('Time-lapse', 'The day at an hour a minute: sun, sky, lights and traffic. Until you reload.', timeFast!.element),
        ),
    section(
      'On screen',
      speedUnit === null ? null : row('Speed units', 'What the speedometer reads in while you drive, ride, sail or fly.', speedUnit.element),
      nautical === null ? null : row('Knots on water and in the air', 'Boats and aircraft read in knots, whatever the roads read in; the altitude is then in feet.', nautical.element),
      row('Performance overlay', 'Frames per second, what a frame costs and the triangles drawn, in the corner.', performance.element),
    ),

  ];
  return {
    sections,
    refresh(): void {
      detail.refresh();
      autoDetail?.refresh();
      performance.refresh();
      effects?.refresh();
      shake?.refresh();
      weather?.refresh();
      speedUnit?.refresh();
      nautical?.refresh();
      flags.refresh();
      resolution.refresh();
      graphics?.refresh();
      showTime();
    },
    /** The automatic knob and the clock move while the card is up. */
    tick(): void {
      showTime();
      detail.refresh();
      autoDetail?.refresh();
    },
    /** What names a key, written again when the layout or a binding changes. */
    relabel(): void {
      detailRow.bubble.textContent = `How far towns, trees, traffic and animals are built around you. Turn it down if the frame rate drops. Also ${labelOf('nearer')} and ${labelOf('farther')}.`;
      flagsRow.bubble.textContent = `Each country's colour, its frontiers and its name fade in as you climb. Also ${labelOf('flags')}.`;
    },
  };
}
