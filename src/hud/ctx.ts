/** The HUD's shared context: its elements, handles and state. Every module is a set of functions over it. */
import type { HintSet, TravelMode } from '../controls.ts';
import type { World } from '../geo.ts';
import type { Nearby } from '../places.ts';
import { ensureStyle, installUi } from '../ui.ts';
import { buildDom, type HudDom } from './dom.ts';
import { loadHinted } from './hints.ts';
import { STYLE } from './style.ts';
import type { HudOptions } from './types.ts';

/** Everything the HUD's modules share: its elements, its handles and its state. */
export interface HudCtx extends HudDom {
  readonly world: World;
  readonly options: HudOptions;
  /** Every listener this HUD adds goes with it on `dispose`. */
  readonly events: AbortController;
  readonly signal: AbortSignal;
  readonly unregister: (() => void)[];
  /** What the ground that belongs to nobody is called: the sea on Earth. */
  readonly emptyLabel: string;
  /** The placements carry an ISO code and the panel wants a country. */
  readonly countryNames: Map<string, string>;
  /** A body with no water a traveller can be on (`PlanetSurface.sea`). */
  readonly dryBody: boolean;
  /** The `once` hint sets used on this device. */
  readonly hinted: Set<string>;

  promptShown: string | null;
  sheetOpen: boolean;
  /** Where you are, once it has held long enough to count. */
  settled: number;
  /**
   * The place, once the same is true of it; `null` is "nowhere named". Refreshed
   * every frame the reading is still that place, since the range beside the name
   * reads its distance.
   */
  settledPlace: Nearby | null;
  placeCandidate: string;
  placeSettled: string;
  placeHeldFor: number;
  /** What the badge's place clause says: in it, near it, off its coast, or nothing. */
  placeMode: 'in' | 'near' | 'off' | null;
  /** The last country announced as an arrival. The ocean is never one. */
  announced: number;
  candidate: number;
  heldFor: number;
  bumpFor: number;
  arrivedFor: number;
  foundFor: number;
  toastFor: number;
  /** Set by `jump`, cleared by the next `update`: settle whatever arrives. */
  jumped: boolean;
  shownKm: number;
  shownClock: string;
  shownClockIcon: string;
  shownRange: string;
  /** The country beside the range has changed, so the separator between them may have. */
  rangeStale: boolean;
  weatherKind: string | null;
  weatherFor: number;
  /**
   * The angle the badge's arrow is drawn at, in radians, unwrapped: the bearing
   * arrives folded into (-pi, pi] and the arrow has a CSS transition, so the
   * number it is drawn at may leave the fold to take the short way round.
   */
  arrowAngle: number;
  /** The waypoint label's width, measured when its text changes, and how far it is slid. */
  labelWidth: number;
  labelShift: number;

  mode: TravelMode | null;
  /** A plane or a balloon off the ground: the badge names only what it is over. */
  flying: boolean;
  firstPerson: boolean;
  stranded: boolean;
  hintsOn: boolean;
  hidden: boolean;
  /** The keys on show, and for how much longer; a sticky set has no clock. */
  hintSet: HintSet | null;
  hintFor: number;
  paused: boolean | null;
  dragLook: boolean;
  welcoming: boolean;
  finishWelcome: (() => void) | null;
}

export function createHudCtx(world: World, options: HudOptions): HudCtx {
  installUi();
  ensureStyle('atlas-hud', STYLE);
  const events = new AbortController();
  return {
    ...buildDom(options, events.signal),
    world,
    options,
    events,
    signal: events.signal,
    unregister: [],
    emptyLabel: options.surface?.emptyLabel ?? 'Open water',
    countryNames: new Map(world.countries.map((country) => [country.iso, country.name])),
    dryBody: options.surface?.sea === false,
    hinted: loadHinted(),
    promptShown: null,
    sheetOpen: false,
    settled: -1,
    settledPlace: null,
    placeCandidate: '',
    placeSettled: '',
    placeHeldFor: 0,
    placeMode: null,
    announced: -1,
    candidate: -1,
    heldFor: 0,
    bumpFor: 0,
    arrivedFor: 0,
    foundFor: 0,
    toastFor: 0,
    jumped: false,
    shownKm: NaN,
    shownClock: '',
    shownClockIcon: '',
    shownRange: '',
    rangeStale: false,
    weatherKind: null,
    weatherFor: 0,
    arrowAngle: 0,
    labelWidth: -1,
    labelShift: 0,
    mode: null,
    flying: false,
    firstPerson: false,
    stranded: false,
    hintsOn: true,
    hidden: false,
    hintSet: null,
    hintFor: 0,
    paused: null,
    dragLook: false,
    welcoming: false,
    finishWelcome: null,
  };
}
