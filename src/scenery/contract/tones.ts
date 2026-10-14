

/**
 * How far a surface stands off the one behind it before the pen will draw the
 * join, in world units.
 *
 * `OutlineEffect` hulls each mesh on its own, so two faces that are flush get
 * no ink between them. A base course painted onto a wall is only a change of
 * colour; stepped out by this much it is an edge, and an edge is a line. 0.08
 * is the least that reliably wins the depth test against the hull behind it, and
 * every course, band, frame and cap in the kit stands off by exactly it.
 */
export const PROUD = 0.08;

/**
 * The tones a made thing carries, as factors for `ctx.tone`.
 *
 * What separates a house from a box is that every element carries two or three
 * tones of its own colour: a wall has a darker base course and a shadow under
 * its eaves, a roof a darker ridge, a chimney a cap, a door a lintel. Tones are
 * free against the colour budget (`measure` folds them onto their base) and
 * cost a merged town only the vertex bytes it already carries.
 *
 * The eave is the darkest because it stands for a shadow, and a shadow only 15%
 * darker reads as dirt; the base course is the lightest of the darks because it
 * is the biggest, and a heavy dark band at the foot of every house makes a
 * street of plinths. Used as `tone(wall, TONES.course)`.
 */
export const TONES = {
  /** The base course of a wall, the step under a door, the plinth of a tower. */
  course: 0.84,
  /** The band under the eaves: the roof's shadow, drawn rather than lit. */
  eave: 0.7,
  /** A ridge cap, a chimney cap, a lintel, a balcony: the dark edge of a thing. */
  cap: 0.76,
  /** A cornice, a sill, a frame, the lighter bay of a terrace: its sunlit edge. */
  light: 1.1,
} as const;

/**
 * Glazing is `slate` at this factor, everywhere on the planet: 0x595568, a dark
 * blue-grey.
 *
 * A window is the sky reflected, not a hole, and must never be black: in this
 * style a black rectangle is ink, and a row of them a floor apart is a stripe.
 * The regional `style.glass` lists are warm darks, right for a hole (a doorway,
 * an arch, a belfry louvre). `slate` is the one cool palette entry that keeps
 * a hue in shade, so glass can be the one cool thing on a warm wall.
 */
export const GLASS_TONE = 0.72;
