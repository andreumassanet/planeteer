

export type Age = 'child' | 'adult' | 'elder';

/** What the body is dressed in. The single largest silhouette lever there is. */
export type Garment = 'shirt' | 'tunic' | 'robe' | 'dress' | 'coat' | 'apron' | 'poncho';

export type Sleeves = 'bare' | 'short' | 'long';

/**
 * On the head: the part of a person furthest from the ground, so the last thing
 * the silhouette loses at distance.
 *
 * `beanie`, `hood`, `scarf`, `turban` and `helmet` cover the hair; `cap`,
 * `brim` and `conical` sit on it. A covering hat replaces the hair mesh instead
 * of sitting just outside it, which saves a mesh and avoids coplanar ink.
 */
export type Headwear =
  | 'none'
  | 'cap'
  | 'brim'
  | 'conical'
  | 'beanie'
  | 'hood'
  | 'scarf'
  | 'turban'
  | 'helmet';

export type Hair = 'bald' | 'crop' | 'bob' | 'long' | 'bun' | 'topknot' | 'braid' | 'afro';

export type Carry =
  | 'none'
  | 'pack'
  | 'satchel'
  | 'basket'
  | 'headload'
  | 'staff'
  | 'jug'
  | 'parasol'
  | 'bundle';

export type Pose = 'stand' | 'walk' | 'stride' | 'talk' | 'rest' | 'carry' | 'lift' | 'sit' | 'astride';

/**
 * One person, entirely.
 *
 * A plain record on purpose: `dress.ts` fills it in from a seed and a region,
 * `buildPerson` turns it into geometry and reads nothing else, and a caller who
 * wants a *specific* person — a shopkeeper at a door, a driver in a seat —
 * writes one by hand. Nothing in the builder touches an `Rng`, so one `Look` is
 * one body forever.
 */
export interface Look {
  /** Crown of the head above the sole, before any hat. */
  height: number;
  /** Multiplies the trunk's half-widths and the limb sections. 0.87 to 1.17. */
  girth: number;
  age: Age;

  hair: Hair;
  beard: boolean;
  headwear: Headwear;
  garment: Garment;
  sleeves: Sleeves;
  carry: Carry;
  pose: Pose;

  /** Forward lean about the hip, in radians. Elders get a little. */
  stoop: number;
  /** A signed nudge on every swing angle, so two walkers are not one walker. */
  sway: number;

  skin: number;
  hairColor: number;
  /** Shirt, coat, robe: whatever the upper body is. */
  top: number;
  /** Trousers, skirt: whatever the lower body is. A robe sets it to `top`. */
  bottom: number;
  /** Boots, hats, staves. The dark one. */
  trim: number;
  /** The one bright thing: a carried basket, an apron, a poncho. */
  accent: number;

  /**
   * Where the feet actually go, in the person's own frame (for a seated or astride
   * pose, the seat surface with the hip joint at the origin, +Z the way they
   * face). Mirrored across the centreline, so one point places both feet: a
   * crank, a stirrup, a pedal box, a footrest.
   *
   * Given, the two leg joints are solved by `solveLimb` instead of read out of
   * `POSES`. Absent, the pose's own angles stand. `Mount.footrest` in
   * `src/traffic/contract.ts` is this point.
   */
  footrest?: readonly [number, number, number];
  /**
   * And where the hands go: bars, a wheel, an oar, the same frame.
   *
   * The lean of a cyclist is entirely this: a bicycle that publishes a saddle
   * and no bars gets a rider sitting bolt upright on it.
   */
  grip?: readonly [number, number, number];
}
