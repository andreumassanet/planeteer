/**
 * How the player is getting about, as far as the keys are concerned: on foot,
 * swimming, at the controls of a kind of vehicle (every four-wheeler is a car
 * here), or in somebody else's as a passenger, where the only key that does
 * anything is the one that gets you out. `Player.mode` says which.
 */
export type TravelMode =
  | 'foot'
  | 'swim'
  | 'car'
  | 'boat'
  | 'plane'
  | 'balloon'
  | 'bicycle'
  | 'motorbike'
  | 'horse'
  | 'jetski'
  | 'sailboat'
  | 'helicopter'
  | 'submarine'
  | 'passenger';

/** What a key does in the world, as opposed to which key it is. */
export type Action =
  | 'forward'
  | 'back'
  | 'left'
  | 'right'
  | 'run'
  | 'jump'
  | 'descend'
  | 'use'
  | 'horn'
  | 'view'
  | 'map'
  | 'settings'
  | 'players'
  | 'flags'
  | 'nearer'
  | 'farther'
  | 'hud'
  | 'photo'
  | 'chat'
  | 'wave'
  | 'dance'
  | 'passport'
  | 'mapIn'
  | 'mapOut'
  | 'release';

/** What a rebinding did besides the one it was asked for. */
export interface Rebound {
  /** False when the key or the action cannot be bound; nothing changed. */
  ok: boolean;
  /** The action that had this key as its own and now has the old one instead. */
  swapped: Action | null;
  /** The action that had this key as a spare, and has lost it. */
  took: Action | null;
}

/** What became of the key pressed for a binding (`captureKey`). */
export type Captured =
  | { kind: 'bound'; code: string; before: string | undefined; result: Rebound }
  /** A key that cannot be had (`keyBindable`), or one `rebind` refused; still listening. */
  | { kind: 'refused'; code: string }
  /** `Esc`: nothing changed, and no longer listening. */
  | { kind: 'cancelled' };

/** A cap that is not a key. */
export type Pointer = 'mouse' | 'wheel';

/** One line of a key list: the caps, in order, and what they do. */
export interface KeyHint {
  keys: readonly (Action | Pointer)[];
  label: string;
}

/** One line of the controls page: an action to rebind, or a pointer or key nobody can. */
export interface ControlRow {
  /** The action, whose key the row shows and rebinds. */
  action?: Action;
  /** Or a cap that is not a binding: the mouse, the wheel, `Esc`. */
  fixed?: Pointer | 'release';
  label: string;
}

/**
 * The few keys a new way of travelling needs, shown for a moment as you take it
 * up and then put away (`hud.ts`). `id` names the set, so that one which is
 * `once` (worth saying until it has been used) can be remembered as used; one
 * which is `sticky` stays for as long as it is true, because it is the only way
 * out of where you are.
 */
export interface HintSet {
  id: string;
  once: boolean;
  sticky: boolean;
  hints: KeyHint[];
}
