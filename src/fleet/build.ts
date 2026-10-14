/** Building a vehicle: its model made or taken from the pool, with the frames of its seats. */
import * as THREE from 'three';
import { motionOf } from '../craft/motion.ts';
import { fleetVariant } from '../craft/parked.ts';
import { modelOfVehicle } from './models.ts';
import type { FleetSite } from './site-types.ts';
import type { Drawn, FleetContext } from './state.ts';

export function createBuilder(ctx: FleetContext) {
  const { options, models, pool, paints } = ctx;
  const { parked } = options;

  function paintOf(id: string): number | undefined {
    let known = paints.get(id);
    if (known === undefined) {
      known = parked?.paintOf?.(id) ?? null;
      paints.set(id, known);
    }
    return known ?? undefined;
  }

  function build(id: string, site: FleetSite | null): Drawn | null {
    const model = models.get(site?.model ?? modelOfVehicle(id));
    if (model === undefined) return null;
    const variant = fleetVariant(id, model.variants);
    const paint = site === null ? paintOf(id) : undefined;
    const key = paint === undefined ? `${model.id}#${variant}` : `${model.id}#${variant}@${paint}`;
    const spare = pool.get(key)?.pop();
    if (spare !== undefined) {
      spare.id = id;
      spare.site = site;
      spare.siteless = false;
      spare.reseat = 0;
      spare.tracked = false;
      spare.speed = spare.turn = 0;
      spare.motion.rest();
      return spare;
    }
    const built = model.build(variant, paint);
    built.name = `vehicle:${model.id}`;
    // The seats as frames of the model, so a body can be put in one without
    // knowing whose model it is: `FleetSeats.seatFrame`.
    const seats = model.seats.map((seat, i) => {
      const frame = new THREE.Object3D();
      frame.name = `seat:${i}`;
      frame.position.set(seat.x, seat.y, seat.z);
      frame.rotation.y = seat.yaw;
      // What a body put here has to know, and a remote body is put here by
      // somebody who holds only the frame: hidden in a cab, and sitting or
      // standing.
      frame.userData.shown = seat.shown;
      frame.userData.pose = seat.pose;
      // Astride, the grip and the footrests too, and the crank a body's feet go round.
      frame.userData.seat = seat;
      built.add(frame);
      return frame;
    });
    // Everything casts and takes shadow but the glass, which casts none, and
    // the cabin, which takes none (`assemble`).
    built.traverse((object) => {
      if ((object as THREE.Mesh).isMesh) {
        object.castShadow = object.name !== 'glass';
        object.receiveShadow = object.name !== 'cabin';
      }
    });
    // After the seats, so the springs carry them too.
    const motion = motionOf(built, model);
    for (const frame of seats) frame.userData.motion = motion;
    return {
      id,
      model,
      variant,
      key,
      group: built,
      seats,
      site,
      siteless: false,
      reseat: 0,
      motion,
      last: new THREE.Vector3(),
      lastForward: new THREE.Vector3(),
      tracked: false,
      speed: 0,
      turn: 0,
    };
  }

  return { paintOf, build };
}
