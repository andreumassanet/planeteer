/** How rich the surfaces are drawn: 1 the full detail (Ultra), 0 the plain look. Shared by every material that draws detail. */
export const surfaceQuality = { value: 1 };

/**
 * The quality the player chose, which the world's frame hands `surfaceQuality`
 * every frame; the menu draws its globe at 0 instead, where nothing near is seen.
 */
export const chosenQuality = { value: 1 };

/** The looks the player chooses between, as stored and as shown. */
export const QUALITIES = [
  ['ultra', 'Ultra'],
  ['standard', 'Standard'],
] as const;
export type Quality = (typeof QUALITIES)[number][0];
