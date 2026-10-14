/** The creator's shared context: its elements, handles and state. Every module is a set of functions over it. */
import { type Appearance, fitAppearance } from '../appearance.ts';
import type { HeroStage } from '../hero-stage.ts';
import { ensureStyle, installUi } from '../ui.ts';
import type { CategoryId } from './categories.ts';
import { buildDom, type TravellerDom } from './dom.ts';
import { STYLE } from './style.ts';
import type { TravellerOptions } from './types.ts';

/** Everything the creator's modules share: its elements, its handles and its state. */
export interface TravellerCtx extends TravellerDom {
  readonly options: TravellerOptions;
  readonly stage: HeroStage;
  /** The appearances *Undo* walks back through. */
  readonly history: Appearance[];
  /** What every page re-reads when anything changes; each page adds its own. */
  readonly refreshers: Map<CategoryId, (() => void)[]>;

  /** The appearance being edited, applied on every change. */
  look: Appearance;
  /** The page being built, which `onRefresh` files its refresh under. */
  building: CategoryId;
  current: CategoryId;
  showing: boolean;
  relock: boolean;
  /** Whether the stage was brought up for this, and so goes with it. */
  ownsStage: boolean;
  previousFocus: HTMLElement | null;
}

export function createTravellerCtx(options: TravellerOptions): TravellerCtx {
  installUi();
  ensureStyle('atlas-creator', STYLE);
  const stage = options.stage;
  return {
    ...buildDom(stage),
    options,
    stage,
    history: [],
    refreshers: new Map(),
    look: fitAppearance(options.appearance.get()),
    building: 'you',
    current: 'you',
    showing: false,
    relock: false,
    ownsStage: false,
    previousFocus: null,
  };
}
