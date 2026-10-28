/**
 * What a ring sounds like going through it: a bell struck on a major
 * pentatonic, a step higher each ring of a course, an arpeggio for a course
 * flown or a landmark's ring taken. Synthesised into the effects' master, so
 * the volume and the switch hold it; silent until the audio is unlocked.
 */

/** The scale's steps in semitones, climbed one a ring and carried into the next octave. */
const PENTATONIC = [0, 2, 4, 7, 9];
/** The first ring's note, Hz: the A over middle C. */
const ROOT = 440;
/** Seconds a note rings for. */
const RING_TIME = 0.55;

export interface Chime {
  /** The `n`th ring of a course, from 0. */
  ring(n: number): void;
  /** A landmark's ring taken, or a course flown. */
  fanfare(): void;
  /** A ring passed by: two notes falling. */
  miss(): void;
}

function pitchOf(step: number): number {
  const octave = Math.floor(step / PENTATONIC.length);
  const semitones = PENTATONIC[step % PENTATONIC.length]! + 12 * octave;
  return ROOT * 2 ** (semitones / 12);
}

export function createChime(bus: () => GainNode | null): Chime {
  /** One bell: a sine and its octave's triangle, struck and left to ring. */
  function strike(frequency: number, delay: number, level: number): void {
    const out = bus();
    if (out === null) return;
    const context = out.context;
    const at = context.currentTime + delay;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(level, at + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + RING_TIME);
    gain.connect(out);
    for (const [type, multiple, share] of [['sine', 1, 1], ['triangle', 2, 0.35], ['sine', 3.01, 0.12]] as const) {
      const oscillator = context.createOscillator();
      const voice = context.createGain();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency * multiple, at);
      voice.gain.value = share;
      oscillator.connect(voice).connect(gain);
      oscillator.start(at);
      oscillator.stop(at + RING_TIME + 0.05);
      oscillator.onended = () => voice.disconnect();
    }
    setTimeout(() => gain.disconnect(), (delay + RING_TIME + 0.2) * 1000);
  }

  return {
    ring(n) {
      strike(pitchOf(Math.max(0, n)), 0, 0.22);
    },
    fanfare() {
      [0, 2, 4, 5, 7].forEach((step, i) => strike(pitchOf(step), i * 0.075, 0.2));
    },
    miss() {
      strike(ROOT * 0.5, 0, 0.16);
      strike(ROOT * 0.5 * 2 ** (-3 / 12), 0.12, 0.16);
    },
  };
}
