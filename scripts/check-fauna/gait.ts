import './basics.ts';
import { type Animal, type GaitName, variantRng, legAt, foldLifts, GAITS, LEG_ORDER } from '../../src/fauna/contract.ts';
import { FAUNA_STYLES } from '../../src/fauna/regions.ts';
import { legsOf, buildAnimal, strideOf, poseBody, hooves } from '../../src/fauna/body.ts';
import { ctx, ANIMALS, n, check } from './setup.ts';
import * as THREE from 'three';

// ---------------------------------------------------------------------------
console.log('\nthe gait — the sweep the biped taught, with two joints instead of one');
// ---------------------------------------------------------------------------

/**
 * The whole argument, as a table.
 *
 * `foldLifts` says a fold lifts the foot only while it is taking the lower
 * segment further from vertical. For a knee that means the lower segment must
 * already be trailing; for a hock, already reaching. The fore leg is nearly
 * straight at rest and needs the gate; the hind leg is a `Z` at rest and does
 * not.
 */
const PHASES = 128;
interface Sweep {
  worstDip: number;
  /** Max, over phases, of the second-lowest hoof. Small means double support. */
  support2: number;
  /** Ditto the third-lowest. Small means a walk; large means a pace. */
  support3: number;
  /** How far the crown travels over a cycle. */
  bob: number;
  /** Phases at which a fold was applied while it would have pushed the foot down. */
  wrongWay: number;
  /** Phases at which a hind fold was outside its lifting half-plane at all. */
  hindOutside: number;
  /** Deepest a cannon's corner reaches below its own axis endpoint. */
  cornerDig: number;
  /** How high the swinging foot gets. The scale `support2` has to be read against. */
  maxFoot: number;
  stride: number;
}

function sweep(animal: Animal, gait: GaitName): Sweep {
  const style = FAUNA_STYLES['atlantic-europe'];
  const shape = animal.shape(variantRng(animal, style, 0), style);
  const legs = legsOf(shape, gait);
  const body = buildAnimal(ctx, shape, { kind: 'walk', gait, phase: 0 });
  const out: Sweep = {
    worstDip: 0, support2: 0, support3: 0, bob: 0,
    wrongWay: 0, hindOutside: 0, cornerDig: 0, maxFoot: 0, stride: strideOf(shape, gait),
  };
  let lowCrown = Infinity;
  let highCrown = -Infinity;
  const box = new THREE.Box3();
  for (let i = 0; i < PHASES; i++) {
    const phase = i / PHASES;
    const dip = poseBody(body, { kind: 'walk', gait, phase });
    if (dip < out.worstDip) out.worstDip = dip;

    // The arithmetic, per leg, independent of the built mesh.
    for (const leg of legs) {
      const at = legAt(leg, phase);
      const folding = at.fold > leg.restFold + 1e-9;
      if (folding && !foldLifts(at.lower, leg.kind)) out.wrongWay++;
      if (leg.kind === 'hock' && !foldLifts(at.lower, leg.kind)) out.hindOutside++;
    }

    // And the built mesh, which is the thing on the screen.
    const feet = hooves(body).map((point) => point.y).sort((a, b) => a - b);
    out.support2 = Math.max(out.support2, feet[1]!);
    out.support3 = Math.max(out.support3, feet[2]!);
    out.maxFoot = Math.max(out.maxFoot, feet[3]!);
    // The lowest hoof *axis* point sits above the mesh floor by exactly how far
    // the cannon's bottom corner has swung under it.
    out.cornerDig = Math.max(out.cornerDig, feet[0]!);
    box.setFromObject(body.root);
    lowCrown = Math.min(lowCrown, box.max.y);
    highCrown = Math.max(highCrown, box.max.y);
  }
  out.bob = highCrown - lowCrown;
  return out;
}

console.log('\n  id          gait   worst dip   2nd foot   3rd foot   top foot   corner dig    bob   stride');
const sweeps = new Map<string, Sweep>();
for (const animal of ANIMALS) {
  const result = sweep(animal, animal.gait);
  sweeps.set(animal.id, result);
  console.log(
    `  ${animal.id.padEnd(11)} ${animal.gait.padEnd(6)} ${n(result.worstDip, 4).padStart(9)}` +
    `  ${n(result.support2, 3).padStart(9)}  ${n(result.support3, 3).padStart(9)}  ${n(result.maxFoot, 3).padStart(8)}` +
    `  ${n(result.cornerDig, 4).padStart(10)}  ${n(result.bob, 3).padStart(5)}  ${n(result.stride, 2).padStart(6)}`,
  );
}

const worstDip = Math.min(...[...sweeps.values()].map((s) => s.worstDip));
check(worstDip > -0.01, 'no hoof of any animal ever ends up below the floor',
  `worst ${n(worstDip, 4)} over ${PHASES} phases x 4 legs x ${ANIMALS.length} animals`);

const wrongWay = [...sweeps.values()].reduce((sum, s) => sum + s.wrongWay, 0);
check(wrongWay === 0, 'every fold applied is a fold that lifts', `${wrongWay} phases folded the wrong way`);

const hindOutside = [...sweeps.values()].reduce((sum, s) => sum + s.hindOutside, 0);
check(hindOutside === 0,
  'the hind leg never leaves its lifting half-plane, so the hock needs no gate at all',
  `${hindOutside} of ${PHASES * 2 * ANIMALS.length} hind-leg phases outside it`);

/**
 * Support is a ratio and not a distance: a distance fails on the camel for a
 * reason that is not a fault. A foot rises at *both* extremes of its swing whether or not the joint
 * is folding — the leg is pivoting about the hip, so `L cos(h)` shortens at
 * either end of the arc — which means "how high is the second-lowest foot" has
 * a floor set by the swing amplitude and by nothing else. On a camel that is
 * 0.43 units, and the animal is not floating: it is a tall animal taking a long
 * stride. What says there is a planted pair is that the second foot stays well
 * under the *swinging* one, which is scale-free and is the same number for a
 * sheep and for a camel.
 */
const worstRatio = Math.max(...[...sweeps.values()].map((s) => s.support2 / s.maxFoot));
check(worstRatio < 0.55,
  'a planted pair is always clear of the swinging pair, so a frozen frame does not float',
  `worst second foot at ${n(100 * worstRatio, 0)}% of the swinging foot's own lift`);

/**
 * **What actually separates a pace from a walk is which pair moves together,
 * and it is not how many feet are down.** The obvious discriminator — a pacer
 * stands on two feet where a walker stands on three — measured as *no
 * difference at all*: the lift window is a quarter of a cycle either way, so
 * both gaits have about one foot up at a time and the camel's third foot sits
 * at 30% of the swing against cattle's 34%. The number that does separate them
 * is the gap between the two legs on one side against the gap across the
 * diagonal, straight out of the offsets.
 */
const gapOf = (a: number, b: number): number => {
  const d = Math.abs(a - b) % 1;
  return Math.min(d, 1 - d);
};
console.log('\n  gait   lateral pair   diagonal pair   what it is');
for (const [name, offsets] of Object.entries(GAITS)) {
  const lateral = gapOf(offsets[LEG_ORDER.indexOf('left-hind')]!, offsets[LEG_ORDER.indexOf('left-fore')]!);
  const diagonal = gapOf(offsets[LEG_ORDER.indexOf('left-hind')]!, offsets[LEG_ORDER.indexOf('right-fore')]!);
  const reads = lateral < diagonal * 0.5 ? 'a pace: one side moves as a unit'
    : Math.abs(lateral - diagonal) < 0.02 ? 'a walk: neither pair is favoured'
      : 'a trot';
  console.log(`  ${name.padEnd(6)} ${n(lateral, 3).padStart(12)}  ${n(diagonal, 3).padStart(14)}   ${reads}`);
}
{
  const lateral = gapOf(GAITS.pace[0], GAITS.pace[1]);
  const diagonal = gapOf(GAITS.pace[0], GAITS.pace[3]);
  check(lateral < diagonal * 0.35, 'the pace really does move one side as a unit',
    `${n(lateral, 3)} of a cycle laterally against ${n(diagonal, 3)} diagonally`);
  const wl = gapOf(GAITS.walk[0], GAITS.walk[1]);
  const wd = gapOf(GAITS.walk[0], GAITS.walk[3]);
  check(Math.abs(wl - wd) < 1e-9, 'and the walk favours neither pair', `${n(wl, 3)} against ${n(wd, 3)}`);
}

const dig = Math.max(...[...sweeps.values()].map((s) => s.cornerDig));
console.log(
  `  note  the cannon has no ankle joint: its bottom corner reaches ${n(dig, 3)} under its own axis,\n` +
  `        against the 0.42 that made \`avatar.ts\` give a rigid boot one.`,
);

// Contralateral, which is the one thing a gait cannot get wrong, and which the
// crowd shipped backwards for months.
for (const [name, offsets] of Object.entries(GAITS)) {
  const gap = (a: number, b: number): number => {
    const d = Math.abs(a - b) % 1;
    return Math.min(d, 1 - d);
  };
  const hind = gap(offsets[LEG_ORDER.indexOf('left-hind')]!, offsets[LEG_ORDER.indexOf('right-hind')]!);
  const fore = gap(offsets[LEG_ORDER.indexOf('left-fore')]!, offsets[LEG_ORDER.indexOf('right-fore')]!);
  check(Math.abs(hind - 0.5) < 1e-9 && Math.abs(fore - 0.5) < 1e-9,
    `${name}: the two hinds and the two fores are half a cycle apart`,
    `hind ${n(hind, 3)}, fore ${n(fore, 3)}`);
}
// A walk is four beats and a pace is two: the number of *distinct* footfall
// times is what separates them, and it is the whole of `GAITS`.
check(new Set(GAITS.walk).size === 4, 'the walk is four-beat');
check(new Set(GAITS.pace.map((o) => Math.round(o * 2) / 2)).size === 2, 'the pace is two-beat');
