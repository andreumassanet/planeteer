/** The floating stick under the left thumb, and looking and pinching with the other fingers. */
import { inputBlocked } from '../controls.ts';
import type { TouchSink } from '../touch.ts';
import type { PadDom } from './buttons.ts';
import { isTouch } from './state.ts';

/** Radians of turn per pixel a finger drags: a phone's width is about a third of a turn. */
const LOOK_PER_PIXEL = 0.0058;
/** The wheel's pixels per pixel of pinch. */
const ZOOM_PER_PIXEL = 3.2;
/** The stick's travel, in pixels from its centre to the full push. */
const STICK_REACH = 46;
/** Past the rim by this much, and the stick runs. */
const RUN_PAST = 1.3;
/** Under this much of a push the stick is at rest. */
const DEAD = 0.12;
/** The part of the screen a thumb lands on to move: the left, below the bar. */
const STICK_ZONE_X = 0.45;
const STICK_ZONE_Y = 0.28;

/** What the stick and the look need to know about the pad. */
export interface WorldTouchHost {
  /** Whether a stick pushed past its rim is the run key here. */
  stickRuns(): boolean;
  /** The pad is put away: a card has the keys or the overlay is hidden. */
  isAway(): boolean;
}

export function createWorldTouch(
  dom: PadDom,
  sink: TouchSink,
  target: HTMLElement,
  signal: AbortSignal,
  host: WorldTouchHost,
) {
  const { stick, nub } = dom;

  let stickPointer: number | null = null;
  let originX = 0;
  let originY = 0;

  function moveStick(x: number, y: number): void {
    const dx = x - originX;
    const dy = y - originY;
    const length = Math.hypot(dx, dy);
    const clamp = length > STICK_REACH ? STICK_REACH / length : 1;
    nub.style.transform = `translate(${(dx * clamp).toFixed(1)}px, ${(dy * clamp).toFixed(1)}px)`;
    const depth = Math.min(1, length / STICK_REACH);
    const running = host.stickRuns() && length > STICK_REACH * RUN_PAST;
    stick.classList.toggle('running', running);
    if (depth < DEAD) {
      sink.steer(0, 0, false);
      return;
    }
    // Out of the dead zone the push starts from nothing, not from the zone's edge.
    const scale = ((depth - DEAD) / (1 - DEAD)) / (length || 1);
    sink.steer(dx * scale, -dy * scale, running);
  }

  function dropStick(): void {
    stickPointer = null;
    stick.classList.remove('held', 'running');
    stick.style.left = '';
    stick.style.top = '';
    nub.style.transform = '';
    sink.steer(0, 0, false);
  }

  const looks = new Map<number, { x: number; y: number }>();
  let pinch = 0;

  function spread(): number {
    const [a, b] = [...looks.values()];
    return a === undefined || b === undefined ? 0 : Math.hypot(a.x - b.x, a.y - b.y);
  }

  target.addEventListener('pointerdown', (event) => {
    if (event.pointerType !== 'touch' || host.isAway() || inputBlocked()) return;
    event.preventDefault();
    const inZone = event.clientX < innerWidth * STICK_ZONE_X && event.clientY > innerHeight * STICK_ZONE_Y;
    if (stickPointer === null && inZone) {
      stickPointer = event.pointerId;
      // Never so near an edge that the ring is cut off.
      const room = stick.offsetWidth / 2 + 6;
      originX = Math.max(room, event.clientX);
      originY = Math.min(innerHeight - room, Math.max(room, event.clientY));
      stick.style.left = `${originX}px`;
      stick.style.top = `${originY}px`;
      stick.classList.add('held');
      moveStick(event.clientX, event.clientY);
    } else {
      looks.set(event.pointerId, { x: event.clientX, y: event.clientY });
      pinch = spread();
    }
    target.setPointerCapture(event.pointerId);
  }, { signal });

  target.addEventListener('pointermove', (event) => {
    if (event.pointerId === stickPointer) {
      moveStick(event.clientX, event.clientY);
      return;
    }
    const last = looks.get(event.pointerId);
    if (last === undefined) return;
    const dx = event.clientX - last.x;
    const dy = event.clientY - last.y;
    last.x = event.clientX;
    last.y = event.clientY;
    if (looks.size >= 2) {
      // Two fingers on the world pinch the camera nearer and further; they do not look.
      const now = spread();
      if (pinch > 0) sink.zoom(-(now - pinch) * ZOOM_PER_PIXEL);
      pinch = now;
      return;
    }
    sink.look(dx * LOOK_PER_PIXEL, dy * LOOK_PER_PIXEL);
  }, { signal });

  const lift = (event: PointerEvent): void => {
    if (event.pointerId === stickPointer) dropStick();
    if (looks.delete(event.pointerId)) pinch = spread();
  };
  target.addEventListener('pointerup', lift, { signal });
  target.addEventListener('pointercancel', lift, { signal });
  target.addEventListener('contextmenu', (event) => {
    if (isTouch()) event.preventDefault();
  }, { signal });

  /** Lets go of the stick and every finger on the world. */
  function releaseWorld(): void {
    if (stickPointer !== null) dropStick();
    looks.clear();
    pinch = 0;
  }

  return { releaseWorld };
}
