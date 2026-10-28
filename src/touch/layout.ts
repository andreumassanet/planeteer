/** Which buttons the touch pad draws for each travel mode. */
import type { Action, TravelMode } from '../controls.ts';

export interface PadButton {
  action: Action;
  glyph: string;
  label: string;
}

export interface PadLayout {
  /** The first is the big one under the thumb; at most two more beside it. */
  buttons: PadButton[];
  /** Whether a stick pushed past its rim is the run key: not where that key descends. */
  stickRuns: boolean;
  /** What `use` does here when nothing beside you offers more: getting out. */
  out: string | null;
}

const JUMP: PadButton = { action: 'jump', glyph: 'rise', label: 'Jump' };
const horn = (label = 'Horn'): PadButton => ({ action: 'horn', glyph: 'sound', label });
const up = (label: string): PadButton => ({ action: 'jump', glyph: 'rise', label });
const down = (label: string): PadButton => ({ action: 'descend', glyph: 'sink', label });
/** `Space` on wheels: the handbrake that starts a drift. */
const drift = (label = 'Drift'): PadButton => ({ action: 'jump', glyph: 'sparkle', label });

/** The cluster for a mode: `boardingHints`' lines, as buttons. */
export function layoutOf(mode: TravelMode, airborne: boolean, stranded: boolean): PadLayout {
  const bail = airborne ? 'Jump out' : 'Get out';
  switch (mode) {
    case 'foot':
      return { buttons: [JUMP], stickRuns: true, out: null };
    case 'swim':
      return { buttons: [up('Up'), down('Dive')], stickRuns: true, out: null };
    case 'submarine':
      return { buttons: [up('Rise'), down('Dive')], stickRuns: false, out: 'Get out' };
    case 'car':
    case 'motorbike':
      return { buttons: [drift(), horn()], stickRuns: true, out: 'Get out' };
    case 'jetski':
      return { buttons: [up('Leap'), horn()], stickRuns: true, out: 'Get out' };
    case 'boat':
    case 'sailboat':
      return { buttons: [horn()], stickRuns: true, out: 'Get out' };
    case 'bicycle':
      return { buttons: [drift('Skid'), horn('Bell')], stickRuns: true, out: 'Get out' };
    case 'horse':
      return { buttons: [JUMP, horn('Snort')], stickRuns: true, out: 'Dismount' };
    case 'plane':
      return { buttons: airborne ? [up('Climb'), down('Descend')] : [], stickRuns: false, out: bail };
    case 'helicopter':
      return { buttons: airborne ? [up('Rise'), down('Descend')] : [up('Lift off')], stickRuns: false, out: bail };
    case 'balloon':
      return { buttons: [up('Rise'), down('Sink')], stickRuns: false, out: bail };
    case 'passenger':
      return { buttons: [], stickRuns: false, out: airborne && stranded ? 'Take the controls' : bail };
  }
}

/** Where the buttons sit round the primary's centre: under the thumb, left of it, above-left. */
export const SLOTS = [
  { x: 0, y: 0, size: 78 },
  { x: -96, y: 12, size: 58 },
  { x: -68, y: -76, size: 58 },
];
