import type { Group, Monument, MonumentContext, Object3D } from './contract.ts';

/**
 * Bled Island, Slovenia.
 *
 * The only island in Slovenia: a wooded islet in Lake Bled with the white
 * Church of the Assumption on top, its tall bell tower and dark spire rising
 * over the trees, and the ninety-nine steps up from the landing. What names
 * it, in order: the white tower with its slender spire standing out of the
 * water; the red roofs among the dark trees; the stair up from the lake; the
 * pletna boats at the landing.
 *
 * The lake is owned by the model, a disc of `skyBlue` toned down; the island
 * a mound of `green` with `tan` rock at the waterline. Drawn 38 tall for a
 * 52 m tower on its islet.
 */

const ISLAND = 4.2;

export const bledIsland: Monument = {
  id: 'bled-island',
  name: 'Bled Island',
  iso: 'SVN',
  lat: 46.3626,
  lon: 14.0901,
  realHeight: 52,
  tier: 'building',
  surfaces: { clay: 'roof', skyBlue: 'none', green: 'none' },
  footprint: 23,

  build(ctx: MonumentContext): Group {
    const { THREE, palette, tone, taper, column, box } = ctx;
    const draft = new THREE.Group();
    const add = (o: Object3D): void => void draft.add(o);
    const white = palette.white;
    const roof = palette.clay;

    /** A gable roof along z: base at y, `width` across, `rise` high, `length` long. */
    const gable = (x: number, y: number, z: number, width: number, rise: number, length: number): void => {
      const squash = new THREE.Group();
      squash.position.set(x, y, z);
      squash.scale.set(width / 1.1547, rise, length);
      const prism = column(1 / 3, 1, roof, 3);
      prism.rotation.x = Math.PI / 2;
      prism.position.set(0, 1 / 3, -0.5);
      squash.add(prism);
      add(squash);
    };

    // 1. The lake.
    const lake = column(22.5, 0.5, tone(palette.skyBlue, 0.7), 18);
    add(lake);

    // 2. The island: rock at the water, a wooded mound over it.
    const rock = taper(11.5, 10.6, 2.2, palette.tan, 10);
    rock.position.y = 0.5;
    add(rock);
    const mound = taper(10.6, 8.0, ISLAND - 2.7, palette.green, 10);
    mound.position.y = 2.7;
    add(mound);
    const trees: [x: number, z: number, r: number][] = [
      [-8, -3, 2.4], [-6.5, 4.5, 2.2], [7.5, -4.5, 2.6], [8, 3, 2.0], [-3, -8, 2.4], [3.5, -8.2, 2.2], [-8.6, 0.8, 1.8],
    ];
    for (const [x, z, r] of trees) {
      const crown = taper(r, r * 0.3, r * 2.8, tone(palette.green, 0.62), 7);
      crown.position.set(x, ISLAND - 0.3, z);
      add(crown);
    }

    // 3. The church: the nave under a red roof, the apse behind.
    const nave = box(5.6, 6.0, 10, white);
    nave.position.set(0, ISLAND, -1.5);
    add(nave);
    gable(0, ISLAND + 6.0, -1.5, 6.4, 3.6, 10.6);
    const apse = column(2.6, 5.2, white, 8);
    apse.position.set(0, ISLAND, -6.8);
    add(apse);
    const apseRoof = taper(2.9, 0.3, 2.4, roof, 8);
    apseRoof.position.set(0, ISLAND + 5.2, -6.8);
    add(apseRoof);

    // 4. The bell tower at the west front: tall white shaft, a clock, a dark spire.
    const towerZ = 5.2;
    const tower = box(4.0, 20, 4.0, white);
    tower.position.set(0, ISLAND, towerZ);
    add(tower);
    const cornice = box(4.5, 0.6, 4.5, tone(palette.white, 0.9));
    cornice.position.set(0, ISLAND + 20, towerZ);
    add(cornice);
    for (const [dx, dz, w, d] of [[0, 2.05, 1.6, 0.2], [2.05, 0, 0.2, 1.6]] as const) {
      const clock = box(w, 1.6, d, palette.bark);
      clock.position.set(dx, ISLAND + 15.5, towerZ + dz);
      add(clock);
      const louvre = box(w * 0.7, 2.2, d, tone(palette.bark, 1.2));
      louvre.position.set(dx, ISLAND + 17.6, towerZ + dz);
      add(louvre);
    }
    const spire = taper(2.5, 0.08, 13, tone(palette.slate, 0.7), 8);
    spire.position.set(0, ISLAND + 20.6, towerZ);
    add(spire);

    // 5. The provost's house beside it.
    const house = box(5.0, 4.4, 5.0, tone(palette.cream, 0.97));
    house.position.set(-5.8, ISLAND, 1.0);
    add(house);
    gable(-5.8, ISLAND + 4.4, 1.0, 5.6, 2.8, 5.6);

    // 6. The stair up from the landing, and the landing.
    const landing = box(7, 0.6, 3, palette.tan);
    landing.position.set(0, 0.5, 12.2);
    add(landing);
    for (let k = 0; k < 6; k++) {
      const step = box(3.2, 0.9 + k * 0.6, 0.9, tone(palette.tan, 1.15));
      step.position.set(0, 0.5, 11 - k * 0.9);
      add(step);
    }

    // 7. Two pletna boats at the landing, each under its awning.
    for (const side of [-1, 1]) {
      const hull = box(1.8, 0.7, 6.0, palette.brown);
      hull.position.set(side * 6.2, 0.4, 14.5);
      add(hull);
      const awning = taper(1.0, 0.75, 0.9, palette.white, 4);
      const stretch = new THREE.Group();
      stretch.position.set(side * 6.2, 1.1, 14.5);
      stretch.scale.set(0.9, 1, 1.8);
      stretch.add(awning);
      add(stretch);
    }

    return ctx.merge(draft);
  },
};
