/**
 * The traffic kit's code-built vehicles, taken: the scooter and the
 * auto-rickshaw (`traffic/parts/`), drawn at the size of the person who rides
 * them.
 *
 * They are the traffic's own parts, built by the traffic's own context, so a
 * scooter somebody rides off is the scooter the town had parked, only larger.
 * The kit builds a vehicle round its rider (`RIDER_HEIGHT`); this builds it
 * round the hero, so every length is multiplied by `AVATAR_HEIGHT /
 * RIDER_HEIGHT`, and the part's mounts (saddle, bench, footrest, bars) become
 * the craft's seats by the same multiplication.
 *
 * The part asks its context for `wheel(...)`; the context handed to it here
 * names what it returns, and each named mesh is taken out of the body and
 * handed over as a `'wheel'` about its own axle, so the motion can turn it.
 */
import * as THREE from 'three';
import { createTrafficContext, rngFrom } from '../traffic/contract.ts';
import type { Mount, TrafficContext, TrafficStyle, Vehicle } from '../traffic/contract.ts';
import { TRAFFIC_STYLES } from '../traffic/regions.ts';
import { PALETTE } from '../theme.ts';
import { scooter } from '../traffic/parts/scooter.ts';
import { autoRickshaw } from '../traffic/parts/auto-rickshaw.ts';
import { RIDE_SCALE } from './contract.ts';
import type { CraftKind, CraftModel, Lamp, Seat } from './contract.ts';
import { ABREAST } from './body.ts';
import { assemble, finish, soupOf, turningAbout } from './build.ts';
import type { Soup, Turning } from './build.ts';

export { RIDE_SCALE };

let traffic: TrafficContext | null = null;
/** The traffic's context, with every wheel it makes named so it can be found again. */
function context(): TrafficContext {
  if (traffic !== null) return traffic;
  const base = createTrafficContext();
  traffic = {
    ...base,
    wheel(radius, width, color, sides) {
      const mesh = base.wheel(radius, width, color, sides);
      mesh.name = 'wheel';
      return mesh;
    },
  };
  return traffic;
}

/** A soup's positions moved by `-at`: a turning part is built about its own axle. */
function about(soup: Soup, at: THREE.Vector3): Soup {
  for (let i = 0; i < soup.position.length; i += 3) {
    soup.position[i] = soup.position[i]! - at.x;
    soup.position[i + 1] = soup.position[i + 1]! - at.y;
    soup.position[i + 2] = soup.position[i + 2]! - at.z;
  }
  return soup;
}

/**
 * The part at the hero's scale: its body as one soup, its wheels each about
 * its own axle, and what it names `'fork'` (the bars, the fork, the fender)
 * about the steering axis it gives, the front wheel hung on it.
 */
function partSoups(spec: PartSpec, style: TrafficStyle): { still: Soup; wheels: Turning[] } {
  const part = spec.part;
  // One shape for every look: the part's own first variant, drawn in each
  // region's paint, so the seats fit every one of them.
  const built = part.build(context(), rngFrom(part.id, 'craft'), style);
  const holder = new THREE.Group();
  holder.scale.setScalar(RIDE_SCALE);
  holder.add(built);
  holder.updateMatrixWorld(true);
  const wheels: Turning[] = [];
  const found: THREE.Mesh[] = [];
  built.traverse((object) => {
    if (object.name === 'wheel' && (object as THREE.Mesh).isMesh) found.push(object as THREE.Mesh);
  });
  let fork: Turning | null = null;
  const steer = built.getObjectByName('fork');
  const axis = steer?.userData.axis as { at: [number, number, number]; tilt: number } | undefined;
  if (steer !== undefined && axis !== undefined) {
    const alone = new THREE.Group();
    alone.matrixAutoUpdate = false;
    alone.matrix.copy(steer.matrixWorld);
    steer.removeFromParent();
    steer.position.set(0, 0, 0);
    steer.rotation.set(0, 0, 0);
    steer.scale.set(1, 1, 1);
    alone.add(steer);
    fork = turningAbout('fork', soupOf(alone), new THREE.Vector3(...axis.at).multiplyScalar(RIDE_SCALE), axis.tilt);
  }
  for (const mesh of found) {
    const box = new THREE.Box3().setFromObject(mesh);
    const at = box.getCenter(new THREE.Vector3());
    // Its bottom on the road, whatever the part's rounding put it at.
    at.y = (box.max.y - box.min.y) / 2;
    const alone = new THREE.Group();
    alone.matrixAutoUpdate = false;
    alone.matrix.copy(mesh.matrixWorld);
    mesh.removeFromParent();
    mesh.position.set(0, 0, 0);
    mesh.rotation.set(0, 0, 0);
    mesh.scale.set(1, 1, 1);
    alone.add(mesh);
    wheels.push({ name: 'wheel', at, soup: about(soupOf(alone), at) });
  }
  if (fork !== null && wheels.length > 0) {
    // The foremost wheel turns with the bars.
    const front = wheels.reduce((a, b) => (b.at.z > a.at.z ? b : a));
    front.on = 'fork';
    wheels.push(fork);
  }
  return { still: soupOf(holder), wheels };
}

/**
 * The part's headlamps at the hero's scale: every mesh it marks lit
 * (`ctx.lit`, which the part keeps out of its merge) that stands in the front
 * half of it, at the middle of its glass across and up and at its front face.
 */
function partLamps(spec: PartSpec, style: TrafficStyle): Lamp[] {
  const built = spec.part.build(context(), rngFrom(spec.part.id, 'craft'), style);
  const holder = new THREE.Group();
  holder.scale.setScalar(RIDE_SCALE);
  holder.add(built);
  holder.updateMatrixWorld(true);
  const whole = new THREE.Box3().setFromObject(holder);
  const middle = (whole.min.z + whole.max.z) / 2;
  const lamps: Lamp[] = [];
  const box = new THREE.Box3();
  const centre = new THREE.Vector3();
  built.traverse((object) => {
    if (!(object as THREE.Mesh).isMesh || !((object.userData.atlasLit ?? 0) > 0)) return;
    box.setFromObject(object).getCenter(centre);
    if (centre.z > middle) lamps.push([centre.x, centre.y, box.max.z]);
  });
  return lamps;
}

/** A seat moved `by` units ahead, its grip and footrests with it, so they stay where the part has them. */
function shifted(seat: Seat, by: number): Seat {
  return {
    ...seat,
    z: seat.z + by,
    ...(seat.grip === undefined ? {} : { grip: [seat.grip[0], seat.grip[1], seat.grip[2] - by] as const }),
    ...(seat.feet === undefined ? {} : { feet: [seat.feet[0], seat.feet[1], seat.feet[2] - by] as const }),
  };
}

/** A mount of the crowd's as a seat of the hero's: the same place, the grip and the footrest about the hip. */
function seatOf(mount: Mount, x = mount.x): Seat {
  const k = RIDE_SCALE;
  const seat: Seat = { x: x * k, y: mount.y * k, z: mount.z * k, yaw: mount.yaw, pose: mount.pose === 'astride' ? 'ride' : 'sit', shown: true };
  if (seat.pose !== 'ride') return seat;
  const grip = mount.grip ?? [0, mount.y + 0.3, mount.z + 0.6];
  const feet = mount.footrest ?? [0.2, 0.3, mount.z + 0.2];
  return {
    ...seat,
    grip: [0, (grip[1] - mount.y) * k, (grip[2] - mount.z) * k],
    feet: [Math.abs(feet[0]) * k, (feet[1] - mount.y) * k, (feet[2] - mount.z) * k],
  };
}

interface PartSpec {
  id: string;
  kind: CraftKind;
  part: Vehicle;
  /** The region whose trim, glass and metal it is drawn in. */
  region: string;
  /** Its body paints, a look each. */
  paints: readonly number[];
  /** The mounts as seats; a bench wide enough for two is two. */
  seats: (part: Vehicle) => Seat[];
}

const SPECS: readonly PartSpec[] = [
  {
    id: 'scooter',
    kind: 'motorbike',
    part: scooter,
    region: 'southeast-asia',
    paints: [PALETTE.red, PALETTE.skyBlue, PALETTE.cream, PALETTE.gold, PALETTE.green, PALETTE.pink],
    // The rider alone, a little ahead of the crowd's rider on the long seat:
    // behind him is the tail and, on half of them, a top box, and the hero's
    // pack is deeper than the crowd's.
    seats: (part) => [shifted(seatOf(part.mounts[0]!), 0.25)],
  },
  {
    id: 'tuk-tuk',
    kind: 'tuktuk',
    part: autoRickshaw,
    region: 'south-asia',
    // An Indian auto's green and gold, a Thai tuk-tuk's blue and red.
    paints: [PALETTE.gold, PALETTE.green, PALETTE.skyBlue, PALETTE.red, PALETTE.orange, PALETTE.olive],
    // The driver astride at the front, two on the bench behind him, their
    // packs off the tail the bench is backed by.
    seats: (part) => {
      const [driver, bench] = part.mounts as [Mount, Mount];
      const half = ABREAST / 2 / RIDE_SCALE;
      return [seatOf(driver), shifted(seatOf(bench, half), 0.15), shifted(seatOf(bench, -half), 0.15)];
    },
  },
];

function partModel(spec: PartSpec): CraftModel {
  const style = TRAFFIC_STYLES[spec.region as keyof typeof TRAFFIC_STYLES];
  if (style === undefined) throw new Error(`craft ${spec.id}: no traffic style '${spec.region}'`);
  // A look a paint: the part's one shape, its body in each.
  const variants = spec.paints.length;
  const build = (variant: number, body?: number): THREE.Group => {
    const paint = body ?? spec.paints[((variant % variants) + variants) % variants]!;
    const { still, wheels } = partSoups(spec, { ...style, paint: [paint] });
    return assemble(spec.id, [still], wheels);
  };
  const lamps = partLamps(spec, { ...style, paint: [spec.paints[0]!] });
  return finish({ id: spec.id, kind: spec.kind, medium: 'road', seats: spec.seats(spec.part), draft: 0, variants, lamps, build });
}

/** The scooter and the tuk-tuk. */
export function buildPartCraft(): CraftModel[] {
  return SPECS.map(partModel);
}

/** `buildPartCraft` a craft a step, for a caller building over frames. */
export function* buildPartCraftSteps(): Generator<void, CraftModel[], void> {
  const built: CraftModel[] = [];
  for (const spec of SPECS) {
    yield;
    built.push(partModel(spec));
  }
  return built;
}
