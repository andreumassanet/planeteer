/** The creator's public types, and a tile's spec. */
import type { Appearance } from '../appearance.ts';
import type { HeroStage } from '../hero-stage.ts';

export interface TravellerOptions {
  /** The appearance, owned by the caller: `set` dresses the hero and tells the others. */
  appearance: { get(): Appearance; set(appearance: Appearance): void };
  /** The stage the hero stands on, shared with the title screen. */
  stage: HeroStage;
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
}
