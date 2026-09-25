/**
 * Voices: the babble a townsperson speaks a line in, and the chat's blip.
 *
 * **Nobody here says real words aloud, and that is the style rather than a
 * shortcut.** A line is in the country's own language with the English under
 * it, in thirty-odd languages; a recorded or synthesised reading of each would
 * be megabytes and a text-to-speech engine besides, and it would still be the
 * wrong voice for a comic-book world. What the games this world's look comes
 * from do instead is babble: a blip a syllable, pitched and timed like
 * speech, that says *somebody is talking, and this is how they sound* and
 * leaves the words to the bubble. So each syllable of the line as written is
 * one short vowel sound — the vowel it actually has where the script says
 * (`a`, `e`, `i`, `o`, `u` shaped by two formant filters), a character's
 * worth where it does not — the pitch wandering a little and rising into a
 * question or falling at a full stop, and the bubble types the line out in
 * step with it.
 *
 * **Who is talking is heard.** The pitch, the pace and the size of the
 * throat are drawn from the person's key, inside the range of who they are:
 * a child high and quick, an old man low and slow, a grump lower and
 * clipped, a chatterbox quicker. The same person sounds the same on every
 * visit.
 *
 * **Cheap by construction.** An utterance is one oscillator, one noise source
 * for the consonants and four filters and gains, whatever its length: every
 * syllable is a point on their automation timelines, written once when the
 * line starts, so nothing runs per frame and nothing is made per syllable.
 * `planSpeech` is the pure half — the syllables, their times and their
 * pitches — which `scripts/check-chat.ts` holds to its rules under Node.
 */
import { rngFrom } from './scenery/random.ts';

/** How old a voice sounds. */
export type VoiceAge = 'child' | 'adult' | 'elder';

/** How a person's talk is drawn: `Persona` in `talk.ts`, as far as the ear is concerned. */
export type VoiceMood = 'plain' | 'grumpy' | 'chatty';

export interface Voice {
  /** The pitch the syllables centre on, in Hz. */
  pitch: number;
  /** Syllables a second. */
  pace: number;
  /** The throat's size as a formant scale: 1 a man's, more a smaller one. */
  tract: number;
  /** How far the pitch wanders from one syllable to the next, as a fraction. */
  wander: number;
}

/**
 * The ranges each voice is drawn from, pitch in Hz and pace in syllables a
 * second. Pitched about an octave over speech, as the babble of every game
 * that does this is: a blip at a speaking voice's own pitch is a grunt.
 */
const PITCH: Readonly<Record<VoiceAge, readonly [man: readonly [number, number], woman: readonly [number, number]]>> = {
  child: [[340, 420], [360, 450]],
  adult: [[150, 200], [250, 320]],
  elder: [[120, 160], [205, 255]],
};
const PACE: Readonly<Record<VoiceAge, readonly [number, number]>> = {
  child: [8.5, 10],
  adult: [7, 8.5],
  elder: [5.2, 6.4],
};
/** A smaller throat puts the formants higher. */
const TRACT: Readonly<Record<VoiceAge, readonly [man: number, woman: number]>> = {
  child: [1.28, 1.3],
  adult: [1, 1.16],
  elder: [0.97, 1.12],
};

/** A person's voice, the same every time for the same key. */
export function voiceOf(key: string, age: VoiceAge, woman: boolean, mood: VoiceMood = 'plain'): Voice {
  const rng = rngFrom(key, 'voice');
  const [low, high] = PITCH[age][woman ? 1 : 0];
  const [slow, quick] = PACE[age];
  let pitch = rng.range(low, high);
  let pace = rng.range(slow, quick);
  let wander = rng.range(0.05, 0.1);
  if (mood === 'grumpy') {
    pitch *= 0.9;
    pace *= 0.92;
    wander *= 0.6;
  } else if (mood === 'chatty') {
    pace *= 1.15;
    wander *= 1.3;
  }
  return { pitch, pace, tract: TRACT[age][woman ? 1 : 0] * rng.range(0.97, 1.03), wander };
}

/** One blip: when, for how long, which vowel, at what pitch and how loud, and how much of the line it reveals. */
export interface Syllable {
  /** Seconds from the start of the line. */
  at: number;
  length: number;
  /** 0 a, 1 e, 2 i, 3 o, 4 u: `FORMANTS`. */
  vowel: number;
  /** A multiple of the voice's pitch. */
  pitch: number;
  /** A multiple of the voice's level. */
  gain: number;
  /** Whether it opens on a consonant, which gets a tick of noise. */
  onset: boolean;
  /** How many characters of the line (code points) are shown once it sounds. */
  end: number;
}

export interface Speech {
  syllables: Syllable[];
  /** Seconds, the last syllable's end. */
  duration: number;
  /** Characters in the line, as `Syllable.end` counts them. */
  length: number;
}

/** The longest a line is spoken: a long line past this many syllables is typed out at once to its end. */
const MAX_SYLLABLES = 80;
/** Pauses, in seconds: between words, at a comma, at the end of a sentence. */
const WORD_GAP = 0.035;
const COMMA_PAUSE = 0.16;
const STOP_PAUSE = 0.3;
/** How the last three syllables of a sentence move: up into a question, down to a full stop. */
const ASKING = [1.07, 1.15, 1.27];
const TELLING = [0.98, 0.93, 0.86];

/** Scripts written a syllable a character. */
const SYLLABIC = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Yi}]/u;
const LETTER = /[\p{L}\p{N}]/u;
/** The alphabets that write their vowels, whose syllables `VOWELS` can find. */
const ALPHABET = /[\p{Script=Latin}\p{Script=Cyrillic}\p{Script=Greek}\p{N}]/u;
const MARK = /\p{M}/u;
/** The vowels of the alphabets that write them, each as `FORMANTS` indexes it. */
const VOWELS: Readonly<Record<string, number>> = {
  a: 0, e: 1, i: 2, o: 3, u: 4, y: 2, æ: 0, ø: 3, œ: 1,
  а: 0, я: 0, е: 1, э: 1, є: 1, ё: 3, и: 2, ы: 2, і: 2, ї: 2, о: 3, у: 4, ю: 4,
  α: 0, ε: 1, η: 2, ι: 2, ο: 3, ω: 3, υ: 2,
};
const COMMA = /[,;:،、，；：]/u;
const STOP = /[.!?…。！？؟]/u;

/** The vowel a letter is, or -1: accents and case folded away first. */
function vowelOf(char: string): number {
  const base = char.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  return VOWELS[base] ?? -1;
}

/**
 * A line as the syllables it is spoken in. Pure: the same text, voice and
 * seed give the same speech.
 *
 * In an alphabet with vowels a syllable ends where a vowel is followed by a
 * consonant; in a script written a syllable a character, each character is
 * one; in the others — an abjad, an abugida — every two letters are. Words
 * are parted by a breath and sentences by a pause, and the last three
 * syllables before a `?` rise and before a `.` fall; a `!` is said higher and
 * louder throughout.
 */
export function planSpeech(text: string, voice: Voice, seed: string): Speech {
  const chars = Array.from(text);
  const rng = rngFrom(seed, 'speech');
  const syllables: Syllable[] = [];
  let t = 0;
  /** Where the sentence being said began, in `syllables`. */
  let sentence = 0;
  let wordStart = true;
  let i = 0;
  const say = (end: number, vowel: number, onset: boolean, letters: number): void => {
    const length = (rng.range(0.8, 1.05) * (letters > 3 ? 1.15 : 1)) / voice.pace;
    syllables.push({
      at: t,
      length,
      vowel,
      pitch: 1 + voice.wander * rng.jitter(),
      gain: (wordStart ? 1 : 0.82) * rng.range(0.9, 1),
      onset,
      end,
    });
    t += length;
    wordStart = false;
  };
  const endSentence = (mark: string): void => {
    const said = syllables.slice(sentence);
    if (mark === '?' || mark === '？' || mark === '؟') {
      said.slice(-3).forEach((s, k, last) => (s.pitch *= ASKING[k + 3 - last.length]!));
    } else if (mark === '!' || mark === '！') {
      for (const s of said) {
        s.pitch *= 1.08;
        s.gain *= 1.12;
      }
    } else {
      said.slice(-3).forEach((s, k, last) => (s.pitch *= TELLING[k + 3 - last.length]!));
    }
    sentence = syllables.length;
  };

  while (i < chars.length && syllables.length < MAX_SYLLABLES) {
    const char = chars[i]!;
    if (!LETTER.test(char)) {
      if (COMMA.test(char)) t += COMMA_PAUSE;
      else if (STOP.test(char)) {
        // A run of them is one stop: `?!`, `...`.
        if (syllables.length > sentence) endSentence(char);
        t += STOP_PAUSE;
      } else if (/\s/u.test(char)) t += WORD_GAP;
      if (!MARK.test(char)) wordStart = wordStart || /\s/u.test(char);
      i++;
      continue;
    }
    if (SYLLABIC.test(char)) {
      i++;
      while (i < chars.length && MARK.test(chars[i]!)) i++;
      say(i, char.codePointAt(0)! % 5, true, 1);
      continue;
    }
    // A run of letters up to the end of its first vowel group.
    const start = i;
    let vowel = -1;
    const alphabet = ALPHABET.test(char);
    while (i < chars.length && (LETTER.test(chars[i]!) || MARK.test(chars[i]!))) {
      const v = alphabet ? vowelOf(chars[i]!) : -1;
      if (vowel >= 0 && v < 0 && !MARK.test(chars[i]!)) {
        // A consonant after the vowels: this syllable ends before it, unless
        // it is the word's last, which the syllable keeps.
        const next = chars[i + 1];
        if (next !== undefined && LETTER.test(next)) break;
      }
      if (v >= 0 && vowel < 0) vowel = v;
      i++;
      // A script whose vowels this does not read: two letters a syllable.
      if (!alphabet && i - start >= 2) break;
    }
    const first = chars[start]!;
    say(i, vowel >= 0 ? vowel : first.codePointAt(0)! % 5, vowelOf(first) < 0, i - start);
  }
  if (syllables.length > sentence) endSentence('.');
  const last = syllables[syllables.length - 1];
  return { syllables, duration: last === undefined ? 0 : last.at + last.length, length: chars.length };
}

/** How many characters of a line are shown `seconds` into its speech. */
export function revealed(speech: Speech, seconds: number): number {
  if (seconds >= speech.duration) return speech.length;
  let shown = 0;
  for (const syllable of speech.syllables) {
    if (syllable.at > seconds) break;
    shown = syllable.end;
  }
  return shown;
}

/**
 * The first two formants of each vowel, a man's, in Hz: `a e i o u`. A
 * smaller throat scales them all up (`Voice.tract`).
 */
const FORMANTS: readonly (readonly [number, number])[] = [
  [730, 1090],
  [530, 1840],
  [290, 2250],
  [570, 840],
  [320, 870],
];

/**
 * A voice's peak, against the footsteps' 0.2 and the interface's 0.2 in
 * `audio.ts`: a band-passed sawtooth keeps a fraction of its energy, so the
 * envelope peaks higher than a recording's gain would. Set by reading the
 * synthesis rather than by ear.
 */
const VOICE_LEVEL = 0.55;
/** The consonant's tick, against the vowel's peak. */
const ONSET_LEVEL = 0.35;
/** The chat's blip, two soft notes. */
const BLIP_LEVEL = 0.06;

/** One line being said: `stop` cuts it short, at once and without a click. */
export interface Utterance {
  stop(): void;
}

/** A second of white noise per context, the consonants' source. */
const noises = new WeakMap<BaseAudioContext, AudioBuffer>();
function noiseOf(context: BaseAudioContext): AudioBuffer {
  let buffer = noises.get(context);
  if (buffer === undefined) {
    buffer = context.createBuffer(1, context.sampleRate, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    noises.set(context, buffer);
  }
  return buffer;
}

/** How far ahead of now a line starts, so its first syllable is not written into the past. */
export const SPEECH_LEAD = 0.03;

/** Says `speech` in `voice` into `destination`, starting `SPEECH_LEAD` from now. */
export function speak(context: BaseAudioContext, destination: AudioNode, speech: Speech, voice: Voice, level = 1): Utterance {
  const start = context.currentTime + SPEECH_LEAD;
  const end = start + speech.duration + 0.25;
  const out = context.createGain();
  out.gain.value = level;
  out.connect(destination);

  const source = context.createOscillator();
  source.type = 'sawtooth';
  const low = context.createBiquadFilter();
  low.type = 'bandpass';
  low.Q.value = 5;
  const high = context.createBiquadFilter();
  high.type = 'bandpass';
  high.Q.value = 7;
  const highGain = context.createGain();
  highGain.gain.value = 0.55;
  const envelope = context.createGain();
  envelope.gain.value = 0;
  source.connect(low).connect(envelope);
  source.connect(high).connect(highGain).connect(envelope);
  envelope.connect(out);

  const noise = context.createBufferSource();
  noise.buffer = noiseOf(context);
  noise.loop = true;
  const hiss = context.createBiquadFilter();
  hiss.type = 'highpass';
  hiss.frequency.value = 2800;
  const tick = context.createGain();
  tick.gain.value = 0;
  noise.connect(hiss).connect(tick).connect(out);

  for (const s of speech.syllables) {
    const at = start + s.at;
    const f0 = voice.pitch * s.pitch;
    const peak = VOICE_LEVEL * s.gain;
    source.frequency.setValueAtTime(f0, at);
    // Each syllable sags a little as it goes, which is what makes it a word.
    source.frequency.linearRampToValueAtTime(f0 * 0.94, at + s.length);
    const [f1, f2] = FORMANTS[s.vowel]!;
    low.frequency.setTargetAtTime(f1 * voice.tract, at, 0.012);
    high.frequency.setTargetAtTime(f2 * voice.tract, at, 0.012);
    envelope.gain.setValueAtTime(0, at);
    envelope.gain.linearRampToValueAtTime(peak, at + 0.014);
    envelope.gain.setTargetAtTime(0, at + s.length * 0.45, s.length * 0.2);
    if (s.onset) {
      tick.gain.setValueAtTime(0, at);
      tick.gain.linearRampToValueAtTime(peak * ONSET_LEVEL, at + 0.004);
      tick.gain.linearRampToValueAtTime(0, at + 0.028);
    }
  }
  source.start(start);
  noise.start(start);
  source.stop(end);
  noise.stop(end);
  let stopped = false;
  source.onended = () => out.disconnect();
  return {
    stop() {
      if (stopped) return;
      stopped = true;
      const now = context.currentTime;
      out.gain.cancelScheduledValues(now);
      out.gain.setValueAtTime(out.gain.value, now);
      out.gain.linearRampToValueAtTime(0, now + 0.04);
      try {
        source.stop(now + 0.05);
        noise.stop(now + 0.05);
      } catch {
        // Already stopped at its own end.
      }
    },
  };
}

/** A line arrived in the chat: two soft notes, a fifth apart. */
export function blip(context: BaseAudioContext, destination: AudioNode, level = 1): void {
  const start = context.currentTime + 0.01;
  const gain = context.createGain();
  gain.gain.value = 0;
  gain.connect(destination);
  const tone = context.createOscillator();
  tone.type = 'sine';
  tone.frequency.setValueAtTime(880, start);
  tone.frequency.setValueAtTime(1320, start + 0.07);
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(BLIP_LEVEL * level, start + 0.008);
  gain.gain.setTargetAtTime(0, start + 0.03, 0.02);
  gain.gain.setValueAtTime(0, start + 0.07);
  gain.gain.linearRampToValueAtTime(BLIP_LEVEL * level * 0.8, start + 0.078);
  gain.gain.setTargetAtTime(0, start + 0.1, 0.03);
  tone.connect(gain);
  tone.start(start);
  tone.stop(start + 0.3);
  tone.onended = () => gain.disconnect();
}
