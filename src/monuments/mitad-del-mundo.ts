import type { Group, Monument, MonumentContext, Object3D } from './contract.ts';

/**
 * Mitad del Mundo, San Antonio de Pichincha, Ecuador.
 *
 * The monument to the Equator: a squared stone tower, faced the same on all
 * four sides with the cardinal points, carrying a globe, with the line itself
 * painted yellow across the plaza and through the monument from east to west.
 * What names it, in order: the globe on the tower; the yellow line; the long
 * avenue of busts leading to it.
 *
 * The tower is a frustum of `tan` stone with a lighter band of letters near
 * its top (here plain panels), the globe `slate` with a `gold` belt, the line
 * `gold` on `sand` paving. Drawn 40 tall for 30 m, stretched about 1.4x so the
 * globe clears the tier.
 */

export const mitadDelMundo: Monument = {
  id: 'mitad-del-mundo',
  name: 'Mitad del Mundo',
  iso: 'ECU',
  lat: -0.0022,
  lon: -78.4558,
  realHeight: 30,
  tier: 'building',
  surface: 'stone',
  footprint: 25.2,

  build(ctx: MonumentContext): Group {
    const { THREE, palette, tone, taper, column, box } = ctx;
    const draft = new THREE.Group();
    const add = (o: Object3D): void => void draft.add(o);
    const stone = palette.tan;

    // 1. The plaza, and the line across it from east to west (along x).
    const plaza = box(40, 0.4, 30, palette.sand);
    add(plaza);
    const line = box(40.2, 0.2, 1.2, palette.gold);
    line.position.y = 0.4;
    add(line);

    // 2. The tower: a stepped base, the frustum, a cornice, the cardinal panels.
    const base = box(12, 2.2, 12, tone(palette.tan, 0.85));
    base.position.y = 0.4;
    add(base);
    const tower = taper(5.4, 3.9, 25, stone, 4);
    tower.position.y = 2.6;
    add(tower);
    for (let k = 0; k < 4; k++) {
      const a = (k * Math.PI) / 2;
      const pivot = new THREE.Group();
      pivot.rotation.y = a;
      const panel = box(3.6, 2.2, 0.2, tone(palette.tan, 1.25));
      panel.position.set(0, 23.2, 4.25);
      panel.rotation.x = -0.06;
      pivot.add(panel);
      const door = box(2.2, 3.4, 0.2, palette.bark);
      door.position.set(0, 2.6, 5.45);
      door.rotation.x = -0.06;
      pivot.add(door);
      add(pivot);
    }
    const cornice = box(8.6, 1.0, 8.6, tone(palette.tan, 0.9));
    cornice.position.y = 27.6;
    add(cornice);

    // 3. The globe, on a short neck, with its belt.
    const neck = column(1.2, 1.4, palette.slate, 8);
    neck.position.y = 28.6;
    add(neck);
    const r = 4.8;
    const cy = 30 + r;
    const slices = 8;
    for (let i = 0; i < slices; i++) {
      const a = -Math.PI / 2 + (Math.PI * i) / slices;
      const b = -Math.PI / 2 + (Math.PI * (i + 1)) / slices;
      const band = taper(Math.max(0.2, r * Math.cos(a)), Math.max(0.2, r * Math.cos(b)), r * (Math.sin(b) - Math.sin(a)), palette.slate, 12);
      band.position.y = cy + r * Math.sin(a);
      add(band);
    }
    const belt = column(r + 0.12, 0.5, palette.gold, 12);
    belt.position.y = cy - 0.25;
    add(belt);

    // 4. The avenue of busts, each a plinth and a head, on both sides of the
    //    approach from the south (+Z).
    for (const side of [-1, 1]) {
      for (let k = 0; k < 4; k++) {
        const z = 8 + k * 2.2;
        const plinth = box(0.9, 1.6, 0.9, tone(palette.bone, 1.05));
        plinth.position.set(side * 4.2, 0.4, z);
        add(plinth);
        const bust = box(0.7, 0.9, 0.6, palette.steel);
        bust.position.set(side * 4.2, 2.0, z);
        add(bust);
      }
    }

    return ctx.merge(draft);
  },
};
