/** The orrery's public types. */
import * as THREE from 'three';
import type { Body } from '../system/index.ts';

/**
 * One region as a held globe is tinted by it: its colour, and its rings as
 * `[lon, lat]` loops that never cross the antimeridian, so each fills flat.
 */
export interface HeldRegion {
  color: number;
  rings: readonly (readonly (readonly number[])[])[];
}

export interface OrreryBody {
  body: Body;
  /** Drawn radius, world units. Earth's is `PLANET_RADIUS`. */
  radius: number;
  /** Its ring about the Sun, world units; 0 for the Sun. */
  ring: number;
  /** Counted out from the Sun: Mercury 1, Earth 3. 0 for the Sun; a moon has its planet's. */
  order: number;
  /** Where its centre is in world space, as of the last `update`. */
  position: THREE.Vector3;
  /**
   * How much of it is drawn after the last `update`, 0 to 1: everything but
   * the body the camera is near steps back as it nears one (see the header).
   * Earth's is always 1, since Earth is the world and not this file's mesh.
   */
  opacity: number;
}

export interface Orrery {
  /** Added to the world's scene by the caller, removed by `dispose`. */
  group: THREE.Group;
  /** The Sun first, then outward. Earth is one of them and has no mesh here. */
  bodies: readonly OrreryBody[];
  sun: OrreryBody;
  earth: OrreryBody;
  /** Ecliptic north in world space, which is the system's natural up. */
  north: THREE.Vector3;
  /**
   * The ecliptic of date in world space — the equinox, longitude 90 and the
   * pole — live, rewritten by every `update`. A camera orbiting the system
   * orbits in the plane of the first two.
   */
  axes: { x: THREE.Vector3; y: THREE.Vector3; z: THREE.Vector3 };
  /**
   * The outermost ring plus its planet: how far from the Sun the system
   * reaches, which is what a far plane has to. The stars are further, and
   * need none: `night-sky.ts` draws them at infinity.
   */
  extent: number;
  /**
   * Place everything for this instant and this camera. `time` is the sky's own
   * clock, so the Sun here and the light on the land cannot drift apart.
   */
  update(time: Date, camera: THREE.PerspectiveCamera, screenHeight: number, dt: number): void;
  /** Gold on one ring, or none. */
  highlight(id: string | null): void;
  /**
   * The body the camera has been sent to, which never fades as the camera
   * nears Earth; `null` when it is Earth or nothing. See the header.
   */
  focus(id: string | null): void;
  /**
   * Holds one body still and upright for a globe stage: its pole on the world's +Y
   * and longitude 0 on +X, the same frame Earth's land is in. Its spin stops and the
   * rest of the system steps back as the camera nears it; with `regions` its globe is
   * redrawn finer and tinted by them, per pixel, off a flat map of their rings.
   * `null` lets it go.
   */
  holdUpright(id: string | null, regions?: readonly HeldRegion[]): void;
  /** A body drawn by somebody else from here on (a walked world's own ground): its painted ball goes (Saturn keeps its rings) and it stands still and upright. */
  cover(id: string): void;
  /**
   * The handedness witness: the angle between the Sun this file placed and the
   * sun `sun.ts` lights the world by. See the header.
   */
  verify(sunDirection: THREE.Vector3): Record<string, number | boolean>;
  dispose(): void;
}
