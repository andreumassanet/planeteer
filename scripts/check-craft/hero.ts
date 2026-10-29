import './cabins.ts';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PUBLIC, AVATAR_HIP, HERO, f, fail, craft } from './setup.ts';
import * as THREE from 'three';
import { AVATAR_HEIGHT } from '../../src/stature.ts';

// --- the hero, measured again -------------------------------------------------

console.log('\nthe hero the seats are built round, re-measured off the cast:');
{
  const g = globalThis as Record<string, unknown>;
  const realFetch = g.fetch;
  g.fetch = async (url: string) => {
    const bytes = readFileSync(resolve(PUBLIC, `.${String(url).replace(/^[^/]*\/\/[^/]*/, '')}`));
    return { ok: true, status: 200, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
  };
  try {
    const avatar = await import('../../src/avatar.ts');
    await avatar.prepareAvatar();
    const hero = avatar.buildAvatar();
    const boxOf = (object: THREE.Object3D): THREE.Box3 => {
      object.updateMatrixWorld(true);
      // A skinned body's precise box reads its bone matrices, which only a
      // render or `skeleton.update()` refreshes.
      object.traverse((o) => {
        if ((o as THREE.SkinnedMesh).isSkinnedMesh) (o as THREE.SkinnedMesh).skeleton.update();
      });
      return new THREE.Box3().setFromObject(object, true);
    };
    for (let i = 0; i < 30; i++) hero.stride(0.05, 0, false);
    const stand = boxOf(hero.group);
    for (let i = 0; i < 60; i++) hero.sit(0.05);
    const sit = boxOf(hero.group);
    const hip = AVATAR_HIP;
    const measured: [string, number, number][] = [
      ['crown over the hip', sit.max.y - hip, HERO.crown],
      ['sole under the hip', hip - sit.min.y, HERO.sole],
      ['toe ahead of the hip', sit.max.z, HERO.toe],
      ['pack behind the hip', -sit.min.z, HERO.back],
      ['half-width seated', Math.max(-sit.min.x, sit.max.x), HERO.half],
      ['standing crown', stand.max.y, HERO.standing],
      ['standing depth', Math.max(-stand.min.z, stand.max.z), HERO.depth],
    ];
    // At the wheel of a car, the legs forward to the pedals (`HERO.drive`).
    for (let i = 0; i < 60; i++) hero.sit(0.05, { legs: 'drive' });
    const drive = boxOf(hero.group);
    measured.push(['sole, at the wheel', hip - drive.min.y, HERO.drive.sole], ['toe, at the wheel', drive.max.z, HERO.drive.toe]);
    for (const [name, now, table] of measured) {
      const off = Math.abs(now - table) / table;
      console.log(`  ${name.padEnd(22)} ${f(now)} measured, ${f(table)} in HERO (${f(off * 100, 1)}%)`);
      if (off > 0.05) fail(`HERO's ${name} is ${f(table)} and the cast now measures ${f(now)}: re-measure body.ts`);
    }

    // The hands on a wheel: each wrist where `holdWheel` puts it, a palm's
    // breadth short of its hold on the rim, straight and at full lock both
    // ways; and off it, back where the clips have them.
    {
      const { wheelHand } = await import('../../src/cast.ts');
      const { WHEEL_LOCK } = await import('../../src/craft/cabin.ts');
      const { WHEEL_HOLD } = await import('../../src/cast.ts');
      const { BAR_TUBE: RIM_TUBE } = await import('../../src/cast/hold.ts');
      // How far a wrist may bend off its forearm's line, holding a rim.
      const WRIST_LIMIT = (24 * Math.PI) / 180;
      const wristOf = (side: 'L' | 'R'): THREE.Vector3 => {
        let bone: THREE.Object3D | undefined;
        hero.group.traverse((o) => {
          if ((o as THREE.Bone).isBone && (o.name === `Wrist.${side}` || o.name === `Wrist${side}`)) bone = o;
        });
        return hero.group.worldToLocal(bone!.getWorldPosition(new THREE.Vector3()));
      };
      // A finger's joints in its wrist's own frame, to see a hand close.
      const boneNamed = (name: string): THREE.Object3D => {
        let bone: THREE.Object3D | undefined;
        hero.group.traverse((o) => {
          if ((o as THREE.Bone).isBone && (o.name === name || o.name === name.replace('.', ''))) bone = o;
        });
        return bone!;
      };
      const inHand = (side: 'L' | 'R', name: string): THREE.Vector3 => {
        hero.group.updateMatrixWorld(true);
        return boneNamed(`Wrist.${side}`).worldToLocal(boneNamed(`${name}.${side}`).getWorldPosition(new THREE.Vector3()));
      };
      for (let i = 0; i < 30; i++) hero.stride(0.05, 0, false);
      hero.group.updateMatrixWorld(true);
      const rest = [wristOf('L'), wristOf('R')];
      // Open, standing: each middle fingertip's joint, and the side of the palm the thumb is on.
      const openTip = (['L', 'R'] as const).map((side) => inHand(side, 'Middle4'));
      const palmOf = (['L', 'R'] as const).map((side) => {
        const along = inHand(side, 'Middle3').sub(inHand(side, 'Middle2'));
        const palm = along.cross(inHand(side, 'Pinky2').sub(inHand(side, 'Index2'))).normalize();
        return inHand(side, 'Thumb3').sub(inHand(side, 'Middle2')).dot(palm) < 0 ? palm.negate() : palm;
      });
      /** How far each hand's middle finger has closed: the tip's way towards the palm, as a share of its open reach. */
      const closing = (): number[] => (['L', 'R'] as const).map((side, i) => {
        const moved = inHand(side, 'Middle4').sub(openTip[i]!);
        return moved.dot(palmOf[i]!) / openTip[i]!.length();
      });
      // Where a closed hand holds: between its middle knuckle and its middle
      // finger's last joint, which is the curl's middle.
      const heldBy = (side: 'L' | 'R'): THREE.Vector3 => {
        hero.group.updateMatrixWorld(true);
        const at = (name: string): THREE.Vector3 => hero.group.worldToLocal(boneNamed(`${name}.${side}`).getWorldPosition(new THREE.Vector3()));
        return at('Middle2').add(at('Middle4')).multiplyScalar(0.5);
      };
      const jointOf = (name: string): THREE.Vector3 => hero.group.worldToLocal(boneNamed(name).getWorldPosition(new THREE.Vector3()));
      // A forearm's half-thickness, and how far round the rim's section a hand closes.
      const FOREARM = AVATAR_HEIGHT * 0.022;
      for (const model of craft.values()) {
        const seat = model.seats[0]!;
        if (seat.wheel === undefined) continue;
        const wheel = seat.wheel;
        let worst = 0;
        let through = Infinity;
        let bent = 0;
        let nearest = Infinity;
        let nearestAt = '';
        for (const turn of [-WHEEL_LOCK, -WHEEL_HOLD, 0, WHEEL_HOLD, WHEEL_LOCK]) {
          for (let i = 0; i < 20; i++) hero.sit(0.05, seat, turn);
          hero.group.updateMatrixWorld(true);
          const hipAt = new THREE.Vector3(0, hip, 0);
          const middle = new THREE.Vector3(...wheel.centre).add(hipAt);
          const axle = new THREE.Vector3(0, -Math.sin(wheel.tilt), Math.cos(wheel.tilt));
          for (const [side, name] of [[1, 'L'], [-1, 'R']] as const) {
            if (wheel.rest?.side === side) continue;
            worst = Math.max(worst, heldBy(name).distanceTo(wheelHand(hipAt, wheel, turn, side, new THREE.Vector3())));
            // The forearm from the elbow to the wrist, kept out of the
            // wheel's disc: behind it by its own half-thickness, or outside the rim.
            const elbow = jointOf(`LowerArm.${name}`);
            const wrist = jointOf(`Wrist.${name}`);
            for (let k = 0; k <= 10; k++) {
              const point = elbow.clone().lerp(wrist, k / 10).sub(middle);
              const depth = point.dot(axle);
              const round = point.addScaledVector(axle, -depth).length();
              if (round < wheel.radius) through = Math.min(through, -depth - FOREARM);
            }
            // The wrist straight: the hand on in the forearm's line, within `WRIST_LIMIT`.
            const knuckle = jointOf(`Middle2.${name}`);
            const bend = wrist.clone().sub(elbow).normalize().angleTo(knuckle.clone().sub(wrist).normalize());
            bent = Math.max(bent, bend);
            // The fingers closed round the rim: no finger joint past the knuckle inside its section,
            // and the middle finger's last two over its far face.
            for (const finger of ['Index', 'Middle', 'Ring', 'Pinky']) {
              for (const n of [3, 4]) {
                const point = jointOf(`${finger}${n}.${name}`).sub(middle);
                const depth = point.dot(axle);
                const round = point.addScaledVector(axle, -depth).length();
                const clear = Math.hypot(depth, round - wheel.radius);
                if (clear < nearest) {
                  nearest = clear;
                  nearestAt = `${name}.${finger}${n} at ${f(turn)}`;
                }
                if (finger === 'Middle' && depth < 0) fail(`${model.id}: the ${name === 'L' ? 'left' : 'right'} middle finger is not round the rim's far face at a turn of ${f(turn)}`);
              }
            }
            // The elbow outside the chest: outboard of its own shoulder joint
            // wherever it is not ahead of the trunk (`envelopeOf`'s front).
            const shoulder = jointOf(`UpperArm.${name}`);
            if (Math.abs(elbow.x) < Math.abs(shoulder.x) && elbow.z < 0.1 * AVATAR_HEIGHT && elbow.z > -HERO.back) {
              fail(`${model.id}: the ${name === 'L' ? 'left' : 'right'} elbow is inside the trunk at a turn of ${f(turn)}`);
            }
          }
        }
        // Held at full lock as the idle breathes under it, a hand keeps its grip rather than flicking between two.
        let flick = 0;
        for (const turn of [WHEEL_LOCK, -WHEEL_LOCK]) {
          let before: THREE.Vector3[] | null = null;
          for (let i = 0; i < 120; i++) {
            hero.sit(0.017, seat, turn);
            hero.group.updateMatrixWorld(true);
            const now = (['L', 'R'] as const).map((name) => jointOf(`Middle2.${name}`).sub(jointOf(`Wrist.${name}`)).normalize());
            if (before !== null && i > 20) now.forEach((v, k) => (flick = Math.max(flick, v.angleTo(before![k]!))));
            before = now;
          }
        }
        if (flick > (4 * Math.PI) / 180) fail(`${model.id}: a hand held at full lock turns ${f((flick * 180) / Math.PI, 0)} degrees in one frame`);
        if (through < 0) fail(`${model.id}: a forearm passes ${f(-through)} into the wheel`);
        if (bent > WRIST_LIMIT) fail(`${model.id}: a wrist is bent ${f((bent * 180) / Math.PI, 0)} degrees off its forearm`);
        if (nearest < RIM_TUBE * 0.8) fail(`${model.id}: a finger joint (${nearestAt}) is ${f(nearest)} from the rim's centreline, inside its section (${f(RIM_TUBE)})`);
        const closed = closing();
        const resting = seat.wheel.rest?.side;
        const holding = closed.filter((_, i) => resting !== (i === 0 ? 1 : -1));
        if (holding.some((share) => share < 0.15)) fail(`${model.id}: the hands on the wheel are open (${closed.map((c) => f(c)).join(', ')} closed)`);
        for (let i = 0; i < 3; i++) hero.stride(0.05, 0, false);
        hero.group.updateMatrixWorld(true);
        const opened = closing();
        if (opened.some((share) => Math.abs(share) > 0.02)) fail(`${model.id}: getting out kept the hands closed (${opened.map((c) => f(c)).join(', ')})`);
        const left = Math.max(wristOf('L').distanceTo(rest[0]!), wristOf('R').distanceTo(rest[1]!));
        console.log(`  at the wheel ${model.id.padEnd(9)} at full lock a hand turns at most ${f((flick * 180) / Math.PI, 1)} degrees a frame; the hands at most ${f(worst)} from their holds on the rim, the forearms ${Number.isFinite(through) ? f(through) : 'never'} behind it, the wrists bent at most ${f((bent * 180) / Math.PI, 0)} degrees, the fingers ${f(nearest)} clear of the rim's centreline, the hands ${closed.map((c) => f(c)).join(' and ')} closed; off it, ${f(left)} from standing`);
        if (worst > AVATAR_HEIGHT * 0.02) fail(`${model.id}: the hands are ${f(worst)} off the wheel's rim`);
        if (left > AVATAR_HEIGHT * 0.02) fail(`${model.id}: getting out kept the hands on the wheel (${f(left)} from standing)`);
      }
      // Astride: each closed hand on its handlebar grip, the bars straight.
      for (const model of craft.values()) {
        const seat = model.seats[0]!;
        if (seat.pose !== 'ride' || seat.bars === undefined) continue;
        for (let i = 0; i < 20; i++) hero.ride(0.05, seat, 0);
        const hipAt = new THREE.Vector3(0, hip, 0);
        let off = 0;
        let bent = 0;
        for (const [side, name] of [[1, 'L'], [-1, 'R']] as const) {
          const bar = new THREE.Vector3(side * seat.bars.at[0], seat.bars.at[1], seat.bars.at[2]).add(hipAt);
          off = Math.max(off, heldBy(name).distanceTo(bar));
          const elbow = jointOf(`LowerArm.${name}`);
          const wrist = jointOf(`Wrist.${name}`);
          bent = Math.max(bent, wrist.clone().sub(elbow).normalize().angleTo(jointOf(`Middle2.${name}`).sub(wrist).normalize()));
        }
        console.log(`  on the bars ${model.id.padEnd(10)} the hands at most ${f(off)} from their grips, the wrists bent at most ${f((bent * 180) / Math.PI, 0)} degrees`);
        if (bent > WRIST_LIMIT) fail(`${model.id}: a wrist is bent ${f((bent * 180) / Math.PI, 0)} degrees off its forearm on the bars`);
        if (off > AVATAR_HEIGHT * 0.02) fail(`${model.id}: the hands are ${f(off)} off the bars' grips`);
      }
    }

    // Out of an aircraft: face down and flat in the fall, and under the
    // canopy hanging upright with both hands on the toggles its lines end in.
    const { CHUTE_GRIP } = await import('../../src/craft/parachute.ts');
    for (let i = 0; i < 60; i++) hero.skydive(0.05, 0, 0, CHUTE_GRIP);
    const falling = boxOf(hero.group);
    const flat = falling.max.y - falling.min.y;
    const long = falling.max.z - falling.min.z;
    console.log(`  falling                ${f(flat)} tall, ${f(long)} long`);
    if (!(flat < AVATAR_HEIGHT * 0.6 && long > AVATAR_HEIGHT * 0.6)) fail(`the fall's pose is not face down and flat: ${f(flat)} tall, ${f(long)} long`);
    for (let i = 0; i < 60; i++) hero.skydive(0.05, 1, 0, CHUTE_GRIP);
    hero.group.updateMatrixWorld(true);
    const wrist = new THREE.Vector3();
    const misses: number[] = [];
    for (const side of ['L', 'R'] as const) {
      let bone: THREE.Object3D | undefined;
      hero.group.traverse((o) => {
        if ((o as THREE.Bone).isBone && (o.name === `Wrist.${side}` || o.name === `Wrist${side}`)) bone = o;
      });
      if (bone === undefined) continue;
      hero.group.worldToLocal(bone.getWorldPosition(wrist));
      const grip = new THREE.Vector3(side === 'L' ? CHUTE_GRIP[0] : -CHUTE_GRIP[0], CHUTE_GRIP[1], CHUTE_GRIP[2]);
      misses.push(wrist.distanceTo(grip));
    }
    const hanging = boxOf(hero.group);
    console.log(`  under the canopy       wrists ${misses.map((m) => f(m)).join(' and ')} off the toggles, ${f(hanging.max.y - hanging.min.y)} tall`);
    if (misses.length !== 2 || misses.some((miss) => miss > AVATAR_HEIGHT * 0.06)) fail(`the hands are not on the canopy's toggles: ${misses.map((m) => f(m)).join(', ')} off`);

    // A right turn pulls the right toggle down to the chest, and its line
    // comes down with the hand: the line's end, stretched by `openCanopy`,
    // and the wrist the pull put there.
    const { CHUTE_PULL, buildParachute, openCanopy } = await import('../../src/craft/parachute.ts');
    for (let i = 0; i < 30; i++) hero.skydive(0.05, 1, 1, CHUTE_GRIP, CHUTE_PULL, [0, 0]);
    hero.group.updateMatrixWorld(true);
    const pulledTo = new THREE.Vector3(-CHUTE_GRIP[0], CHUTE_GRIP[1] - CHUTE_PULL, CHUTE_GRIP[2] + CHUTE_PULL * 0.25);
    let rightWrist: THREE.Object3D | undefined;
    hero.group.traverse((o) => {
      if ((o as THREE.Bone).isBone && (o.name === 'Wrist.R' || o.name === 'WristR')) rightWrist = o;
    });
    const handMiss = rightWrist === undefined ? Infinity : hero.group.worldToLocal(rightWrist.getWorldPosition(wrist)).distanceTo(pulledTo);
    const canopy = buildParachute();
    openCanopy(canopy, 10, 0, 1, 0);
    canopy.updateMatrixWorld(true);
    // Each line laid down its pivot's -Y, its rest length long: its end, in the player's frame.
    const toggles = (canopy.children[0]?.userData.toggles ?? []) as { pivot: THREE.Object3D; length: number }[];
    const lineEnds = toggles.map((toggle) => toggle.pivot.localToWorld(new THREE.Vector3(0, -toggle.length, 0)));
    const lineMiss = Math.min(...lineEnds.map((end) => end.distanceTo(pulledTo)));
    console.log(`  a toggle pulled         the wrist ${f(handMiss)} and the line's end ${f(lineMiss)} off the pulled grip`);
    if (handMiss > AVATAR_HEIGHT * 0.06) fail(`a right turn does not pull the right hand down to its toggle: ${f(handMiss)} off`);
    if (lineEnds.length !== 2 || lineMiss > AVATAR_HEIGHT * 0.04) fail(`the steering line does not follow the hand down: ${f(lineMiss)} off`);

    // Astride: a scooter is ridden sitting up, and every saddle's lean and
    // reach comes off the body with it. The lean is the line from the hips to
    // the neck against the vertical; a body that kept the pose stood with its
    // arms up at bars no longer there, and a lean laid on again each frame
    // wound a scooter's rider flat over its bars.
    const boneOf = (name: string): THREE.Object3D | undefined => {
      let found: THREE.Object3D | undefined;
      hero.group.traverse((o) => {
        if ((o as THREE.Bone).isBone && (o.name === name || o.name === name.replace('.', ''))) found = o;
      });
      return found;
    };
    const at = (name: string): THREE.Vector3 => {
      hero.group.updateMatrixWorld(true);
      return hero.group.worldToLocal(boneOf(name)!.getWorldPosition(new THREE.Vector3()));
    };
    const leanOf = (): number => {
      const spine = at('Neck').sub(at('Hips'));
      return Math.atan2(spine.z, spine.y);
    };
    const DEG = 180 / Math.PI;
    for (let i = 0; i < 30; i++) hero.stride(0.05, 0, false);
    const standingWrists = ['Wrist.L', 'Wrist.R'].map(at);
    /** How far each middle fingertip's joint reaches from its wrist: a closed hand's is shorter. */
    const reach = (): number[] => ['L', 'R'].map((side) => at(`Middle4.${side}`).distanceTo(at(`Wrist.${side}`)));
    const openReach = reach();
    const standingLean = leanOf();
    const UPRIGHT: Record<string, number> = { scooter: 18 / DEG };
    for (const id of ['scooter', 'bicycle', 'motorbike', 'tuk-tuk', 'jet-ski', 'horse']) {
      const seat = craft.get(id)?.seats.find((s) => s.pose === 'ride');
      if (seat === undefined) continue;
      const leans: number[] = [];
      for (let i = 0; i < 90; i++) {
        hero.ride(0.05, seat, i * 0.3);
        if (i % 30 === 29) leans.push(leanOf());
      }
      const gripped = reach().map((r, i) => r / openReach[i]!);
      if (gripped.some((share) => share > 0.85)) fail(`${id}: the rider's hands are open on the grips (the fingers reach ${gripped.map((g) => f(g)).join(', ')} of open)`);
      const wound = Math.max(...leans) - Math.min(...leans);
      const lean = leans[leans.length - 1]!;
      hero.stride(0.05, 0, false);
      const left = Math.max(...['Wrist.L', 'Wrist.R'].map((name, i) => at(name).distanceTo(standingWrists[i]!)));
      const after = Math.abs(leanOf() - standingLean);
      console.log(`  astride ${id.padEnd(10)} lean ${f(lean * DEG, 1)} deg, ${f(wound * DEG, 2)} wound over 90 frames; off, the wrists ${f(left)} from standing, the spine ${f(after * DEG, 1)} deg`);
      if (wound > 0.5 / DEG) fail(`${id}: the rider's lean changes frame to frame (${f(wound * DEG, 1)} deg): it is laid on again over itself`);
      if (UPRIGHT[id] !== undefined && lean > UPRIGHT[id]) fail(`${id}: the rider leans ${f(lean * DEG, 1)} deg forward, not sitting up (at most ${f(UPRIGHT[id] * DEG, 0)})`);
      if (left > AVATAR_HEIGHT * 0.02 || after > 1 / DEG) fail(`${id}: getting off kept the seat's pose: the wrists ${f(left)} from standing, the spine ${f(after * DEG, 1)} deg`);
    }
  } catch (error) {
    fail(`the cast did not load, so HERO was not re-measured: ${(error as Error).message}`);
  } finally {
    g.fetch = realFetch;
  }
}
