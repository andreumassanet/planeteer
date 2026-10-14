/**
 * The soundscape (`audio.ts`), its saved settings, and the music, which is
 * fetched on the first gesture that opens the sound and only if it is on.
 * The settings rows here are shared by the title's card and the world's.
 */
import { createAudio } from '../audio.ts';
import type { Audio } from '../audio.ts';
import type { Music, MusicMoment } from '../music.ts';
import type { SettingsOptions } from '../settings.ts';
import type { WeatherView } from '../weather-view.ts';
import { MUSIC_KEY, SOUND_KEY, VOICES_KEY, WEATHER_KEY, readSetting, writeSetting } from './storage.ts';

export interface Sound {
  audio: Audio;
  /** Whether townsfolk speak aloud, and whether a chat line blips. */
  voices: { voices: boolean; chat: boolean };
  musicSettings: { volume: number; on: boolean };
  /** The music, once it has loaded. */
  readonly music: Music | null;
  readonly musicLoading: boolean;
  /** A style asked for from the console before the music arrived. */
  musicAsked: string | null;
  /** Where the music thinks the player is, filled by the loop. */
  musicMoment: MusicMoment;
  loadMusic(): void;
  soundRows: NonNullable<SettingsOptions['sound']>;
  musicRows: NonNullable<SettingsOptions['music']>;
}

/** Reads a stored JSON object, or null when absent or mangled. */
function readJson<T>(key: string): Partial<T> | null {
  try {
    return JSON.parse(readSetting(key) ?? 'null') as Partial<T> | null;
  } catch {
    return null;
  }
}

export function createSound(weather: WeatherView): Sound {
  // Silent until a gesture unlocks it, which every pointer and key press offers.
  const audio = createAudio();
  const savedSound = readJson<{ volume: unknown; on: unknown }>(SOUND_KEY);
  if (savedSound !== null && typeof savedSound.volume === 'number') audio.volume = savedSound.volume;
  if (savedSound !== null && typeof savedSound.on === 'boolean') audio.muted = !savedSound.on;
  const saveSound = (): void => writeSetting(SOUND_KEY, JSON.stringify({ volume: audio.volume, on: !audio.muted }));

  const voices = { voices: true, chat: true };
  const savedVoices = readJson<{ voices: unknown; chat: unknown }>(VOICES_KEY);
  if (savedVoices !== null && typeof savedVoices.voices === 'boolean') voices.voices = savedVoices.voices;
  if (savedVoices !== null && typeof savedVoices.chat === 'boolean') voices.chat = savedVoices.chat;
  const saveVoices = (): void => writeSetting(VOICES_KEY, JSON.stringify(voices));

  const musicSettings = { volume: 0.6, on: true };
  const savedMusic = readJson<{ volume: unknown; on: unknown }>(MUSIC_KEY);
  if (savedMusic !== null && typeof savedMusic.volume === 'number') musicSettings.volume = Math.min(1, Math.max(0, savedMusic.volume));
  if (savedMusic !== null && typeof savedMusic.on === 'boolean') musicSettings.on = savedMusic.on;
  const saveMusic = (): void => writeSetting(MUSIC_KEY, JSON.stringify(musicSettings));

  let music: Music | null = null;
  let musicLoading = false;
  const sound: Sound = {
    audio,
    voices,
    musicSettings,
    get music() {
      return music;
    },
    get musicLoading() {
      return musicLoading;
    },
    musicAsked: null,
    musicMoment: {
      mode: 'foot', height: 0, iso: '', continent: '', lat: 0, lon: 0, daylight: 1, town: false, place: 0, hour: 12,
    },
    loadMusic,
    soundRows: {
      volume: {
        get: () => audio.volume,
        set: (value) => {
          audio.volume = value;
          saveSound();
          return audio.volume;
        },
        min: 0.05,
        max: 1,
      },
      on: {
        get: () => !audio.muted,
        set: (on) => {
          audio.muted = !on;
          saveSound();
          return on;
        },
      },
      voices: {
        get: () => voices.voices,
        set: (on) => {
          voices.voices = on;
          saveVoices();
          return on;
        },
      },
      chat: {
        get: () => voices.chat,
        set: (on) => {
          voices.chat = on;
          saveVoices();
          return on;
        },
      },
    },
    musicRows: {
      volume: {
        get: () => musicSettings.volume,
        set: (value) => {
          musicSettings.volume = Math.min(1, Math.max(0, value));
          if (music !== null) music.volume = musicSettings.volume;
          saveMusic();
          return musicSettings.volume;
        },
        min: 0.05,
        max: 1,
      },
      on: {
        get: () => musicSettings.on,
        set: (on) => {
          musicSettings.on = on;
          if (music !== null) music.on = on;
          else loadMusic();
          saveMusic();
          return on;
        },
      },
    },
  };

  function loadMusic(): void {
    const out = audio.output;
    if (music !== null || musicLoading || !musicSettings.on || out === null) return;
    musicLoading = true;
    import('../music.ts')
      .then(({ createMusic }) => {
        music = createMusic(out.context, out.node, musicSettings);
        if (sound.musicAsked !== null) music.play(sound.musicAsked);
      })
      .catch(() => {
        // No music is silence, not an error; the next gesture tries again.
        musicLoading = false;
      });
  }

  weather.onThunder = (delay, loudness) => audio.thunder(delay, loudness);
  weather.enabled = readSetting(WEATHER_KEY) !== '0';
  const unlockAudio = (): void => {
    audio.unlock();
    loadMusic();
  };
  addEventListener('pointerdown', unlockAudio, { capture: true });
  addEventListener('keydown', unlockAudio, { capture: true });
  return sound;
}
