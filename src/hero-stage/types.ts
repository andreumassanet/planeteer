/** The hero stage's public types. */
import type { Appearance } from '../appearance.ts';
import type { Cast } from '../cast.ts';

/** How the camera frames the hero. */
export type StageShot = 'title' | 'full' | 'head' | 'top' | 'legs' | 'feet' | 'back';
/** What shows behind the hero: the ship's bridge, nothing (the menu does), or the world dimmed. */
export type StageBackdrop = 'bridge' | 'clear' | 'dim';
/** Who is showing the hero: the title turns them to the pointer, the creator holds them still. */
export type StageMode = 'title' | 'creator';
/** What a creator's tile is a picture of. */
export type PortraitFrame = 'body' | 'head' | 'top' | 'bottom' | 'feet' | 'pack';

export interface StageInsets {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface HeroStageOptions {
  /** The traveller's look, read every frame so a change shows at once. */
  appearance(): Appearance;
  /** The cast the figure is dressed from, with every outfit loaded. */
  cast(): Promise<Cast>;
  /** The traveller's name, for the plate over their head: `set` returns what was kept. */
  name: { get(): string; set(name: string): string };
}

export interface HeroStage {
  root: HTMLElement;
  /** The name over the hero's head. A card adopts it (`adoptPlate`) so its keyboard reaches the pencil. */
  plate: HTMLElement;
  readonly open: boolean;
  /** Whether the wardrobe has arrived and the hero is standing. */
  readonly ready: boolean;
  /**
   * Whether there is nothing left to wait for: the stage is not up, or the
   * hero and the backdrop's room both stand and the canvas has been shown.
   */
  readonly settled: boolean;
  readonly shotName: StageShot;
  show(backdrop: StageBackdrop): void;
  hide(): void;
  /** Hides the stage by flying the camera out of the bridge's window; off the bridge, or under reduced motion, a plain `hide`. */
  leave(): void;
  mode(mode: StageMode): void;
  /** Moves the camera to a framing; `instant` cuts rather than dollies. */
  shot(shot: StageShot, options?: { instant?: boolean }): void;
  /** How much of each edge, in CSS pixels, a card covers. Eased, as a shot is. */
  insets(insets: Partial<StageInsets>): void;
  /** Puts the name plate in `container`, which may be any element on the page. */
  adoptPlate(container: HTMLElement): void;
  /** A wave, when one is not already under way. */
  wave(): void;
  /** Starts editing the name on the plate. */
  editName(): void;
  /** Reads the name again, after something else changed it. */
  refreshName(): void;
  /** Called with the name kept whenever the plate changes it. Returns the unsubscribe. */
  onName(listener: (name: string) => void): () => void;
  /** Draws the hero in `look` into `canvas`, now if it was drawn before, else within a few frames. */
  portrait(look: Appearance, frame: PortraitFrame, canvas: HTMLCanvasElement): void;
}
