/** The sound page: the world's level, the voices and the music. */
import type { Knob, SettingsOptions, Toggle } from './types.ts';

/**
 * A level with its switch folded in, as every game has it: at 0% it is off,
 * and moved off 0% it is on again. A switch left off reads as 0%.
 */
/** A slider let down under this is off. */
const OFF_BELOW = 0.02;

function levelOf(level: Knob, on: Toggle): Knob {
  return {
    min: 0,
    max: level.max,
    get: () => (on.get() ? level.get() : 0),
    set(value) {
      const off = value <= OFF_BELOW;
      on.set(!off);
      return off ? 0 : level.set(Math.max(level.min, value));
    },
  };
}
import { section, type Widgets } from './widgets.ts';

export function createSoundPage(options: SettingsOptions, w: Widgets) {
  const { row, makeSwitch, makeSlider } = w;
  const loudness = (v: number): [string, string] => [`${Math.round(v * 100)}%`, v > 0.75 ? 'loud' : v < 0.25 ? 'quiet' : 'default'];
  const sound = options.sound;
  const loudnessOrOff = (v: number): [string, string] => (v <= 0 ? ['Off', 'silent'] : loudness(v));
  const volume = sound === undefined ? null : makeSlider(levelOf(sound.volume, sound.on), 'Volume', loudnessOrOff);
  const voicesOn = sound?.voices === undefined ? null : makeSwitch(sound.voices, 'Voices');
  const chatSound = sound?.chat === undefined ? null : makeSwitch(sound.chat, 'Chat sound');
  const music = options.music;
  const musicVolume = music === undefined ? null : makeSlider(levelOf(music.volume, music.on), 'Music', loudnessOrOff);

  const sections = [

    sound === undefined
      ? null
      : section(
          'The world',
          row('Volume', 'Wind, sea, engines, footsteps and the interface. At 0% there is none.', volume!.value, volume!.input),
        ),
    sound === undefined || (voicesOn === null && chatSound === null)
      ? null
      : section(
          'People',
          voicesOn === null ? null : row('Voices', 'Townsfolk say their lines aloud, each in a voice of their own.', voicesOn.element),
          chatSound === null ? null : row('Chat sound', 'A soft blip when somebody writes in the chat.', chatSound.element),
        ),
    music === undefined
      ? null
      : section(
          'Music',
          row('Music', 'Now and then, a tune in the style of the country you are in. At 0% there is none.', musicVolume!.value, musicVolume!.input),
        ),

  ];
  return {
    sections,
    /** A card without sound or music leaves the page out. */
    hidden: sound === undefined && music === undefined,
    refresh(): void {
      volume?.refresh();
      voicesOn?.refresh();
      chatSound?.refresh();
      musicVolume?.refresh();
    },
  };
}
