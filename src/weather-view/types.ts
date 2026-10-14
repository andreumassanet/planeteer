/** The weather view's public types. */
import * as THREE from 'three';
import type { WeatherKind, WeatherSample } from '../weather.ts';

export interface WeatherHere {
  kind: WeatherKind;
  intensity: number;
  temperatureC: number;
  wind: { speed: number; from: number };
  cover: number;
  precipitation: number;
  snow: number;
  storm: number;
  fog: number;
  /** Snow on the ground: the season's and a fall's, whichever is deeper. */
  lying: number;
  /** The ground's wetness, 0 to 1. */
  wet: number;
  /**
   * How much of the sun the deck's shade takes where you stand, 0 to about
   * two thirds, as it is drawn: the bank between you and the sun
   * (`cloudShadeAt`), times the strength the shaders have this frame.
   */
  shade: number;
  forced: WeatherKind | null;
  enabled: boolean;
}

export interface WeatherView {
  group: THREE.Group;
  /**
   * Once a frame, after the sky: `ground` is the ground's radius under the
   * player, `daylight` the sky's.
   */
  update(dt: number, time: Date, player: THREE.Vector3, ground: number, camera: THREE.Camera, daylight: number): void;
  /** What the weather is where you stand, as it is drawn (eased, forced, or off). */
  here(): WeatherHere;
  /** The model itself at a place and an instant, for the console. */
  at(lat: number, lon: number, when?: Date | number): WeatherSample;
  /** Holds the weather where you stand at a kind until `force(null)`. */
  force(kind: WeatherKind | null): WeatherKind | null;
  /** Off is clear skies: no rain, no storms, no weather haze. The seasons' snow stays; it is the climate. */
  enabled: boolean;
  /** What the ear takes: rain on and round you, and how much of a gale. */
  readonly sound: { rain: number; gale: number };
  /** Called for each strike, with the seconds until its thunder arrives and how loud it is. */
  onThunder: ((delay: number, loudness: number) => void) | null;
  /** The two programs this draws with, for `warm.ts` to compile while the menu is up. */
  proxies(): THREE.Mesh[];
  readonly stats: {
    kind: WeatherKind;
    drops: number;
    snowing: boolean;
    strikes: number;
    pending: number;
    bolt: boolean;
    sampleMs: number;
  };
}
