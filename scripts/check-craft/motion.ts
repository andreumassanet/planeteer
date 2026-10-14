import './ahead.ts';
import * as THREE from 'three';
import { fail, f, craft, horseRig, H } from './setup.ts';

// --- the motion ------------------------------------------------------------------
//
// Every craft driven hard for a few seconds — flat out, full lock, a stop —
// through `craft/motion.ts`, then let go: every matrix under it stays proper,
// every inked mesh keeps its outline normal, the wheels stay on their axles,
// a car's body leans and pitches and comes back square, and the propeller
// winds down to still. The airstrip and the windsock are built on a flat
// ground and held to the same.

console.log('\nthe motion:');
{
  const { AT_REST, motionOf } = await import('../../src/craft/motion.ts');
  const worst = { det: Infinity };
  const proper = (group: THREE.Object3D, label: string): void => {
    group.updateMatrixWorld(true);
    group.traverse((part) => {
      const det = part.matrixWorld.determinant();
      worst.det = Math.min(worst.det, det);
      if (!(det > 0)) fail(`${label}: '${part.name}' has a reflected or collapsed matrix under its motion (det ${f(det, 4)})`);
    });
  };
  for (const model of craft.values()) {
    const group = model.build(0);
    const motion = motionOf(group, model);
    if (motionOf(group, model) !== motion) fail(`${model.id}: a second ask made a second motion`);
    const wheels: [THREE.Object3D, THREE.Vector3][] = [];
    group.traverse((part) => {
      if (part.name === 'wheel') wheels.push([part, part.position.clone()]);
    });
    const sprung = group.getObjectByName('sprung');
    if (sprung === undefined) fail(`${model.id}: no sprung group`);
    const air = model.medium === 'air';
    let leaned = 0;
    let pitched = 0;
    const input = { ...AT_REST, engine: true, grounded: true };
    for (let t = 0; t < 6; t += 1 / 60) {
      // Up to speed, round a hard left, and a hard stop.
      input.speed = t < 3 ? Math.min(45, t * 30) : Math.max(0, 45 - (t - 3) * 90);
      input.turnRate = t > 1 && t < 3 ? 0.9 : 0;
      input.steering = t > 1 && t < 3 ? -1 : 0;
      input.grounded = !(air && t > 2 && t < 4);
      motion.update(1 / 60, input);
      if (sprung !== undefined) {
        leaned = Math.max(leaned, sprung.rotation.z);
        pitched = Math.max(pitched, Math.abs(sprung.rotation.x));
      }
      if (Math.round(t * 60) % 30 === 0) proper(group, model.id);
    }
    if (['car', 'van', 'bus', 'tractor', 'jeep', 'tuktuk'].includes(model.kind) && (leaned < 0.01 || pitched < 0.01)) {
      fail(`${model.id}: the body did not lean out of a hard turn or pitch on the brake (roll ${f(leaned, 3)}, pitch ${f(pitched, 3)})`);
    }
    for (const [wheel, at] of wheels) if (wheel.position.distanceTo(at) > 1e-9) fail(`${model.id}: a wheel moved off its axle`);
    for (let t = 0; t < 8; t += 1 / 60) motion.update(1 / 60, AT_REST);
    if (motion.settling) fail(`${model.id}: eight seconds after it was let go of it is still moving`);
    if (sprung !== undefined && (Math.abs(sprung.rotation.x) > 1e-3 || Math.abs(sprung.rotation.z) > 1e-3)) fail(`${model.id}: the body did not come back square`);
    proper(group, model.id);
    group.traverse((part) => {
      const mesh = part as THREE.Mesh;
      if (!mesh.isMesh) return;
      const ink = (mesh.material as THREE.Material).userData.outlineParameters as { visible?: boolean } | undefined;
      if (ink?.visible === false) return;
      if (mesh.geometry.getAttribute('outlineNormal') === undefined) fail(`${model.id}: '${mesh.name}' is inked and has no outlineNormal`);
    });
    // A moored launch rides the swell, and only a launch does.
    if (model.medium === 'water' && sprung !== undefined) {
      let heave = 0;
      for (let t = 0; t < 4; t += 1 / 60) {
        motion.update(1 / 60, { ...AT_REST, moored: true });
        heave = Math.max(heave, Math.abs(sprung.position.y));
      }
      if (heave < 0.05) fail(`${model.id}: a moored launch does not ride the swell (${f(heave, 3)})`);
      proper(group, model.id);
    }
    // What turns besides the wheels: a bicycle's crank while it is pedalled,
    // a helicopter's rotors while its engine runs, a horse's legs and back.
    let extra = '';
    if (model.gearing !== undefined) {
      const crank = group.getObjectByName('crank');
      const fresh = motionOf(model.build(0), model);
      for (let t = 0; t < 1; t += 1 / 60) fresh.update(1 / 60, { ...AT_REST, engine: true, speed: 20, throttle: 1 });
      const pedalled = fresh.phase;
      for (let t = 0; t < 1; t += 1 / 60) fresh.update(1 / 60, { ...AT_REST, engine: true, speed: 20, throttle: 0 });
      if (crank === undefined) fail(`${model.id}: geared, with no 'crank'`);
      if (!(pedalled > 0.5)) fail(`${model.id}: the crank did not turn under the pedals (${f(pedalled, 3)})`);
      if (Math.abs(fresh.phase - pedalled) > 1e-9) fail(`${model.id}: the crank turned while it coasted`);
      extra += `  crank ${f(pedalled, 2)} rad in a second at 20`;
    }
    if (model.kind === 'helicopter') {
      const fresh = model.build(0);
      const motion2 = motionOf(fresh, model);
      const rotor = fresh.getObjectByName('rotor');
      const tail = fresh.getObjectByName('tail');
      for (let t = 0; t < 3; t += 1 / 60) motion2.update(1 / 60, { ...AT_REST, engine: true, grounded: false });
      if (rotor === undefined || tail === undefined) fail(`${model.id}: no 'rotor' or no 'tail'`);
      else if (rotor.rotation.y === 0 || tail.rotation.x === 0) fail(`${model.id}: the rotors did not turn with the engine running`);
      proper(fresh, model.id);
      extra += '  rotors turn';
    }
    if (model.kind === 'horse') {
      const fresh = model.build(0);
      const motion2 = motionOf(fresh, model);
      const rig = fresh.getObjectByName('rig');
      let rose = 0;
      let fell = 0;
      for (let t = 0; t < 3; t += 1 / 60) {
        motion2.update(1 / 60, { ...AT_REST, engine: true, speed: 30, throttle: 1 });
        rose = Math.max(rose, motion2.lift);
        fell = Math.min(fell, motion2.lift);
      }
      if (rig === undefined) fail(`${model.id}: no 'rig'`);
      if (rose - fell < 0.02) fail(`${model.id}: the saddle does not ride the gallop (${f(rose - fell, 3)})`);
      proper(fresh, model.id);
      extra += `  saddle rides ${f(rose - fell, 2)} at a gallop`;
      // A leap: off the ground for 0.7 s at a gallop, then down. The pack's
      // clip lifts the whole horse, and the motion must take that back off
      // (the player's jump is the height), and give it back once down.
      if (rig !== undefined) {
        const jumps = rig.userData.jumps as Record<string, { feet: Float32Array }> | undefined;
        if (jumps?.Gallop_Jump === undefined || jumps.Jump_toIdle === undefined) fail(`${model.id}: the jumps were not measured off the rig`);
        let lowered = 0;
        for (let t = 0; t < 0.7; t += 1 / 60) {
          motion2.update(1 / 60, { ...AT_REST, engine: true, speed: 30, throttle: 1, grounded: false });
          lowered = Math.min(lowered, rig.position.y);
        }
        for (let t = 0; t < 3; t += 1 / 60) motion2.update(1 / 60, { ...AT_REST, engine: true, speed: 30, throttle: 1 });
        if (!(lowered < -0.1)) fail(`${model.id}: a leap does not take the clip's own rise off (${f(lowered, 3)})`);
        if (Math.abs(rig.position.y) > 1e-6) fail(`${model.id}: the rig is still ${f(rig.position.y, 3)} off its place after landing`);
        // A fall off a height lasts longer than any clip: held in one pose
        // all the way down, whatever each frame's length, and given back
        // once it is down. Stepping the clip back and on again each frame
        // drew two poses in turn, and the fall flickered.
        let held: [number, number] | null = null;
        let wander = 0;
        for (let i = 0; i < 240; i++) {
          motion2.update(i % 2 === 0 ? 1 / 60 : 1 / 45, { ...AT_REST, engine: true, speed: 30, throttle: 1, grounded: false });
          if (i < 120) continue;
          held ??= [rig.position.y, motion2.lift];
          wander = Math.max(wander, Math.abs(rig.position.y - held[0]), Math.abs(motion2.lift - held[1]));
        }
        if (wander > 1e-6) fail(`${model.id}: a long fall does not hold one pose (it wanders ${f(wander, 4)})`);
        for (let t = 0; t < 3; t += 1 / 60) motion2.update(1 / 60, { ...AT_REST, engine: true, speed: 30, throttle: 1 });
        if (Math.abs(rig.position.y) > 1e-6) fail(`${model.id}: the rig is still ${f(rig.position.y, 3)} off its place after a long fall`);
        proper(fresh, model.id);
        extra += `, a leap lowers the rig ${f(-lowered, 2)} under the clip's rise, a fall holds`;
      }
      // Its withers at `WITHERS` of a person, and not the herds' giant.
      const { WITHERS } = await import('../../src/craft/horse.ts');
      const { rigBack } = await import('../../src/fauna/contract.ts');
      const still = model.build(0);
      still.updateMatrixWorld(true);
      const held = still.getObjectByName('rig');
      const withers = held === undefined ? 0 : held.scale.y * rigBack(horseRig);
      if (Math.abs(withers / H - WITHERS) > 0.02) fail(`${model.id}: its withers are ${f(withers / H)} bodies up, not ${WITHERS}`);
      // And the saddle on its back, not on its withers or its neck: a quarter
      // of the way from the forelegs to the hind legs at least, which the
      // withers over the forelegs are not, and no higher than the withers.
      const seat = model.seats[0]!;
      const legZ = (pattern: RegExp): number | null => {
        let z: number | null = null;
        still.traverse((object) => {
          if (z === null && (object as THREE.Bone).isBone && pattern.test(object.name)) z = object.getWorldPosition(new THREE.Vector3()).z;
        });
        return z;
      };
      const fore = legZ(/^Front(Upper)?Leg/);
      const hind = legZ(/^Back(Upper)?Leg/);
      if (fore === null || hind === null) fail(`${model.id}: no leg bones to find the back between`);
      else if (!(fore - seat.z > 0.25 * (fore - hind) && seat.z > hind)) fail(`${model.id}: the seat at z ${f(seat.z)} is on the withers, not the back, between the forelegs at ${f(fore)} and the hind legs at ${f(hind)}`);
      if (seat.y - 0.04 * H > withers + 0.01 * H) fail(`${model.id}: the saddle's back is ${f(seat.y - 0.04 * H)} up, over the withers at ${f(withers)}`);
      extra += `, its withers ${f(withers / H)} bodies up, the seat ${f(fore !== null ? fore - seat.z : NaN)} behind the forelegs`;
    }
    console.log(`  ${model.id.padEnd(12)} lean ${f(leaned, 3)}  pitch ${f(pitched, 3)}  wheels ${wheels.length}  at rest after it was let go${extra}`);
  }

  const { buildStrip, buildWindsock, STRIP_LENGTH } = await import('../../src/craft/airstrip.ts');
  const site = { at: new THREE.Vector3(0.3, 0.8, 0.2).normalize(), forward: new THREE.Vector3() };
  site.forward.set(0, 1, 0).projectOnPlane(site.at).normalize();
  const strip = buildStrip(site, () => 16000, new THREE.Color(0.4, 0.5, 0.3));
  const position = strip.geometry.getAttribute('position');
  const normal = strip.geometry.getAttribute('normal');
  let down = 0;
  const n = new THREE.Vector3();
  for (let i = 0; i < normal.count; i++) if (n.fromBufferAttribute(normal, i).dot(site.at) <= 0) down++;
  if (down > 0) fail(`the airstrip has ${down} vertices facing the ground`);
  strip.geometry.computeBoundingSphere();
  const reach = strip.geometry.boundingSphere!.radius * 2;
  if (reach < STRIP_LENGTH) fail(`the airstrip is ${f(reach)} long, shorter than the ${STRIP_LENGTH} it stands for`);
  const sock = buildWindsock();
  const pivot = sock.getObjectByName('rotor');
  if (pivot === undefined) fail('the windsock has no pivot');
  for (let t = 0; t < 4; t += 0.25) {
    if (pivot !== undefined) pivot.rotation.set(0.6 * Math.sin(t), t * 2, 0);
    proper(sock, 'windsock');
  }
  console.log(`  airstrip     ${position.count / 3} triangles, ${f(reach, 0)} units end to end; windsock ${sock.children.length} parts`);
  console.log(`  the least determinant under any motion: ${f(worst.det, 4)}`);
}
