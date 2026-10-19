import type { Group, Monument, MonumentContext, Object3D } from './contract.ts';

/**
 * Deadvlei, Namib-Naukluft, Namibia.
 *
 * A white clay pan at the foot of some of the tallest dunes on Earth, dotted
 * with camelthorn trees that died some seven hundred years ago and stand black
 * and leafless in the dry air. What names it, in order: the burnt-orange dune
 * with a sharp crest, one face lit and one in shadow; the white floor; and the
 * black dead trees on it.
 *
 * The dune is a chain of ridges, each a three-sided prism laid along its
 * crest and squashed by a parent (the scale on the parent, the turn on the child), the
 * sand `orange` toned down and the cel ramp putting one flank in shadow. The trees are
 * struts in `bark` darkened. Drawn 30 tall for Big Daddy's 325 m.
 */

const DEG = Math.PI / 180;

/** The dead trees: [x, z, height, lean, branch turn]. */
const TREES: [x: number, z: number, h: number, lean: number, turn: number][] = [
  [-8, 12, 6.5, 0.2, 10],
  [-1, 15, 5.2, -0.15, 70],
  [6.5, 10, 7.2, 0.1, 130],
  [12, 15.5, 4.8, -0.25, 200],
  [-14, 7, 5.6, 0.18, 250],
  [2, 6.5, 4.4, -0.1, 300],
];

export const deadvlei: Monument = {
  id: 'deadvlei',
  name: 'Deadvlei',
  iso: 'NAM',
  lat: -24.7593,
  lon: 15.2924,
  realHeight: 325,
  tier: 'building',
  surface: 'none',
  footprint: 35,

  build(ctx: MonumentContext): Group {
    const { THREE, palette, tone, box, column, strut } = ctx;
    const draft = new THREE.Group();
    const add = (o: Object3D): void => void draft.add(o);
    const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

    /**
     * A dune: a triangular prism along its crest, `width` across and `rise`
     * high, with a stretched pyramid at each end so the crest runs down into
     * the sand instead of ending in a gable.
     */
    const ridge = (x: number, z: number, yaw: number, width: number, rise: number, length: number, color: number): void => {
      const turn = new THREE.Group();
      turn.position.set(x, 0, z);
      turn.rotation.y = yaw * DEG;
      const crest = Math.max(1, length - width);
      const squash = new THREE.Group();
      squash.scale.set(width / 1.1547, rise, crest);
      const prism = column(1 / 3, 1, color, 3);
      prism.rotation.x = Math.PI / 2;
      prism.position.set(0, 1 / 3, -0.5);
      squash.add(prism);
      turn.add(squash);
      for (const end of [-1, 1]) {
        const hip = new THREE.Group();
        hip.position.z = (end * crest) / 2;
        hip.scale.set(width / 2, 1, width * 0.55);
        hip.add(ctx.taper(1, 0.02, rise, color, 4));
        turn.add(hip);
      }
      add(turn);
    };

    // 1. The pan: a white floor, a little raised, with a sand rim.
    const sand = column(18.5, 0.3, tone(palette.apricot, 0.95), 14);
    sand.position.z = 6;
    add(sand);
    const pan = column(15.5, 0.25, palette.white, 14);
    pan.position.set(0, 0.3, 7);
    add(pan);

    // 2. The dunes: the great one behind, a lesser one off to the side; their
    //    crests turned across the light so one flank is lit and one is not.
    //    The great dune's crest runs in three reaches that climb to its summit
    //    and fall away, so it snakes instead of standing as a tent.
    const sandLit = tone(palette.orange, 0.84);
    ridge(-11, -12, 70, 18, 17, 30, sandLit);
    ridge(3, -14, 95, 20, 27, 26, sandLit);
    ridge(15, -6, 128, 16, 15, 24, sandLit);
    ridge(-21, 5, 25, 11, 7, 18, palette.clay);

    // 3. The dead camelthorns: a trunk, a fork, three or four bare limbs.
    const wood = tone(palette.bark, 0.7);
    for (const [x, z, h, lean, turn] of TREES) {
      const foot = v(x, 0.5, z);
      const fork = v(x + lean * h, 0.5 + h * 0.55, z);
      add(strut(foot, fork, 0.45, wood));
      for (let k = 0; k < 4; k++) {
        const a = (turn + k * 95) * DEG;
        const out = h * (0.35 + 0.1 * (k % 2));
        const tip = v(fork.x + Math.cos(a) * out, fork.y + h * (0.25 + 0.12 * ((k + 1) % 2)), fork.z + Math.sin(a) * out);
        add(strut(fork, tip, 0.28, wood));
      }
      const base = box(0.9, 0.3, 0.9, wood);
      base.position.copy(foot);
      add(base);
    }

    return ctx.merge(draft);
  },
};
