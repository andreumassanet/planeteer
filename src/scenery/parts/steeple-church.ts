import { PROUD, STOREY, TONES } from '../contract.ts';
import type { ScenicPart } from '../contract.ts';

/**
 * Steeple church — the civic building of Europe, the Americas and Oceania.
 *
 * A settlement's one `civic` part decides what the whole place *is*, and that is
 * why the kind gets twice a dwelling's budget for one instance per village. A
 * hundred gabled houses could be anywhere on Earth. A hundred gabled houses with
 * a spire in the middle are a European village, and the spire is about forty
 * meshes of the four hundred on screen.
 *
 * The proportion that has to hold is **the spire against everything else**. It
 * is the only thing in the kit that reaches 30 units, so it is the only thing
 * visible over the roofs from outside the village — which is precisely the job.
 * The nave beneath it is deliberately plain: at the distance the spire is doing
 * its work, the nave is four pixels of wall.
 *
 * Eight sides on the spire, not four and not sixteen. Four reads as a wedge from
 * the diagonal; sixteen has facets under a pixel and goes back to being a smooth
 * grey cone, which the four-step ramp cannot band. The same reasoning as the
 * Space Needle's legs, and the same answer: pick the count by how many ink lines
 * you want to see.
 *
 * **What the redesign added is masonry, which is entirely tones.** The plinth
 * is a darker course of the same stone; a string course runs round the nave and
 * the tower at the same height, which is what ties two masses into one
 * building; the band under the eaves is the roof's shadow, drawn; the cornice
 * over the belfry is a lighter tone, because a cornice is the one part of a
 * tower the sun always finds. **The spire is two tones**, dark at the foot and
 * light at the tip, for the reason the conifer is three: an eight-sided cone in
 * one flat colour takes one cel band down its whole length and reads as a
 * smooth grey spike. And the belfry louvres and the nave lancets are `panes`
 * rows — five bars and three lights for six triangles a face, where four boxes
 * used to cost forty-eight.
 */

const SPIRE_SIDES = 8;

export const steepleChurch: ScenicPart = {
  id: 'steeple-church',
  name: 'Steeple church',
  kind: 'civic',
  footprint: 15.5,
  note: 'Nave, west tower, a two-tone spire and a string course. The one building that names a European village.',

  build(ctx, rng, style) {
    const { THREE, box, panes, tone, lit, column, taper, rim, roof, windows } = ctx;
    const group = new THREE.Group();

    const stone = rng.pick(style.walls);
    const tile = rng.pick(style.roofs);
    const trim = rng.pick(style.trim);
    const dark = rng.pick(style.glass);

    const course = tone(stone, TONES.course);
    const shade = tone(stone, TONES.eave);
    const cornice = tone(stone, TONES.light);
    const ridgeTile = tone(tile, TONES.cap);
    const spireFoot = tone(tile, TONES.eave);
    const woodwork = tone(trim, TONES.cap);

    const naveWidth = rng.range(6.4, 7.6);
    const naveDepth = rng.range(10, 13);
    const naveHeight = STOREY * rng.range(1.9, 2.4);
    const towerWidth = naveWidth * rng.range(0.55, 0.68);
    const towerHeight = naveHeight + STOREY * rng.range(1.6, 2.6);
    const spireHeight = towerHeight * rng.range(0.55, 0.78);
    /** One line round the whole building at one height is what makes it one building. */
    const stringY = 0.5 + naveHeight * 0.62;

    // The nave runs back along -Z so the tower stands at the front, which is
    // where the contract's +Z is looking and where a placement will put the
    // approach.
    const naveZ = -naveDepth / 2 + towerWidth * 0.4;

    const plinth = box(naveWidth + 0.5, 0.5, naveDepth + 0.5, course);
    plinth.position.z = naveZ;
    group.add(plinth);

    const nave = box(naveWidth, naveHeight, naveDepth, stone);
    nave.position.set(0, 0.5, naveZ);
    group.add(nave);

    const naveString = box(naveWidth + PROUD * 2, 0.22, naveDepth + PROUD * 2, cornice);
    naveString.position.set(0, stringY, naveZ);
    group.add(naveString);

    const naveBand = box(naveWidth + PROUD * 2, 0.3, naveDepth + PROUD * 2, shade);
    naveBand.position.set(0, 0.5 + naveHeight - 0.3, naveZ);
    group.add(naveBand);

    const naveRise = STOREY * 0.9;
    const naveRoof = roof(naveDepth + 0.8, naveWidth + 0.8, naveRise, naveDepth + 0.8, tile);
    naveRoof.rotation.y = Math.PI / 2;
    naveRoof.position.set(0, 0.5 + naveHeight, naveZ);
    group.add(naveRoof);
    const ridgeCap = box(0.44, 0.3, naveDepth + 0.8, ridgeTile);
    ridgeCap.position.set(0, 0.5 + naveHeight + naveRise - 0.1, naveZ);
    group.add(ridgeCap);

    // --- the tower ---
    const tower = box(towerWidth, towerHeight, towerWidth, stone);
    tower.position.y = 0.5;
    group.add(tower);
    const towerBase = box(towerWidth + 0.4, 0.5, towerWidth + 0.4, course);
    group.add(towerBase);
    const towerString = box(towerWidth + PROUD * 2, 0.22, towerWidth + PROUD * 2, cornice);
    towerString.position.y = stringY;
    group.add(towerString);

    // Belfry openings on all four faces: three dark lights behind a mullion,
    // one `panes` row a face. Two dark marks near the top are what stop the
    // tower reading as a chimney, and a row of them says *belfry*.
    const belfryY = 0.5 + towerHeight - 3;
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const louvre = panes(3, towerWidth * 0.16, 1.9, towerWidth * 0.04, dark);
      louvre.rotation.y = dx !== 0 ? (dx * Math.PI) / 2 : dz > 0 ? 0 : Math.PI;
      louvre.position.set((dx * (towerWidth / 2 + PROUD)), belfryY, dz * (towerWidth / 2 + PROUD));
      group.add(louvre);
    }

    const parapet = box(towerWidth + 0.55, 0.5, towerWidth + 0.55, cornice);
    parapet.position.y = 0.5 + towerHeight;
    group.add(parapet);
    const merlons = rim(towerWidth + 0.35, towerWidth + 0.35, 0.3, 0.45, course);
    merlons.position.y = 1 + towerHeight;
    group.add(merlons);

    // The spire in two tones: a lead skirt at the foot and a lighter shaft
    // above it. One flat colour down eight sides takes one cel band and reads
    // as a grey spike; see the conifer.
    const skirt = spireHeight * 0.34;
    const foot = taper(towerWidth * 0.52, towerWidth * 0.36, skirt, spireFoot, SPIRE_SIDES);
    foot.position.y = 1 + towerHeight;
    group.add(foot);
    const spire = taper(towerWidth * 0.36, 0.12, spireHeight - skirt, tile, SPIRE_SIDES);
    spire.position.y = 1 + towerHeight + skirt;
    group.add(spire);

    const finial = column(0.13, 0.9, woodwork, 4);
    finial.position.y = 1 + towerHeight + spireHeight;
    group.add(finial);

    // --- the front: a door under an arch, on steps, with a light over it ---
    const face = towerWidth / 2;
    const door = panes(1, 1.7, 3, 0, woodwork, PROUD * 2);
    door.position.set(0, 0.5, face + PROUD);
    group.add(door);
    const arch = panes(1, 2.2, 0.34, 0, cornice, PROUD * 3);
    arch.position.set(0, 3.5, face + PROUD * 1.5);
    group.add(arch);
    const steps = box(2.6, 0.5, 0.7, course);
    steps.position.set(0, 0, face + 0.35);
    group.add(steps);

    const west = windows({
      count: 1,
      width: towerWidth * 0.4,
      height: 1.7,
      panes: 2,
      frame: cornice,
      glass: dark,
      strength: 0.7,
    });
    west.position.set(0, 4.5, face);
    group.add(west);

    // A porch or an apse, so no two churches in the world have the same plan.
    if (rng.chance(0.55)) {
      const apse = taper(naveWidth * 0.42, naveWidth * 0.36, naveHeight * 0.8, stone, 6);
      apse.position.set(0, 0.5, naveZ - naveDepth / 2 - naveWidth * 0.06);
      group.add(apse);
      const cone = taper(naveWidth * 0.46, 0.1, STOREY * 0.8, tile, 6);
      cone.position.set(0, 0.5 + naveHeight * 0.8, apse.position.z);
      group.add(cone);
    } else {
      const porchWidth = naveWidth * 0.5;
      const side = rng.sign();
      const porch = box(porchWidth, naveHeight * 0.62, 2.2, stone);
      porch.position.set((side * (naveWidth + porchWidth)) / 2, 0.5, naveZ + naveDepth * 0.24);
      group.add(porch);
      const porchRoof = roof(2.8, porchWidth + 0.6, 1.1, 2.8, tile);
      porchRoof.rotation.y = Math.PI / 2;
      porchRoof.position.set(porch.position.x, 0.5 + naveHeight * 0.62, porch.position.z);
      group.add(porchRoof);
    }

    // The nave lancets: a painted frame row and a lit light row a side. Three
    // bays used to be six boxes; this is two meshes and twelve triangles a
    // flank, and at 120 units a lancet is a mark, not a reveal.
    for (const side of [-1, 1]) {
      const bays = 3;
      const gap = naveDepth * 0.26 - 0.9;
      const surround = panes(bays, 0.9, 2.4, gap, cornice);
      surround.rotation.y = (side * Math.PI) / 2;
      surround.position.set((side * naveWidth) / 2 + side * PROUD, 0.5 + naveHeight * 0.3, naveZ);
      group.add(surround);
      const light = lit(panes(bays, 0.62, 2.1, gap + 0.28, dark), 0.7);
      light.rotation.y = (side * Math.PI) / 2;
      light.position.set((side * naveWidth) / 2 + side * PROUD * 2, 0.5 + naveHeight * 0.3 + 0.15, naveZ);
      group.add(light);
    }

    return group;
  },
};
