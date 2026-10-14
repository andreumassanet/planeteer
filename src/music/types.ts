/** The music's bus, the piece being played and the re-struck notes. */
import type { InstrumentId, Phrase, Piece, Role } from '../music-score.ts';

export interface Bus {
  gain: GainNode;
  send: GainNode;
  roles: Record<Role, StereoPannerNode>;
}

export interface Playing {
  piece: Piece;
  bus: Bus;
  index: number;
  phrase: Phrase;
  /** Context time the phrase started. */
  start: number;
  cursor: number;
  /** Seconds a beat. */
  spb: number;
}

/** A note being re-struck, one slot each, reused. */
export interface Tremolo {
  active: boolean;
  bus: Bus | null;
  instrument: InstrumentId;
  role: Role;
  pitch: number;
  velocity: number;
  next: number;
  end: number;
  count: number;
}
