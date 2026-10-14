/** How each crop is drawn: palette colours, stripes, furrows and the rows that grow on them. */
import { PALETTE } from '../theme.ts';
import { tone } from '../monuments/contract.ts';
import type { SceneryContext } from '../scenery/contract.ts';
import type { CropId } from '../countryside.ts';

/**
 * A row's cross-section, from its left foot over its crown to its right foot:
 * (across, up) pairs, units, up from the plate. Its colour runs from `foot`
 * at the plate to `crown` at its top, vertex by vertex.
 */
export interface RowSection {
  points: readonly (readonly [number, number])[];
  foot: number;
  crown: number;
}

/**
 * What grows in a field's rows at the finest level: its section, a second
 * crown colour every other row takes, and how far apart the rows are where
 * there are no furrows.
 */
export interface CropRows {
  section: RowSection;
  second?: number;
  spacing: number;
}

export interface Look {
  /** The plate's two tones, across the rows. */
  plate: [number, number];
  /** Width of one tone's stripe, units. 0 is one colour. */
  stripe: number;
  /** A paddy's bunds, round it and across it into pools, at the finest level. */
  bunds?: { width: number; height: number; color: number; tone: number; bury: number };
  /**
   * The ridges of soil the plough throws up, at the finest level, `spacing`
   * apart: the plate under them is the furrows' bottoms, one tone. Low and
   * rounded, and lighter on top, where the soil dries first.
   */
  furrows?: { spacing: number; section: RowSection };
  /** What grows in rows: on the ridges where there are furrows, else on the plate. */
  crop?: CropRows;
  /** Whether the grass grows through it, tinted: a field of straw. */
  straw: boolean;
}

/**
 * A row of plants seen end on: a narrow foot, its widest a little over
 * half-way up (`waist`), and a rounded top; `width` its widest, `height` its
 * top over the plate.
 */
export function plantSection(width: number, height: number, foot: number, crown: number, waist = 0.55): RowSection {
  return {
    points: [
      [-width * 0.3, -0.1],
      [-width / 2, height * waist],
      [-width * 0.3, height * 0.92],
      [width * 0.3, height * 0.92],
      [width / 2, height * waist],
      [width * 0.3, -0.1],
    ],
    foot,
    crown,
  };
}

/** A ridge of ploughed soil: `width` at the foot and `height` over the furrows, rounded over a narrow crown. */
function ridgeSection(width: number, height: number, foot: number, crown: number): RowSection {
  return {
    points: [
      [-width / 2, -0.12],
      [-width * 0.22, height * 0.82],
      [0, height],
      [width * 0.22, height * 0.82],
      [width / 2, -0.12],
    ],
    foot,
    crown,
  };
}

/** The height of the furrows' ridges of every ridged crop. */
const RIDGE_HEIGHT = 0.3;
/** Of a field just ploughed, the share sown, its rows of shoots up out of the ridges. */
export const SOWN = 0.5;

export function lookOf(ctx: SceneryContext, crop: CropId): Look {
  const t = ctx.tone;
  const P = PALETTE;
  switch (crop) {
    case 'wheat':
      return { plate: [P.gold, t(P.gold, 0.86)], stripe: 1.8, straw: true };
    case 'barley':
      return { plate: [t(P.sand, 0.96), t(P.tan, 1.12)], stripe: 1.8, straw: true };
    case 'rapeseed':
      return { plate: [t(P.gold, 1.18), t(P.gold, 1.05)], stripe: 2.2, straw: true };
    case 'millet':
      return { plate: [t(P.tan, 1.1), t(P.gold, 0.8)], stripe: 1.6, straw: true };
    case 'lavender':
      // Rounded bushes in rows on bare soil: grey-green at the foot, violet over the top.
      return {
        plate: [t(P.violet, 0.78), t(P.tan, 0.92)],
        stripe: 1.1,
        crop: { section: plantSection(1.4, 0.95, t(P.green, 0.62), t(P.violet, 0.86), 0.45), second: t(P.violet, 0.78), spacing: 2.1 },
        straw: false,
      };
    case 'greens':
      // Beds of leaf vegetables on their ridges, a light and a blue-green bed in turn.
      return {
        plate: [t(P.green, 0.92), t(P.clay, 0.62)],
        stripe: 1.2,
        furrows: { spacing: 1.7, section: ridgeSection(1.6, RIDGE_HEIGHT, t(P.clay, 0.58), t(P.brown, 0.98)) },
        crop: { section: plantSection(1.05, 0.6, t(P.green, 0.66), t(P.green, 1.08)), second: t(P.slate, 1.05), spacing: 0 },
        straw: false,
      };
    case 'ploughed':
      // Turned soil, warm and dark in the furrows, drier and lighter on the ridges.
      return {
        plate: [t(P.clay, 0.7), t(P.brown, 0.66)],
        stripe: 1,
        furrows: { spacing: 1.35, section: ridgeSection(1.3, RIDGE_HEIGHT, t(P.clay, 0.55), t(P.brown, 1.02)) },
        straw: false,
      };
    case 'maize':
      // Tall leafy rows on low ridges, yellowing to the tassels.
      return {
        plate: [t(P.brown, 0.9), t(P.green, 0.85)],
        stripe: 1.3,
        furrows: { spacing: 2.2, section: ridgeSection(1.8, RIDGE_HEIGHT * 0.8, t(P.clay, 0.58), t(P.brown, 0.92)) },
        crop: { section: plantSection(1.15, 2.6, t(P.green, 0.6), t(P.olive, 0.95)), spacing: 0 },
        straw: false,
      };
    case 'vineyard':
      // Vines on their wires: the dark stocks at the foot, the leaves over them.
      return {
        plate: [t(P.tan, 1.05), t(P.darkOlive, 1.2)],
        stripe: 1.5,
        crop: { section: plantSection(1.0, 1.6, t(P.bark, 1.2), t(P.green, 0.9), 0.62), second: t(P.olive, 0.8), spacing: 3 },
        straw: false,
      };
    case 'olives':
      return { plate: [t(P.tan, 1.08), t(P.tan, 0.98)], stripe: 4, straw: false };
    case 'paddy':
      return { plate: [t(P.skyBlue, 0.72), t(P.green, 1.12)], stripe: 0.9, bunds: { width: 0.8, height: 0.45, color: P.brown, tone: 0.95, bury: 0.35 }, straw: false };
    case 'pond':
      return { plate: [t(P.skyBlue, 0.78), t(P.skyBlue, 0.84)], stripe: 0, straw: false };
  }
}

/** A crop's plate, its two tones across the rows: what the map paints a field with (`map-features.ts`). */
export function cropPlate(crop: CropId): readonly [number, number] {
  return lookOf({ tone } as unknown as SceneryContext, crop).plate;
}

/** The colour the grass takes in a field of straw, or null where no grass grows through it. */
export function strawOf(ctx: SceneryContext, crop: CropId): number | null {
  const look = lookOf(ctx, crop);
  return look.straw ? look.plate[0] : null;
}

/** What a field just ploughed and sown carries on its ridges: rows of shoots, bright against the soil. */
export function shootsOf(ctx: SceneryContext): CropRows {
  return { section: plantSection(0.45, 0.36, ctx.tone(PALETTE.green, 0.7), ctx.tone(PALETTE.green, 1.22)), spacing: 0 };
}
