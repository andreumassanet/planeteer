/**
 * The traffic kit's code-built vehicles, taken: the scooter and the
 * auto-rickshaw (`traffic/parts/`), drawn at the size of the person who rides
 * them.
 *
 * **They are the traffic's own parts, built by the traffic's own context**, so
 * a scooter somebody rides off is the scooter the town had parked — the same
 * step-through floor, the same top box on half of them — only larger. The
 * kit builds a vehicle round its rider (`RIDER_HEIGHT`, a seated crowd body);
 * this builds it round the hero, so every length in it is multiplied by the
 * one ratio of the two, `AVATAR_HEIGHT / RIDER_HEIGHT`, and the part's mounts
 * — the saddle, the bench, the footrest and the bars it already publishes for
 * the crowd — become the craft's seats by the same multiplication.
 *
 * **The wheels are found as they are made.** The part asks its context for
 * `wheel(...)`; the context handed to it here names what it returns, and each
 * named mesh is taken out of the body and handed over as a `'wheel'` about its
 * own axle, so the motion can turn it.
 */
import * as THREE from 'three';
import { AVATAR_HEIGHT } from '../stature.ts';
import { RIDER_HEIGHT, createTrafficContext, rngFrom } from '../traffic/contract.ts';
import type { Mount, TrafficContext, TrafficStyle, Vehicle } from '../traffic/contract.ts';
import { TRAFFIC_STYLES } from '../traffic/regions.ts';
import { PALETTE } from '../theme.ts';
import { scooter } from '../traffic/parts/scooter.ts';
import { autoRickshaw } from '../traffic/parts/auto-rickshaw.ts';
import type { CraftKind, CraftModel, Seat } from './contract.ts';
import { ABREAST } from './body.ts';
import { assemble, finish, soupOf } from './build.ts';
import type { Soup, Turning } from './build.ts';

/** How much larger the hero is than the rider the traffic's parts are built round. */
export const RIDE_SCALE = AVATAR_HEIGHT / RIDER_HEIGHT;

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

/** The part at the hero's scale: its body as one soup, and its wheels each about its own axle. */
function partSoups(spec: PartSpec, style: TrafficStyle): { still: Soup; wheels: Turning[] } {
  const part = spec.part;
  // One shape for every look: the part's own first variant, drawn in each
  // region's paint, so the seats fit every one of them.
  const built = part.build(context(), rngFrom(part.id, 'craft'), style);
  spec.adjust?.(built);
  const holder = new THREE.Group();
  holder.scale.setScalar(RIDE_SCALE);
  holder.add(built);
  holder.updateMatrixWorld(true);
  const wheels: Turning[] = [];
  const found: THREE.Mesh[] = [];
  built.traverse((object) => {
    if (object.name === 'wheel' && (object as THREE.Mesh).isMesh) found.push(object as THREE.Mesh);
  });
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
  return { still: soupOf(holder), wheels };
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
  /** Anything of the part's own that the hero, larger than its rider, needs moved. */
  adjust?: (built: THREE.Group) => void;
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
    // The screen, a hand further ahead of the driver's chest than the crowd's
    // rider needs it: it is the one part at the saddle's height on the axis.
    adjust: (built) => {
      for (const child of built.children) {
        if (Math.abs(child.position.x) < 1e-6 && Math.abs(child.position.y - 1.1) < 1e-6) child.position.z += 0.24;
      }
    },
  },
];

function partModel(spec: PartSpec): CraftModel {
  const style = TRAFFIC_STYLES[spec.region as keyof typeof TRAFFIC_STYLES];
  if (style === undefined) throw new Error(`craft ${spec.id}: no traffic style '${spec.region}'`);
  // A look a paint: the part's one shape, its body in each.
  const variants = spec.paints.length;
  const build = (variant: number): THREE.Group => {
    const paint = spec.paints[((variant % variants) + variants) % variants]!;
    const { still, wheels } = partSoups(spec, { ...style, paint: [paint] });
    return assemble(spec.id, [still], wheels);
  };
  return finish({ id: spec.id, kind: spec.kind, medium: 'road', seats: spec.seats(spec.part), draft: 0, variants, build });
}

/** The scooter and the tuk-tuk. */
export function buildPartCraft(): CraftModel[] {
  return SPECS.map(partModel);
}
