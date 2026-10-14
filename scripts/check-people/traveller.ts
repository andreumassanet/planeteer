import './speech.ts';
import { type Appearance, encodeAppearance, LOOK_MAX, fitAppearance, decodeAppearance, DEFAULT_APPEARANCE, SLOTS, WARDROBE, SKINS, HAIR, CLOTH, randomAppearance, PACK, wardrobeOf, coloursOf } from '../../src/appearance.ts';
import { LOOK_PATTERN, cleanLook } from '../../server/src/limits.ts';
import { fail } from './setup.ts';
import { rngFrom } from '../../src/scenery/random.ts';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { loadCast, castMaterial, OUTFITS, PARTS, roleOf, BODY_HEIGHT, paintWith } from '../../src/cast.ts';
import * as THREE from 'three';
import { PALETTE } from '../../src/theme.ts';

// ---------------------------------------------------------------------------
// The traveller: the appearance on the wire, the relay's check, the wardrobe
// ---------------------------------------------------------------------------

console.log('\nthe traveller\'s appearance:');
{
  const same = (a: Appearance, b: Appearance | null): boolean => b !== null && JSON.stringify(a) === JSON.stringify(b);
  let coded = 0;
  const check = (appearance: Appearance, what: string): void => {
    const code = encodeAppearance(appearance);
    coded++;
    if (!LOOK_PATTERN.test(code)) fail(`${what}: ${code} is not a look the relay passes on`);
    if (cleanLook(code) !== code) fail(`${what}: the relay keeps ${code} as ${cleanLook(code)}`);
    if (code.length > LOOK_MAX) fail(`${what}: ${code} is longer than a code may be`);
    if (!same(fitAppearance(appearance), decodeAppearance(code))) fail(`${what}: ${code} does not decode to what was encoded`);
  };
  check(DEFAULT_APPEARANCE, 'the default');
  // Every choice of every slot, and every colour, on both bodies.
  for (const body of ['man', 'woman'] as const) {
    for (const slot of SLOTS) {
      for (let i = 0; i < WARDROBE[body][slot].length; i++) check({ ...DEFAULT_APPEARANCE, body, [slot]: i }, `${body} ${slot} ${i}`);
    }
    for (let i = 0; i < SKINS.length; i++) check({ ...DEFAULT_APPEARANCE, body, skin: i }, `${body} skin ${i}`);
    for (let i = 0; i < HAIR.length; i++) check({ ...DEFAULT_APPEARANCE, body, hair: i }, `${body} hair ${i}`);
    for (let i = 0; i < CLOTH.length; i++) {
      for (const field of ['topColour', 'bottomColour', 'feetColour', 'packColour'] as const) {
        check({ ...DEFAULT_APPEARANCE, body, [field]: i }, `${body} ${field} ${i}`);
      }
    }
    for (const pack of [true, false]) check({ ...DEFAULT_APPEARANCE, body, pack }, `${body} pack ${pack}`);
  }
  for (let i = 0; i < 2000; i++) check(randomAppearance(rngFrom('check-traveller', i)), `random ${i}`);
  // Every table has to fit one base-36 digit.
  for (const [name, length] of [['skins', SKINS.length], ['hair', HAIR.length], ['cloth', CLOTH.length]] as const) {
    if (length > 36) fail(`${name}: ${length} entries, more than one digit holds`);
  }
  // What the relay refuses, and what the reader refuses.
  const junk: unknown[] = [undefined, null, 12, {}, [], '', 'a', 'A000000000000', 'b000000000000', 'a00000000000<', 'a0000 0000000', 'a'.repeat(LOOK_MAX + 1)];
  for (const value of junk) {
    if (decodeAppearance(value) !== null) fail(`decodeAppearance(${JSON.stringify(value)}) is not null`);
  }
  // The relay checks the shape only, looser than the reader: `a` and a code of
  // another version pass it, and are the reader's to refuse.
  const shapeless = junk.filter((value) => value !== 'a' && value !== 'b000000000000');
  for (const value of [...shapeless, '<b>hi</b>', 'a0000000000\n0', 'ü000000000000', 42]) {
    if (cleanLook(value) !== '') fail(`the relay keeps ${JSON.stringify(value)} as a look`);
  }
  if (cleanLook('a'.repeat(LOOK_MAX)) === '') fail(`the relay refuses a code of ${LOOK_MAX}, the longest the game reads`);
  // A newer client's code: fields appended, and indices past this build's tables.
  const newer = decodeAppearance(`${encodeAppearance(DEFAULT_APPEARANCE)}zz`);
  if (!same(DEFAULT_APPEARANCE, newer)) fail('a code with fields appended does not decode to its first thirteen');
  const past = decodeAppearance('a0zzzzzzzzz1z');
  if (past === null) fail('a code with indices past the tables does not decode');
  else if (!same(fitAppearance(past), past)) fail('a code with indices past the tables decodes out of range');
  console.log(`  ${coded} codes written, read back and passed by the relay's pattern; ${junk.length} refused`);
}

console.log('\nthe wardrobe, dressed off the baked cast:');
{
  const g = globalThis as Record<string, unknown>;
  const realFetch = g.fetch;
  const PUBLIC = resolve(import.meta.dirname, '../../public');
  g.fetch = async (url: string) => {
    const bytes = readFileSync(resolve(PUBLIC, `.${String(url).replace(/^[^/]*\/\/[^/]*/, '')}`));
    return { ok: true, status: 200, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
  };
  try {
    const cast = await loadCast(castMaterial(new THREE.Texture(), { thickness: 0.005, color: [0, 0, 0] }), OUTFITS);
    // Every surface of every part is named, so none is painted by accident.
    let surfaces = 0;
    for (const outfit of OUTFITS) {
      for (const part of PARTS) {
        for (const material of cast.materialsOf({ outfit, part })) {
          surfaces++;
          if (roleOf({ outfit, part }, material) === null) fail(`${outfit}'s ${part}: ${material} has no role in cast.ts`);
        }
      }
    }
    // Every choice on the card is a part the cast has.
    for (const body of ['man', 'woman'] as const) {
      for (const slot of SLOTS) {
        for (const choice of WARDROBE[body][slot]) {
          if (cast.materialsOf({ outfit: choice.outfit, part: slot }).length === 0) fail(`${body} ${slot} '${choice.label}': ${choice.outfit} has no ${slot}`);
          if (!choice.outfit.startsWith(body)) fail(`${body} ${slot} '${choice.label}' is from the other body's rig`);
        }
      }
    }
    if (cast.materialsOf(PACK).length === 0) fail(`${PACK.outfit} has no rucksack`);

    const boxOf = (person: ReturnType<typeof cast.make>): THREE.Box3 => {
      person.mesh.skeleton.pose();
      person.root.updateMatrixWorld(true);
      person.mesh.skeleton.update();
      return new THREE.Box3().setFromObject(person.root, true);
    };
    // `BODY_HEIGHT` is the sole-to-crown of the outfits it was measured on.
    for (const [outfit, body] of [['man-hoodie', 'man'], ['woman-casual', 'woman']] as const) {
      const person = cast.make(outfit, () => null, BODY_HEIGHT[body]);
      const box = boxOf(person);
      const tall = box.max.y - box.min.y;
      if (Math.abs(tall / BODY_HEIGHT[body] - 1) > 0.005) fail(`${outfit} is ${tall.toFixed(4)} sole to crown, BODY_HEIGHT.${body} says ${BODY_HEIGHT[body]}`);
      cast.release(person);
    }

    // Every choice dressed, on the default and on a random traveller, and the
    // default's colours where the card says they are.
    const colourOf = new THREE.Color();
    const wears = (person: ReturnType<typeof cast.make>, color: number): boolean => {
      const want = colourOf.set(color);
      const colors = person.mesh.geometry.getAttribute('color');
      for (let v = 0; v < colors.count; v++) {
        if (Math.abs(colors.getX(v) - want.r) + Math.abs(colors.getY(v) - want.g) + Math.abs(colors.getZ(v) - want.b) < 1e-4) return true;
      }
      return false;
    };
    let dressed = 0;
    const dress = (appearance: Appearance, what: string): void => {
      const person = cast.make(wardrobeOf(appearance), paintWith(coloursOf(appearance)), 3.77);
      dressed++;
      const colors = person.mesh.geometry.getAttribute('color');
      for (let i = 0; i < colors.array.length; i++) {
        if (!Number.isFinite(colors.array[i]!)) {
          fail(`${what}: a colour that is not a number`);
          break;
        }
      }
      const colours = coloursOf(appearance);
      for (const [role, color] of [['skin', colours.skin], ['hair', colours.hair], ['top', colours.top], ['bottom', colours.bottom], ['shoes', colours.shoes]] as const) {
        if (!wears(person, color)) fail(`${what}: nothing is painted its ${role} colour`);
      }
      if (appearance.pack && !wears(person, colours.pack)) fail(`${what}: the rucksack is not its colour`);
      const box = boxOf(person);
      if (box.max.y < 3.77 * 0.9 || box.max.y > 3.77 * 1.12) fail(`${what}: the crown is at ${box.max.y.toFixed(2)} for a person 3.77 tall`);
      cast.release(person);
    };
    for (const body of ['man', 'woman'] as const) {
      const base: Appearance = { ...DEFAULT_APPEARANCE, body, head: 0, top: 0, bottom: 0, feet: 0 };
      for (const slot of SLOTS) {
        for (let i = 0; i < WARDROBE[body][slot].length; i++) dress({ ...base, [slot]: i }, `${body} ${slot} '${WARDROBE[body][slot][i]!.label}'`);
      }
      dress({ ...base, pack: false }, `${body} without a rucksack`);
    }
    for (let i = 0; i < 40; i++) dress(randomAppearance(rngFrom('check-wardrobe', i)), `random traveller ${i}`);
    // The default is the hero before anyone chooses: crimson, which nobody in the crowd wears.
    if (coloursOf(DEFAULT_APPEARANCE).top !== PALETTE.crimson) fail('the default traveller is not in crimson');
    console.log(`  ${surfaces} surfaces of ${OUTFITS.length} outfits, every one with a role; ${dressed} travellers dressed`);
  } catch (error) {
    fail(`the cast did not load, so the wardrobe was not dressed: ${(error as Error).stack ?? error}`);
  } finally {
    g.fetch = realFetch;
  }
}

console.log('\nthe cast in motion (`createMotion`), off the baked clips:');
{
  const g = globalThis as Record<string, unknown>;
  const realFetch = g.fetch;
  const PUBLIC = resolve(import.meta.dirname, '../../public');
  g.fetch = async (url: string) => {
    const bytes = readFileSync(resolve(PUBLIC, `.${String(url).replace(/^[^/]*\/\/[^/]*/, '')}`));
    return { ok: true, status: 200, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
  };
  try {
    const { createMotion, FALL_AFTER, RUN_PHASE, RUN_SPEED, RUN_STRIDE, SWIM_STROKE, WALK_SPEED, WALK_STRIDE } = await import('../../src/avatar.ts');
    const { AVATAR_HEIGHT } = await import('../../src/stature.ts');
    const cast = await loadCast(castMaterial(new THREE.Texture(), { thickness: 0.005, color: [0, 0, 0] }), ['man-hoodie', 'woman-casual']);
    const H = AVATAR_HEIGHT;
    const at = new THREE.Vector3();
    const where = (person: ReturnType<typeof cast.make>, name: string): THREE.Vector3 => {
      person.root.updateMatrixWorld(true);
      return person.bones.get(name)!.getWorldPosition(at);
    };
    const f2 = (n: number) => n.toFixed(2);

    // --- the run is played in step with the walk ---
    {
      const person = cast.make('man-hoodie', () => null, H);
      const pathOf = (name: 'Walk' | 'Run'): number[] => {
        person.mixer.stopAllAction();
        const action = person.actions.get(name)!;
        action.reset().play();
        const out: number[] = [];
        for (let i = 0; i < 100; i++) {
          action.time = (i / 100) * action.getClip().duration;
          person.mixer.update(0);
          out.push(where(person, 'FootL').z);
        }
        return out;
      };
      const normal = (c: number[]) => {
        const mean = c.reduce((a, b) => a + b) / c.length;
        const spread = Math.sqrt(c.reduce((a, b) => a + (b - mean) ** 2, 0));
        return c.map((x) => (x - mean) / spread);
      };
      const walk = normal(pathOf('Walk'));
      const run = normal(pathOf('Run'));
      let best = -2;
      let offset = 0;
      for (let k = 0; k < 100; k++) {
        let c = 0;
        for (let i = 0; i < 100; i++) c += walk[i]! * run[(i + k) % 100]!;
        if (c > best) [best, offset] = [c, k / 100];
      }
      const off = Math.abs(((offset - RUN_PHASE + 1.5) % 1) - 0.5);
      console.log(`  the run's left foot follows the walk's ${f2(offset)} of a cycle on (correlation ${best.toFixed(3)}); RUN_PHASE is ${RUN_PHASE}`);
      if (off > 0.02) fail(`RUN_PHASE is ${RUN_PHASE} and the clips now line up at ${f2(offset)}`);

      // How far a planted foot slides, per unit travelled, with the two clips
      // mixed `share` of the way to the run and the run `lead` ahead.
      const slideOf = (share: number, lead: number): number => {
        person.mixer.stopAllAction();
        const walkAction = person.actions.get('Walk')!;
        const runAction = person.actions.get('Run')!;
        walkAction.reset().play();
        runAction.reset().play();
        walkAction.setEffectiveWeight(1 - share);
        runAction.setEffectiveWeight(share);
        const speed = WALK_SPEED + (RUN_SPEED - WALK_SPEED) * share;
        const length = WALK_STRIDE + (RUN_STRIDE - WALK_STRIDE) * share;
        const steps = 240;
        const dt = length / speed / steps;
        let slid = 0;
        const last = [new THREE.Vector3(), new THREE.Vector3()];
        for (let i = 0; i <= steps; i++) {
          const phase = i / steps;
          walkAction.time = phase * walkAction.getClip().duration;
          runAction.time = ((phase + lead) % 1) * runAction.getClip().duration;
          person.mixer.update(0);
          const feet = [where(person, 'FootL').clone(), where(person, 'FootR').clone()];
          if (i > 0) {
            // The planted foot is the lower one, and the ground under it moves
            // back at the body's speed: anything else it does is a slide.
            const low = feet[0]!.y <= feet[1]!.y ? 0 : 1;
            const moved = feet[low]!.z - last[low]!.z + speed * dt;
            slid += Math.hypot(moved, feet[low]!.x - last[low]!.x);
          }
          last[0]!.copy(feet[0]!);
          last[1]!.copy(feet[1]!);
        }
        return slid / length;
      };
      const walkSlide = slideOf(0, RUN_PHASE);
      const runSlide = slideOf(1, RUN_PHASE);
      const worst = Math.max(walkSlide, runSlide);
      let blendWorst = 0;
      for (const share of [0.25, 0.5, 0.75]) blendWorst = Math.max(blendWorst, slideOf(share, RUN_PHASE));
      const unaligned = slideOf(0.5, 0);
      console.log(`  a planted foot slides ${f2(walkSlide)} of the distance walking and ${f2(runSlide)} running; ${f2(blendWorst)} at worst between them, ${f2(unaligned)} halfway with the clips out of step`);
      if (blendWorst > worst + 0.05) fail(`between the walk and the run a planted foot slides ${f2(blendWorst)} of the distance, over the ${f2(worst)} of either clip alone`);
      cast.release(person);
    }

    // A body played by `createMotion` for `seconds` at 60 Hz, `step` called each frame.
    const play = (person: ReturnType<typeof cast.make>, seconds: number, step: (motion: ReturnType<typeof createMotion>, t: number) => void, sample?: (t: number) => void) => {
      const motion = createMotion(person);
      for (let t = 0; t < seconds; t += 1 / 60) {
        step(motion, t);
        sample?.(t);
      }
      return motion;
    };

    // --- afloat: the head stays out, the body is in ---
    for (const outfit of ['man-hoodie', 'woman-casual'] as const) {
      const person = cast.make(outfit, () => null, H);
      const skeleton = person.mesh.skeleton;
      const headIndex = skeleton.bones.findIndex((b) => b.name === 'Head');
      const indices = person.mesh.geometry.getAttribute('skinIndex');
      const weights = person.mesh.geometry.getAttribute('skinWeight');
      const head: number[] = [];
      for (let v = 0; v < indices.count; v += 3) {
        let best = 0;
        let bone = -1;
        for (let k = 0; k < 4; k++) {
          if (weights.getComponent(v, k) > best) [best, bone] = [weights.getComponent(v, k), indices.getComponent(v, k)];
        }
        if (bone === headIndex) head.push(v);
      }
      const vertex = new THREE.Vector3();
      for (const [label, speed] of [['treading water', 0], ['swimming slowly', SWIM_STROKE * 0.3], ['swimming', SWIM_STROKE * 0.7], ['sprinting', SWIM_STROKE * 1.1]] as const) {
        let neck = Infinity;
        let crown = Infinity;
        let feet = Infinity;
        play(person, 5, (motion) => motion.swim(1 / 60, speed), (t) => {
          if (t < 1.5 || Math.round(t * 60) % 4 !== 0) return;
          person.root.updateMatrixWorld(true);
          skeleton.update();
          neck = Math.min(neck, where(person, 'Head').y);
          feet = Math.min(feet, where(person, 'FootL').y, where(person, 'FootR').y);
          let top = -Infinity;
          for (const v of head) top = Math.max(top, person.mesh.getVertexPosition(v, vertex).applyMatrix4(person.mesh.matrixWorld).y);
          crown = Math.min(crown, top);
        });
        console.log(`  ${outfit} ${label.padEnd(15)} the head's root at least ${f2(neck)} over the water, the crown ${f2(crown)}, the feet down to ${f2(feet)}`);
        if (neck < 0) fail(`${outfit} ${label}: the head goes under, its root ${f2(neck)} below the surface`);
        if (crown < H * 0.12) fail(`${outfit} ${label}: the crown comes within ${f2(crown)} of the water`);
        if (feet > -H * 0.02) fail(`${outfit} ${label}: the feet are out of the water, at ${f2(feet)}`);
      }
      cast.release(person);
    }

    // --- the stroke keeps pace with the water ---
    {
      const person = cast.make('man-hoodie', () => null, H);
      person.mixer.stopAllAction();
      const swim = person.actions.get('Swim')!;
      swim.reset().play();
      let pulled = 0;
      let last: [number, number] | null = null;
      for (let i = 0; i <= 120; i++) {
        swim.time = (i / 120) * swim.getClip().duration;
        person.mixer.update(0);
        const now: [number, number] = [where(person, 'WristL').z, where(person, 'WristR').z];
        const wet = [where(person, 'WristL').y < 0, where(person, 'WristR').y < 0];
        if (last !== null) for (const k of [0, 1]) if (wet[k] && now[k]! < last[k]!) pulled += last[k]! - now[k]!;
        last = now;
      }
      // Each hand pulls once a cycle, and the body goes a little past the two
      // pulls together: it glides.
      const pull = pulled;
      console.log(`  the hands pull ${f2(pull)} back through the water a cycle between them; a stroke carries the body ${f2(SWIM_STROKE)}`);
      if (SWIM_STROKE < pull || SWIM_STROKE > pull * 1.4) fail(`the crawl's pull is ${f2(pull)} a cycle and SWIM_STROKE ${f2(SWIM_STROKE)}: the arms and the sea disagree`);
      cast.release(person);
    }

    // --- a landing bends the knees, and stands back up, with the feet down ---
    {
      const person = cast.make('man-hoodie', () => null, H);
      const standing = play(person, 1, (motion) => motion.foot(1 / 60, 0, false));
      const hipsAt = where(person, 'Hips').y;
      const dip = (hardness: number): [number, number, number] => {
        let low = Infinity;
        let feet = -Infinity;
        standing.land(hardness);
        for (let t = 0; t < 1.6; t += 1 / 60) {
          standing.foot(1 / 60, 0, false);
          const y = where(person, 'Hips').y;
          low = Math.min(low, y);
          feet = Math.max(feet, where(person, 'FootL').y, where(person, 'FootR').y);
        }
        return [hipsAt - low, Math.abs(where(person, 'Hips').y - hipsAt), feet];
      };
      const [soft, softBack, softFeet] = dip(0);
      const [hard, hardBack, hardFeet] = dip(1);
      console.log(`  a landing drops the hips ${f2(soft)} after a jump and ${f2(hard)} after a fall, back to within ${f2(Math.max(softBack, hardBack))}; the feet no higher than ${f2(Math.max(softFeet, hardFeet))}`);
      if (!(hard > soft + 0.2 && soft > 0.1)) fail(`a landing's dip is ${f2(soft)} soft and ${f2(hard)} hard`);
      if (Math.max(softBack, hardBack) > 0.05) fail('a landing does not stand back up');
      if (Math.max(softFeet, hardFeet) > 0.3) fail(`a landing lifts a foot ${f2(Math.max(softFeet, hardFeet))} off the ground`);
      cast.release(person);
    }

    // --- a fall raises the arms; a jump does not ---
    {
      const person = cast.make('man-hoodie', () => null, H);
      let jump = -Infinity;
      let fall = -Infinity;
      play(person, FALL_AFTER + 1, (motion) => motion.foot(1 / 60, 0, true), (t) => {
        const hands = Math.max(where(person, 'WristL').y, where(person, 'WristR').y);
        if (t < FALL_AFTER - 0.1) jump = Math.max(jump, hands);
        else if (t > FALL_AFTER + 0.6) fall = Math.max(fall, hands);
      });
      console.log(`  the hands reach ${f2(jump)} in a jump and ${f2(fall)} once it is a fall`);
      if (fall < jump + 0.3) fail('a fall does not raise the arms over a jump');
      cast.release(person);
    }

    // --- standing, the head looks where the camera does, and not over its shoulder ---
    {
      const headYaw = (look: number, seconds: number): number => {
        const person = cast.make('man-hoodie', () => null, H);
        let yaw = 0;
        play(person, seconds, (motion) => motion.foot(1 / 60, 0, false, { look }));
        const plain = cast.make('man-hoodie', () => null, H);
        play(plain, seconds, (motion) => motion.foot(1 / 60, 0, false));
        person.root.updateMatrixWorld(true);
        plain.root.updateMatrixWorld(true);
        const q = person.bones.get('Head')!.getWorldQuaternion(new THREE.Quaternion());
        const p = plain.bones.get('Head')!.getWorldQuaternion(new THREE.Quaternion());
        const ahead = new THREE.Vector3(0, 0, 1).applyQuaternion(q.multiply(p.invert()));
        yaw = Math.atan2(ahead.x, ahead.z);
        cast.release(person);
        cast.release(plain);
        return yaw;
      };
      const side = headYaw(0.8, 2);
      const behind = headYaw(3.0, 2);
      console.log(`  a camera looking 0.80 to the left turns the head ${f2(side)}; looking back at the face, ${f2(behind)}`);
      if (Math.abs(side - 0.8) > 0.15) fail(`the head looks ${f2(side)} for a camera 0.8 off`);
      if (Math.abs(behind) > 0.1) fail(`the head turns ${f2(behind)} to a camera in front of the face`);
      // Standing long enough, it looks round of its own accord.
      const person = cast.make('man-hoodie', () => null, H);
      const plain = cast.make('man-hoodie', () => null, H);
      const a = createMotion(person);
      const b = createMotion(plain);
      let widest = 0;
      const q = new THREE.Quaternion();
      const p = new THREE.Quaternion();
      for (let t = 0; t < 30; t += 1 / 60) {
        a.foot(1 / 60, 0, false);
        b.still(1 / 60);
        if (Math.round(t * 60) % 10 !== 0) continue;
        person.root.updateMatrixWorld(true);
        plain.root.updateMatrixWorld(true);
        person.bones.get('Head')!.getWorldQuaternion(q);
        plain.bones.get('Head')!.getWorldQuaternion(p);
        const ahead = new THREE.Vector3(0, 0, 1).applyQuaternion(q.multiply(p.invert()));
        widest = Math.max(widest, Math.abs(Math.atan2(ahead.x, ahead.z)));
      }
      console.log(`  standing half a minute, the head looks round as far as ${f2(widest)}`);
      if (widest < 0.4) fail('a body standing still never looks round');
      cast.release(person);
      cast.release(plain);
    }

    // --- a person handed back mid-motion comes out of the pool standing ---
    {
      const person = cast.make('man-hoodie', () => null, H);
      const motion = play(person, 1.2, (m) => m.foot(1 / 60, 0, true));
      motion.swim(1 / 60, 3);
      // What `peers.ts` does before it lets a body go.
      motion.unlay();
      cast.release(person);
      const again = cast.make('man-hoodie', () => null, H);
      const idle = again.actions.get('Idle_Neutral')!;
      idle.reset().play();
      again.mixer.update(0);
      const hips = where(again, 'Hips').y;
      const wrist = Math.max(where(again, 'WristL').y, where(again, 'WristR').y);
      console.log(`  pooled and dressed again: hips at ${f2(hips)}, hands at ${f2(wrist)} (${again === person ? 'the same body' : 'a new body'})`);
      if (hips < H * 0.4 || wrist > H * 0.6) fail('a body let go mid-swim or mid-fall comes back out of the pool in that pose');
      cast.release(again);
    }
  } catch (error) {
    fail(`the cast did not load, so its motion was not measured: ${(error as Error).stack ?? error}`);
  } finally {
    g.fetch = realFetch;
  }
}
