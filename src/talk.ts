/**
 * Talking to the townsfolk: `E` beside somebody standing in a town, and they
 * stop, turn to you and say something in the language of their country, with
 * the English under it.
 *
 * What they say is about where they are and who is saying it (`compose` in
 * `talk/compose.ts`): a hello for the hour, a few things about the place drawn
 * by weight, and a goodbye; a child, a grump, an elder or a chatterbox talks
 * differently, drawn from the person's key. `Memory` is what the session
 * remembers so a second word with somebody is a different one.
 *
 * The words arrive on the first conversation: `phrases.ts` says which language
 * a country speaks and each language is a module of its own, fetched on demand
 * with the country facts, so nothing of it is in the world's first load. This
 * file therefore never imports a language statically.
 *
 * The line is a small card over the speaker (`talk/bubble.ts`), placed each
 * frame by projecting their crown. With voices on, each line is said as it
 * appears (`voice.ts`) and the bubble types it out in step with the syllables.
 * `E` during a line finishes it; the next `E` goes on; after the goodbye it closes.
 */
import * as THREE from 'three';
import { loadCountryFacts } from './country-facts.ts';
import { languageOf, loadLanguage } from './phrases.ts';
import { planSpeech, revealed, speak, SPEECH_LEAD, voiceOf } from './voice.ts';
import type { Speech, Utterance, Voice } from './voice.ts';
import { compose, createMemory } from './talk/compose.ts';
import type { Line, Memory, Persona, Script, Where } from './talk/compose.ts';
import { createBubble } from './talk/bubble.ts';

export { compose, createMemory, personaOf } from './talk/compose.ts';
export type { Line, Memory, Persona, Script, Where } from './talk/compose.ts';
export { createBubble } from './talk/bubble.ts';
export type { Bubble, BubbleLine } from './talk/bubble.ts';

/** Where a line is said, when it is said aloud at all. */
export interface TalkOptions {
  /**
   * The context and the node a voice joins (`Audio.bus`), or null while the
   * voices are off or the sound is not open yet: then a line appears whole.
   */
  voice?: () => { context: BaseAudioContext; node: AudioNode } | null;
}

export interface Talk {
  /** Whether a bubble is up, or on its way up. */
  readonly open: boolean;
  /** Who is being talked to, or null. */
  readonly with: string | null;
  /** Starts a conversation with `key`, about `where`. */
  start(key: string, where: Where): void;
  /** The next line, or the end of the conversation after the last. */
  next(): void;
  close(): void;
  /**
   * Once a frame: puts the bubble over `crown` (a world point) as `camera`
   * sees it on a `width` by `height` view, or hides it where it is behind.
   */
  place(crown: THREE.Vector3, camera: THREE.Camera, width: number, height: number): void;
  /**
   * A conversation's lines for a person, without the page: what
   * `atlas.talk.script` shows. With no `memory`, as if to a stranger met for
   * the first time.
   */
  script(key: string, where: Where, memory?: Memory): Promise<Script>;
  /** Ends any conversation and takes the bubble off the page. */
  dispose(): void;
}

/** The voice a persona speaks in: its age, and a grump's or a chatterbox's manner. */
function voiceFor(key: string, persona: Persona, woman: boolean): Voice {
  const age = persona === 'child' ? 'child' : persona === 'elder' ? 'elder' : 'adult';
  const mood = persona === 'grumpy' ? 'grumpy' : persona === 'chatty' ? 'chatty' : 'plain';
  return voiceOf(key, age, woman, mood);
}

export function createTalk(options: TalkOptions = {}): Talk {
  const bubble = createBubble();

  /** This session's conversations, which is all the townsfolk remember of you. */
  const memory = createMemory();
  let lines: Line[] = [];
  let at = 0;
  let who: string | null = null;
  /** The speaker's voice, the line being said, and when it began, from `performance.now()`. */
  let voice: Voice | null = null;
  let speech: Speech | null = null;
  let utterance: Utterance | null = null;
  let spokenAt = 0;
  /** The language the lines are in, as the foot names it, its tag and its direction. */
  let speaks = '';
  let locale = '';
  let rtl = false;
  /** Bumped by every start and close, so a script that arrives late for a conversation already over is dropped. */
  let generation = 0;
  const projected = new THREE.Vector3();

  function hush(): void {
    utterance?.stop();
    utterance = null;
    speech = null;
  }

  function show(): void {
    const line = lines[at]!;
    hush();
    const out = voice === null ? null : options.voice?.() ?? null;
    const typed = out !== null && voice !== null;
    if (out !== null && voice !== null) {
      speech = planSpeech(line.said, voice, `${who ?? ''}:${at}`);
      utterance = speak(out.context, out.node, speech, voice);
      spokenAt = performance.now() + SPEECH_LEAD * 1000;
    }
    const last = at === lines.length - 1;
    bubble.show(speaks, line.said, line.meant, { action: last ? 'Close' : 'Next', lang: locale, rtl, typed });
  }

  /**
   * The conversation's lines, composed once its words have arrived. `current`
   * says whether the conversation is still wanted by then: composing writes
   * the memory (who was met, what was told), so a conversation walked away
   * from while its language was loading must not be remembered as held.
   */
  async function script(
    key: string,
    where: Where,
    remembered: Memory = createMemory(),
    current: () => boolean = () => true,
  ): Promise<Script | null> {
    const [language, facts] = await Promise.all([
      loadLanguage(languageOf(where.iso).code),
      loadCountryFacts().catch(() => ({}) as Awaited<ReturnType<typeof loadCountryFacts>>),
    ]);
    if (!current()) return null;
    return compose(language, facts[where.iso]?.capital, key, where, remembered);
  }

  function close(): void {
    generation++;
    hush();
    who = null;
    lines = [];
    bubble.hide();
  }

  return {
    get open() {
      return who !== null;
    },
    get with() {
      return who;
    },
    start(key, where) {
      const mine = ++generation;
      who = key;
      lines = [];
      bubble.hide();
      script(key, where, memory, () => mine === generation)
        .then((result) => {
          if (result === null || mine !== generation) return;
          lines = result.lines;
          at = 0;
          voice = voiceFor(key, result.persona, where.woman === true);
          speaks = result.language;
          locale = result.locale;
          rtl = result.rtl;
          show();
        })
        .catch((error: unknown) => {
          console.warn('talk: nothing to say', error);
          if (mine === generation) close();
        });
    },
    next() {
      // Still on its way: the key is not lost, it simply waits for the words.
      if (lines.length === 0) return;
      // Mid-line: the rest of it at once, and the next `E` goes on.
      if (bubble.shown < bubble.length) {
        hush();
        bubble.reveal(bubble.length);
        return;
      }
      if (at >= lines.length - 1) {
        close();
        return;
      }
      at++;
      show();
    },
    close,
    place(crown, camera, width, height) {
      if (who === null || lines.length === 0) return;
      if (speech !== null) {
        bubble.reveal(revealed(speech, (performance.now() - spokenAt) / 1000));
        if (bubble.shown >= bubble.length) speech = null;
      }
      projected.copy(crown).project(camera);
      const behind = projected.z > 1 || projected.z < -1;
      // Clear of the head by a few pixels, and kept on the screen.
      const x = THREE.MathUtils.clamp((projected.x + 1) * 0.5 * width, 16, width - 16);
      const y = THREE.MathUtils.clamp((1 - projected.y) * 0.5 * height - 14, 60, height);
      bubble.place(x, y, !behind);
    },
    dispose() {
      close();
      bubble.dispose();
    },
    // Nothing to cancel from the console: the script is always wanted.
    script: (key, where, memory) => script(key, where, memory).then((result) => result!),
  };
}
