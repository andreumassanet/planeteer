import * as THREE from 'three';
import { PALETTE } from '../theme.ts';
import { SCENERY_SCALE } from '../stature.ts';

/** Dimensions of the roadside furniture, in world units, and its colours. */

const M = SCENERY_SCALE;

/** Pole spacing: 47 m, a country line's span. */
export const POLE_SPACING = 60;
/** Pole offset from the centre line, 0.9 past the shoulder's edge; its arm's far tip stays inside `roadClearance` (7.56). */
export const POLE_LATERAL = 5.7;
export const POLE_HEIGHT = 7.5 * M;
export const POLE_WIDTH = 0.26 * M;
export const ARM_LENGTH = 1.8 * M;
export const ARM_DEPTH = 0.16 * M;
/** Wire sag at mid-span. */
export const WIRE_SAG = 0.9;
export const WIRE_WIDTH = 0.08;
/** Pieces a span of wire is drawn in, each following the road's curve. */
export const WIRE_PIECES = 4;
/**
 * The sharpest bend (turn in radians over `POLE_SPACING`, a mean radius of
 * 110) a pole line follows; past it the line breaks so the outer wire stays
 * inside the verge.
 */
export const POLE_BEND = POLE_SPACING / 110;

/** White post spacing; posts alternate sides. */
export const POST_SPACING = 80;
export const POST_HEIGHT = 1.0 * M;
export const POST_WIDTH = 0.12 * M;

/** Lamp spacing down a town's approach, and the first lamp's distance from the kerb. */
export const LAMP_SPACING = 13;
export const LAMP_FROM = 7;
/** Column height; a town's own street lamps are 4.8 to 5.8 tall. */
export const LAMP_HEIGHT = 5.4;
/**
 * Minimum height of the column top over the highest surface under the arm:
 * the brace foot is 0.85 under it, leaving 4.6 over the tarmac.
 */
export const LAMP_CLEAR = 5.45;
export const LAMP_ARM = 1.7;
/** How far under its cap a lamp's light hangs, matching the town lamps' `LAMP_HEAD`. */
export const LAMP_HEAD_DROP = 0.35;

/** How much higher a bank's top stands than the ground at its foot before it gets a rail. */
export const RAIL_DROP = 5;
export const RAIL_HEIGHT = 0.75 * M;
export const RAIL_POST_SPACING = 5;

/**
 * A bend is signed with chevrons when it turns more than `CHEVRON_TURN`
 * radians over `CHEVRON_SPAN` (a mean radius of 70); signs stand at least
 * `CHEVRON_APART` apart.
 */
export const CHEVRON_SPAN = 40;
export const CHEVRON_TURN = CHEVRON_SPAN / 70;
export const CHEVRON_APART = 140;

/** Speed limits a sign leaving a town may show, km/h. */
export const LIMITS = [50, 60, 70, 80, 90] as const;

/** Distance from a town's kerb to its name board, past the pavement. */
export const NAME_AT = 44;
/** And to the speed sign for traffic leaving it. */
export const SPEED_AT = 62;
/** The furthest a sign's board reaches from the centre line: inside `roadClearance` (7.56). */
export const SIGN_REACH = 6.9;

/** Bridge railing post spacing and rail height. */
export const BRIDGE_POST_SPACING = 3;
export const BRIDGE_RAIL_HEIGHT = 1.1 * M;
/** Bridge piers: the widest spacing, the depth of their feet into the floor, their length along the road. */
export const PIER_SPACING = 28;
export const PIER_FOOT = 4;
export const PIER_ALONG = 1.6;

/**
 * How deep a bridge deck's edge girder is under its crown: the ribbon draws
 * its shoulders this far down over the water, and the piers stand under it.
 */
export const GIRDER = 2.4;

/**
 * How far in from the edge of another road's top a thing may still stand: a
 * lamp on a pavement two roads share stands on both tops' edges.
 */
export const OTHER_EDGE = 0.6;

/** The `atlasLit` bytes: unlit, a burning lamp head, and the hour that never comes. */
export const DARK = 0;
export const HEAD = 255;
export const ALWAYS = 255;

export const colours = {
  pole: new THREE.Color(PALETTE.bark).lerp(new THREE.Color(PALETTE.brown), 0.35),
  wire: new THREE.Color(PALETTE.ink).lerp(new THREE.Color(PALETTE.steel), 0.4),
  post: new THREE.Color(PALETTE.white),
  cap: new THREE.Color(PALETTE.ink).lerp(new THREE.Color(PALETTE.steel), 0.3),
  lamp: new THREE.Color(PALETTE.steel),
  head: new THREE.Color(PALETTE.cream),
  rail: new THREE.Color(PALETTE.bone),
  board: new THREE.Color(PALETTE.cream),
  ring: new THREE.Color(PALETTE.red),
  /** The galvanised back of a sign. */
  back: new THREE.Color(PALETTE.bone).lerp(new THREE.Color(PALETTE.steel), 0.45),
  /** Lettering: ink lifted a little so the outline still shows round a board. */
  letter: new THREE.Color(PALETTE.ink).lerp(new THREE.Color(PALETTE.slate), 0.35),
  border: new THREE.Color(PALETTE.slate).multiplyScalar(0.62),
  housing: new THREE.Color(PALETTE.steel).multiplyScalar(0.8),
  pier: new THREE.Color(PALETTE.bone).lerp(new THREE.Color(PALETTE.tan), 0.35),
};

/** Pole and wire colours, shared with the towns' own lines (`scenery/overhead.ts`). */
export const POLE_COLOUR: THREE.Color = colours.pole;
export const WIRE_COLOUR: THREE.Color = colours.wire;
