import * as THREE from 'three';
import { fail, f, craft, H } from './setup.ts';

// --- what steers -------------------------------------------------------------------
//
// Everything with something to steer shows it steering (`craft/motion.ts`): a
// right turn swings the front wheels, a two-wheeler's fork and bars or a
// jet ski's, to the right (-X), and a rudder's or an outboard's trailing edge
// with them; the light plane's elevator lifts its trailing edge for nose up
// and its ailerons go opposite ways for a roll; and an astride rider's grip
// is carried round with the bars, so the hands stay on them. All of it comes
// back to rest when let go.

console.log('\nwhat steers:');
{
  const { AT_REST, motionOf } = await import('../../src/craft/motion.ts');
  /** The kinds with nothing to steer: a basket, an animal, and rotor blades. */
  const STILL = new Set(['balloon', 'horse', 'helicopter']);
  const part = new THREE.Vector3();
  for (const model of craft.values()) {
    const group = model.build(0);
    const motion = motionOf(group, model);
    const named = (name: string): THREE.Object3D[] => {
      const found: THREE.Object3D[] = [];
      group.traverse((child) => {
        if (child.name === name) found.push(child);
      });
      return found;
    };
    const forks = named('fork');
    const rudders = named('rudder');
    const elevators = named('elevator');
    const ailerons = named('aileron');
    const fronts = named('wheel').filter((wheel) => wheel.parent === group && wheel.position.z > 0);
    const steer = named('steer');
    // Where each astride seat's grip is on the bars, in the fork's frame, at rest.
    const fork = forks[0];
    group.updateMatrixWorld(true);
    const grips = model.seats.flatMap((seat) => {
      if (seat.pose !== 'ride' || seat.grip === undefined || fork === undefined) return [];
      const at = new THREE.Vector3(seat.x + seat.grip[0], seat.y + seat.grip[1], seat.z + seat.grip[2]);
      return [{ seat, local: fork.worldToLocal(group.localToWorld(at.clone())) }];
    });
    const air = model.medium === 'air';
    const input = { ...AT_REST, engine: true, grounded: !air, speed: 10, steering: 1, elevator: 1, aileron: 1 };
    for (let t = 0; t < 1; t += 1 / 60) motion.update(1 / 60, input);
    group.updateMatrixWorld(true);
    const said: string[] = [];
    for (const one of forks) if (!(one.rotation.y < -0.1)) fail(`${model.id}: steered right, its bars turn ${f(one.rotation.y)} rad, not to the right`);
    for (const one of rudders) if (!(one.rotation.y > 0.1)) fail(`${model.id}: steered right, its rudder turns ${f(one.rotation.y)} rad, not trailing to the right`);
    // Aloft, the wheels are still.
    for (const one of air ? [] : fronts) if (!(one.rotation.y < -0.1)) fail(`${model.id}: steered right, a front wheel turns ${f(one.rotation.y)} rad, not to the right`);
    if (forks.length > 0) said.push(`bars ${f(forks[0]!.rotation.y)}`);
    if (rudders.length > 0) said.push(`rudder ${f(rudders[0]!.rotation.y)}`);
    if (fronts.length > 0) said.push(`front wheels ${f(fronts[0]!.rotation.y)}`);
    if (steer.length > 0) said.push(`wheel ${f(motion.steer)}`);
    if (model.kind === 'plane') {
      if (elevators.length === 0 || ailerons.length !== 2 || rudders.length === 0) fail(`${model.id}: ${elevators.length} elevator(s), ${ailerons.length} aileron(s) and ${rudders.length} rudder(s), wants 1, 2 and 1`);
      const up = (one: THREE.Object3D): number => {
        // The trailing edge's height against the hinge: up is positive.
        part.set(0, 0, -1).applyQuaternion(one.quaternion);
        return part.y;
      };
      for (const one of elevators) if (!(up(one) > 0.1)) fail(`${model.id}: asked for nose up, the elevator's trailing edge does not rise`);
      for (const one of ailerons) {
        const right = one.position.x < 0;
        if (right ? !(up(one) > 0.1) : !(up(one) < -0.1)) fail(`${model.id}: rolled right, the ${right ? 'right' : 'left'} aileron goes the wrong way`);
      }
      if (!(motion.steer > 0.05)) fail(`${model.id}: rolled right aloft, the pilot's yoke does not turn with the ailerons`);
      said.push(`elevator, ailerons ${ailerons.map((one) => f(up(one))).join(' / ')}`);
    }
    if (!STILL.has(model.kind) && forks.length + rudders.length + fronts.length === 0) fail(`${model.id}: steered, nothing on it turns`);
    // The hands stay on the bars.
    for (const { seat, local } of grips) {
      const turned = motion.turned(seat);
      const grip = turned.grip!;
      const want = group.worldToLocal(fork!.localToWorld(local.clone()));
      const off = want.distanceTo(new THREE.Vector3(seat.x + grip[0], seat.y + grip[1], seat.z + grip[2]));
      if (off > 0.01 * H) fail(`${model.id}: the turned grip is ${f(off)} off the bars`);
    }
    if (grips.length > 0) said.push('the grip on the bars');
    for (let t = 0; t < 4; t += 1 / 60) motion.update(1 / 60, AT_REST);
    for (const one of [...forks, ...rudders]) if (Math.abs(one.rotation.y) > 1e-3) fail(`${model.id}: let go, '${one.name}' does not come back straight`);
    if (said.length > 0) console.log(`  ${model.id.padEnd(12)} ${said.join(', ')}`);
  }
}
