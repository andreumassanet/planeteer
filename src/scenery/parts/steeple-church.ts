import { DOOR_HEAD, DOOR_HEIGHT, PROUD, STOREY, TONES, doorPaint } from '../contract.ts';
import type { Group, RegionStyle, Rng, SceneryContext, ScenicPart } from '../contract.ts';

/**
 * Steeple church: the civic building of Europe, the Americas and Oceania.
 *
 * A settlement's one `civic` part decides what the whole place is, which is why
 * the kind gets twice a dwelling's budget for one instance a village. A hundred
 * gabled houses could be anywhere on Earth; with a spire in the middle they are
 * a European village. The spire is the only thing in the kit that reaches 30
 * units, so it is the only thing visible over the roofs from outside; the nave
 * beneath is deliberately plain.
 *
 * Eight sides on the spire: four reads as a wedge from the diagonal, sixteen
 * has facets under a pixel and goes back to a smooth grey cone. The count is
 * chosen by how many ink lines you want to see.
 *
 * The masonry is tones: the plinth a darker course of the same stone; a string
 * course round the nave and the tower at the same height, which ties two
 * masses into one building; the band under the eaves, the roof's shadow, drawn;
 * a lighter cornice over the belfry; a two-tone spire, dark at the foot and
 * light at the tip. The belfry louvres and nave lancets are `panes` rows: five
 * bars and three lights for six triangles a face.
 */

const SPIRE_SIDES = 8;

/** The colours and dimensions a church's tower and front are laid against. */
interface Church {
  stone: number;
  tile: number;
  dark: number;
  course: number;
  shade: number;
  cornice: number;
  ridgeTile: number;
  spireFoot: number;
  woodwork: number;
  naveWidth: number;
  naveDepth: number;
  naveHeight: number;
  towerWidth: number;
  towerHeight: number;
  spireHeight: number;
  stringY: number;
  naveZ: number;
}

/** The west tower: belfry, parapet and the two-tone spire. */
function addTower(ctx: SceneryContext, group: Group, c: Church): void {
  const { box, panes, rim, taper, column } = ctx;
  const { stone, tile, dark, course, cornice, spireFoot, woodwork, towerWidth, towerHeight, spireHeight, stringY } = c;
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
}

/** A church's west door: a tenth over a house's. */
const CHURCH_DOOR = DOOR_HEIGHT * 1.1;

/** The door and west window, a porch or an apse, and the nave lancets. */
function addFront(ctx: SceneryContext, rng: Rng, style: RegionStyle, group: Group, c: Church): void {
  const { box, panes, lit, taper, roof, windows } = ctx;
  const { stone, tile, dark, course, cornice, naveWidth, naveDepth, naveHeight, towerWidth, naveZ } = c;
  const face = towerWidth / 2;
  const door = ctx.door({
    width: 2,
    height: CHURCH_DOOR,
    leaf: doorPaint(rng, style, stone),
    frame: cornice,
    sill: 0.5,
    step: course,
  });
  door.position.set(0, 0, face);
  group.add(door);

  const west = windows({
    count: 1,
    width: towerWidth * 0.4,
    height: 2.4,
    panes: 2,
    frame: cornice,
    glass: dark,
    strength: 0.7,
  });
  west.position.set(0, 0.5 + CHURCH_DOOR + DOOR_HEAD + 0.8, face);
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
    // `PROUD` under the string course: the porch roof reaches back into the
    // nave, and its underside and the string's would be one plane where it
    // crossed the string's ledge.
    const porchHeight = naveHeight * 0.62 - PROUD;
    const porch = box(porchWidth, porchHeight, 2.2, stone);
    porch.position.set((side * (naveWidth + porchWidth)) / 2, 0.5, naveZ + naveDepth * 0.24);
    group.add(porch);
    const porchRoof = roof(2.8, porchWidth + 0.6, 1.1, 2.8, tile);
    porchRoof.rotation.y = Math.PI / 2;
    porchRoof.position.set(porch.position.x, 0.5 + porchHeight, porch.position.z);
    group.add(porchRoof);
  }

  // The nave lancets: a painted frame row and a lit light row a side. Two
  // meshes and twelve triangles a flank; at 120 units a lancet is a mark.
  for (const side of [-1, 1]) {
    const bays = 3;
    const gap = naveDepth * 0.26 - 0.9;
    const surround = panes(bays, 0.9, 3.6, gap, cornice);
    surround.rotation.y = (side * Math.PI) / 2;
    surround.position.set((side * naveWidth) / 2 + side * PROUD, 0.5 + naveHeight * 0.3, naveZ);
    group.add(surround);
    const light = lit(panes(bays, 0.62, 3.3, gap + 0.28, dark), 0.7);
    light.rotation.y = (side * Math.PI) / 2;
    light.position.set((side * naveWidth) / 2 + side * PROUD * 2, 0.5 + naveHeight * 0.3 + 0.15, naveZ);
    group.add(light);
  }
}

export const steepleChurch: ScenicPart = {
  id: 'steeple-church',
  name: 'Steeple church',
  kind: 'civic',
  footprint: 15.5,
  note: 'Nave, west tower, a two-tone spire and a string course. The one building that names a European village.',

  build(ctx, rng, style) {
    const { THREE, box, tone, roof } = ctx;
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
    const naveHeight = STOREY * rng.range(1.5, 1.9);
    const towerWidth = naveWidth * rng.range(0.55, 0.68);
    const towerHeight = naveHeight + STOREY * rng.range(1, 1.6);
    const spireHeight = towerHeight * rng.range(0.5, 0.72);
    /** One line round the whole building at one height is what makes it one building. */
    const stringY = 0.5 + naveHeight * 0.62;

    // The nave runs back along -Z so the tower stands at the front, which is
    // where the contract's +Z is looking and where a placement will put the
    // approach.
    const naveZ = -naveDepth / 2 + towerWidth * 0.4;

    const plinth = box(naveWidth + 0.5, 0.5, naveDepth + 0.5, course);
    plinth.position.z = naveZ;
    group.add(plinth);

    // `PROUD` short of the eave band, which caps the wall: level with it, the
    // two tops were one plane in two colours under the roof.
    const nave = box(naveWidth, naveHeight - PROUD, naveDepth, stone);
    nave.position.set(0, 0.5, naveZ);
    group.add(nave);

    const naveString = box(naveWidth + PROUD * 2, 0.22, naveDepth + PROUD * 2, cornice);
    naveString.position.set(0, stringY, naveZ);
    group.add(naveString);

    const naveBand = box(naveWidth + PROUD * 2, 0.3, naveDepth + PROUD * 2, shade);
    naveBand.position.set(0, 0.5 + naveHeight - 0.3, naveZ);
    group.add(naveBand);

    const naveRise = STOREY * 0.9;
    // The roof runs 0.4 past the nave at the back, and at the front it stops
    // `PROUD` inside the face of the tower it butts into, or the two would
    // z-fight from a distance.
    const roofBack = naveZ - naveDepth / 2 - 0.4;
    const roofFront = Math.min(naveZ + naveDepth / 2 + 0.4, towerWidth / 2 - PROUD);
    const roofLength = roofFront - roofBack;
    const roofZ = (roofFront + roofBack) / 2;
    const naveRoof = roof(roofLength, naveWidth + 0.8, naveRise, roofLength, tile);
    naveRoof.rotation.y = Math.PI / 2;
    naveRoof.position.set(0, 0.5 + naveHeight, roofZ);
    group.add(naveRoof);
    // `PROUD` inside each gable: flush, its ends lay in the gables' planes.
    const ridgeCap = box(0.44, 0.3, roofLength - PROUD * 2, ridgeTile);
    ridgeCap.position.set(0, 0.5 + naveHeight + naveRise - 0.1, roofZ);
    group.add(ridgeCap);

    const church: Church = {
      stone, tile, dark, course, shade, cornice, ridgeTile, spireFoot, woodwork,
      naveWidth, naveDepth, naveHeight, towerWidth, towerHeight, spireHeight, stringY, naveZ,
    };
    addTower(ctx, group, church);
    addFront(ctx, rng, style, group, church);

    return group;
  },
};
