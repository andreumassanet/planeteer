/** The sound page: the world's level, the voices and the music. */
import type { SettingsOptions } from './types.ts';
import { section, type Widgets } from './widgets.ts';

export function createSoundPage(options: SettingsOptions, w: Widgets) {
  const { row, makeSwitch, makeSlider } = w;
  const loudness = (v: number): [string, string] => [`${Math.round(v * 100)}%`, v > 0.75 ? 'loud' : v < 0.25 ? 'quiet' : 'default'];
  const sound = options.sound;
  const volume = sound === undefined ? null : makeSlider(sound.volume, 'Volume', loudness);
  const soundOn = sound === undefined ? null : makeSwitch(sound.on, 'Sound');
  const voicesOn = sound?.voices === undefined ? null : makeSwitch(sound.voices, 'Voices');
  const chatSound = sound?.chat === undefined ? null : makeSwitch(sound.chat, 'Chat sound');
  const music = options.music;
  const musicVolume = music === undefined ? null : makeSlider(music.volume, 'Music volume', loudness);
  const musicOn = music === undefined ? null : makeSwitch(music.on, 'Music');

  const sections = [

    sound === undefined
      ? null
      : section(
          'The world',
          row('Sound', 'Wind, sea, engines, footsteps and the interface.', soundOn!.element),
          row('Volume', 'How loud all of it is.', volume!.value, volume!.input),
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
          row('Music', 'Now and then, a tune in the style of the country you are in.', musicOn!.element),
          row('Music volume', 'How loud the music is, apart from everything else.', musicVolume!.value, musicVolume!.input),
        ),

  ];
  return {
    sections,
    /** A card without sound or music leaves the page out. */
    hidden: sound === undefined && music === undefined,
    refresh(): void {
      volume?.refresh();
      soundOn?.refresh();
      voicesOn?.refresh();
      chatSound?.refresh();
      musicVolume?.refresh();
      musicOn?.refresh();
    },
  };
}
