/** The creator's public types, and a tile's spec. */
import type { Appearance } from '../appearance.ts';
import type { HeroStage } from '../hero-stage.ts';

export interface TravellerOptions {
  /** The appearance, owned by the caller: `set` dresses the hero and tells the others. */
  appearance: { get(): Appearance; set(appearance: Appearance): void };
  /** The stage the hero stands on, shared with the title screen. */
  stage: HeroStage;
  /**
   * The ids of the cosmetics the traveller has earned (`unlockedOf` in
   * `cosmetics.ts`), read whenever a page is drawn. Left out, only the free
   * ones are: everything else can be tried on and not worn.
   */
  unlocked?: () => ReadonlySet<string> | undefined;
  /** Where to hand the pointer back to, if it was locked when the creator opened. */
  lockTarget?: HTMLElement | null;
  onOpen?(): void;
  onClose?(): void;
}

export interface Traveller {
  root: HTMLElement;
  readonly open: boolean;
  /** Opens the creator. `relock` says whether to ask for the pointer back on closing; left out, it is whether the pointer is locked now. */
  show(options?: { relock?: boolean }): void;
  hide(): void;
}

/** A tile: a picture of the hero wearing a choice, and its name. */
export interface TileSpec {
  key: string;
  label: string;
  title?: string;
  look: () => Appearance;
  chosen: () => boolean;
  pick: () => void;
  /** What earns it, short, while it is not earned; null once it is. */
  locked?: () => string | null;
  /** Earned and not looked at yet. */
  fresh?: () => boolean;
  /** Being tried on: shown on the stage, not worn. */
  trying?: () => boolean;
  /** Draws its own picture rather than the hero's portrait (a trail, a title, a canopy). */
  paint?: (canvas: HTMLCanvasElement) => void;
}
