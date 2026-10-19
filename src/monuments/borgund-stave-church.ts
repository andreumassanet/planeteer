import type { Group, Monument, MonumentContext, Object3D } from './contract.ts';
import { PROUD } from './contract.ts';

/**
 * Borgund Stave Church, Lærdal, Norway.
 *
 * A building made of roofs: a narrow, tall timber church whose every stage is
 * a steep shingled roof over a short wall. What names it, in order: the stack
 * itself (the gallery's lean-to, the aisle's lean-to, the nave's steep gable,
 * the turret's three little roofs and its spire); the dragon heads rearing off
 * the nave's gable ends; and the round apse at the east end under its own
 * pointed cap.
 *
 * The roofs are gables, not pyramids: a four-sided pyramid at every stage made
 * a pagoda. A gable is a three-sided prism laid along the nave and squashed by
 * a parent that carries the scale while the child carries the rotation, so the
 * pitch is steep (about 63 degrees on the nave) without shearing.
 *
 * Everything is tarred dark: `bark` shingles, `brown` staves toned down, the
 * openings of the gallery a darker tone still. The front (+Z) is the west
 * porch. No `realHeight`: the quoted figure is for the turret alone.
 */

const DEG = Math.PI / 180;

/** The stages, as [floor, top, half-width, half-length] of their walls. */
const GALLERY = { top: 3.4, hx: 6.4, hz: 9.4 };
const AISLE = { top: 9.0, hx: 4.6, hz: 7.6 };
const NAVE = { top: 15.0, hx: 3.4, hz: 6.4 };

export const borgundStaveChurch: Monument = {
  id: 'borgund-stave-church',
  name: 'Borgund Stave Church',
  iso: 'NOR',
  lat: 61.0472,
  lon: 7.8125,
  tier: 'building',
  surface: 'timber',
  surfaces: { bark: 'roof' },
  footprint: 16,

  build(ctx: MonumentContext): Group {
    const { THREE, palette, tone, box, taper, column, strut } = ctx;
    const draft = new THREE.Group();
    const add = (o: Object3D): void => void draft.add(o);
    const shingle = tone(palette.bark, 1.45);
    const stave = tone(palette.brown, 0.8);
    const opening = tone(palette.bark, 0.6);
    const sill = tone(palette.slate, 0.9);

    /** A gable roof along z: base at y, `width` across, `rise` high, `length` long. */
    const gable = (width: number, rise: number, length: number, color: number, y: number, z = 0, alongX = false): void => {
      const outer = new THREE.Group();
      outer.position.set(0, y, z);
      if (alongX) outer.rotation.y = Math.PI / 2;
      const scale = new THREE.Group();
      scale.scale.set(width / 1.1547, rise, length);
      const prism = column(1 / 3, 1, color, 3);
      prism.rotation.x = Math.PI / 2;
      prism.position.set(0, 1 / 3, -0.5);
      scale.add(prism);
      outer.add(scale);
      add(outer);
    };

    /** A hipped lean-to all round a stage: a four-sided frustum stretched to the plan. */
    const leanTo = (hx: number, hz: number, inset: number, rise: number, y: number): void => {
      const stretch = new THREE.Group();
      stretch.position.y = y;
      stretch.scale.set(hx, 1, hz);
      const roof = taper(1, 1 - inset, rise, shingle, 4);
      stretch.add(roof);
      add(stretch);
    };

    // 1. The sill and the gallery: a low wall of arcades round the whole church.
    const base = box(GALLERY.hx * 2 + 0.6, 0.8, GALLERY.hz * 2 + 0.6, sill);
    add(base);
    const gallery = box(GALLERY.hx * 2, GALLERY.top - 0.8, GALLERY.hz * 2, stave);
    gallery.position.y = 0.8;
    add(gallery);
    for (const [side, along, half, run] of [
      ['x', 1, GALLERY.hx, GALLERY.hz],
      ['x', -1, GALLERY.hx, GALLERY.hz],
      ['z', 1, GALLERY.hz, GALLERY.hx],
      ['z', -1, GALLERY.hz, GALLERY.hx],
    ] as const) {
      const count = Math.floor((run * 2 - 2) / 1.6);
      for (let k = 0; k < count; k++) {
        const t = -run + 1.4 + k * 1.6;
        if (side === 'z' && along === 1 && Math.abs(t) < 2.4) continue; // the porch
        const arch = box(side === 'x' ? 0.2 : 0.9, 1.5, side === 'x' ? 0.9 : 0.2, opening);
        if (side === 'x') arch.position.set(along * (half + PROUD / 2), 1.5, t);
        else arch.position.set(t, 1.5, along * (half + PROUD / 2));
        add(arch);
      }
    }
    leanTo(GALLERY.hx + 0.8, GALLERY.hz + 0.8, 0.3, 2.6, GALLERY.top);

    // 2. The aisle and its lean-to.
    // Each stage's wall starts a unit down inside the one below, so its foot
    // never shares a plane with the lean-to round it.
    const aisle = box(AISLE.hx * 2, AISLE.top - GALLERY.top + 1, AISLE.hz * 2, stave);
    aisle.position.y = GALLERY.top - 1;
    add(aisle);
    leanTo(AISLE.hx + 0.7, AISLE.hz + 0.7, 0.25, 2.2, AISLE.top);

    // 3. The nave: its clerestory wall and the steep gable over it.
    const nave = box(NAVE.hx * 2, NAVE.top - AISLE.top + 1, NAVE.hz * 2, stave);
    nave.position.y = AISLE.top - 1;
    add(nave);
    for (const end of [1, -1]) {
      const band = box(NAVE.hx * 2 - 1.4, 1.0, 0.2, opening);
      band.position.set(0, NAVE.top - 2.4, end * (NAVE.hz + PROUD / 2));
      add(band);
    }
    const RISE = 8.6;
    gable(NAVE.hx * 2 + 1.2, RISE, NAVE.hz * 2 + 1.0, shingle, NAVE.top);

    // The dragon heads: two off each gable end, rearing up and out.
    const ridge = NAVE.top + RISE;
    for (const end of [1, -1]) {
      for (const side of [1, -1]) {
        const from = new THREE.Vector3(side * 0.6, ridge - 1.6, end * (NAVE.hz + 0.5));
        const to = new THREE.Vector3(side * 1.5, ridge + 0.9, end * (NAVE.hz + 1.7));
        add(strut(from, to, 0.45, shingle));
        const head = box(0.5, 0.5, 1.1, shingle);
        head.position.copy(to);
        head.position.y -= 0.3;
        head.rotation.y = Math.atan2(side * 0.9, end * 1.2);
        add(head);
      }
      // A cross on the ridge end.
      const post = box(0.25, 2.0, 0.25, shingle);
      post.position.set(0, ridge - 0.3, end * (NAVE.hz + 0.3));
      add(post);
      const arm = box(1.1, 0.25, 0.25, shingle);
      arm.position.set(0, ridge + 0.9, end * (NAVE.hz + 0.3));
      add(arm);
    }

    // 4. The turret on the ridge: three stacked little roofs and a spire.
    let y = ridge - 2.2;
    const tower = box(2.6, 3.6, 2.6, stave);
    tower.position.y = y;
    add(tower);
    y += 3.6;
    const tiers: [bottom: number, top: number, rise: number, wall: number][] = [
      [2.4, 1.3, 1.8, 1.4],
      [1.9, 1.0, 1.6, 1.2],
    ];
    for (const [bottom, top, rise, wall] of tiers) {
      const roof = taper(bottom, top, rise, shingle, 4);
      roof.position.y = y;
      add(roof);
      y += rise;
      const drum = box(top * 1.6, wall, top * 1.6, stave);
      drum.position.y = y;
      add(drum);
      y += wall;
    }
    const spire = taper(1.4, 0.05, 6.5, shingle, 4);
    spire.position.y = y;
    add(spire);

    // 5. The chancel and the round apse at the east end (-Z).
    const chancel = box(5.2, AISLE.top - 0.8 + 1.5, 4, stave);
    chancel.position.set(0, 0.8, -AISLE.hz - 1.6);
    add(chancel);
    gable(6.0, 5.0, 4.6, shingle, AISLE.top + 1.5, -AISLE.hz - 1.6);
    const apse = column(2.4, 7.0, stave, 8);
    apse.position.set(0, 0.8, -AISLE.hz - 4.6);
    add(apse);
    const cap = taper(2.8, 0.2, 3.4, shingle, 8);
    cap.position.set(0, 7.8, -AISLE.hz - 4.6);
    add(cap);
    const lantern = column(0.6, 1.2, stave, 6);
    lantern.position.set(0, 10.6, -AISLE.hz - 4.6);
    add(lantern);
    const needle = taper(0.7, 0.05, 2.6, shingle, 6);
    needle.position.set(0, 11.8, -AISLE.hz - 4.6);
    add(needle);

    // 6. The west porch: a little gable over a dark door.
    const porch = box(4.0, GALLERY.top + 0.4, 2.6, stave);
    porch.position.set(0, 0, GALLERY.hz + 1.2);
    add(porch);
    gable(4.8, 3.6, 3.2, shingle, GALLERY.top + 0.4, GALLERY.hz + 1.2);
    const door = box(1.8, 2.8, 0.2, opening);
    door.position.set(0, 0.8, GALLERY.hz + 2.5 + PROUD / 2);
    add(door);
    const cross = box(0.2, 1.4, 0.2, shingle);
    cross.position.set(0, GALLERY.top + 3.8, GALLERY.hz + 2.6);
    add(cross);
    void DEG;

    return ctx.merge(draft);
  },
};
