import type { Group, Object3D, Monument, MonumentContext } from './contract.ts';

/**
 * Mount Yasur, Tanna, Vanuatu.
 *
 * An active cinder cone, deliberately unlike the tall pale stratovolcanoes of
 * Fuji and Kilimanjaro. It is low and wide (12.5 units of cone over a 41-unit
 * base, 0.31 against Fuji's 0.58), cut off across a wide crater (22 units on a
 * 41-unit base, 0.54 against Fuji's 0.17), has straight flanks (loose scoria at
 * its angle of repose, 48.4, 47.9 and 49.9 degrees in three bands) and a column
 * of ash standing out of the crater. The cone is `bark` and the plain `slate`
 * against a pale sand biome.
 *
 * True repose (30 to 35 degrees) gives a cone only 6 units tall, so the model
 * stands at 48 degrees, a 1.9x vertical exaggeration; the crater takes the top
 * off by as much as the flanks were steepened, so the cone does not come to a
 * point. Half-diagonal over height is 0.81, and the height is the plume.
 *
 * The fixed cameras (13.4 and 6.8 degrees) cannot see into the crater, so it is
 * a `ringWall` and a floor disc. The rim's notch is the absence of crags: eleven
 * stand on the ring at heights 1.2 to 3.1 with three left out, leaving 98
 * degrees of bare ring to the front. The floor disc is `orange` (one mesh, 48
 * triangles) because the plane looks down from above.
 *
 * The plume is a throat, a glowing base, a dark column and five big lobes
 * (smaller lumps at one cell wavelength read as snow-capped mountains). It leans
 * 0.17 radians toward +X and 0.05 toward +Z on a group, so the determinant stays
 * positive. Value ladder bottom to top: `bark` throat, `orange` incandescence
 * (the only saturated colour, starting 1.7 above the 12.8 sightline so it clears
 * the near rim), `steel` column, `slate` billows, `bone` crown. The plume is
 * 18.8 of the model's 32.0 units.
 *
 * The model owns its ground: the Siwi ash plain is a grey desert of ejecta and
 * the reason people know the volcano. It is a taper (50.6 across the flats at
 * the bottom, 48.4 at the top, 1.6 high) so it reads as a bank. What shows is a
 * 3.6-unit annulus plus the sloped lip, where the bombs, debris fans and second
 * vent live. Nothing green grows anywhere in the file.
 *
 * One repeating feature per surface: the flanks get rills and nothing else, no
 * horizontal banding. Each rib runs as one slab from its own foot to its own
 * head, with no two at the same height, so no horizontal line crosses the cone.
 * Nine are `slate` (pale ash in the gully), four are the cone's own `bark` (an
 * ink line only), three are `steel` (fresh spatter); widths run 1.6 to 3.4 and
 * do not correlate with length.
 */

/**
 * Facets around the cone. 16 gives a 22.5-degree facet, coarse enough that the
 * cel ramp steps facet to facet and reads as rubble. It divides by the ribs:
 * one rib per facet centre.
 */
const SIDES = 16;

/** Top of the ash plain, the datum everything else is measured from. */
const PLAIN_TOP = 1.6;

/**
 * The cone, as half-width across the flats at each height. The slopes are
 * constant (48.4, 47.9, 49.9 degrees), the angle of repose, unlike Fuji's climb.
 */
const PROFILE = [
  { y: PLAIN_TOP, r: 20.6 },
  { y: 6.9, r: 15.9 },
  { y: 11.0, r: 12.2 },
  { y: 12.9, r: 10.6 },
];

/** The crater rim: the ring's base, and its top. */
const RIM_BASE = 12.9;
const RIM_TOP = 14.1;

/**
 * Crags around the rim, in units above the ring. Zero leaves a gap; the gaps at
 * index 0 and 1 are a 65-degree notch facing the camera. Eleven against sixteen
 * facets shares no factor, so no crag sits on a rib's bearing.
 */
const CRAGS = [0, 0, 1.5, 3.0, 1.2, 2.3, 0, 2.0, 3.1, 1.4, 2.6];

/**
 * The rills: `[foot, head, half-width, tone]`, one per facet centre. Tone 0 is
 * `slate` (nine), 1 is the cone's own `bark` (four), 2 is `steel` (three). No
 * two feet and no two heads are the same height.
 */
const RIBS: [foot: number, head: number, half: number, tone: number][] = [
  [1.9, 11.9, 3.2, 0],
  [2.6, 9.8, 2.0, 1],
  [1.8, 12.2, 2.6, 0],
  [3.1, 10.6, 3.4, 2],
  [2.0, 11.2, 1.8, 0],
  [2.4, 12.4, 2.8, 1],
  [1.7, 9.4, 2.2, 0],
  [2.9, 11.6, 3.0, 0],
  [2.1, 12.0, 1.6, 2],
  [3.4, 10.2, 2.4, 0],
  [1.9, 11.4, 3.3, 1],
  [2.7, 9.0, 2.0, 0],
  [2.2, 12.3, 2.9, 0],
  [3.0, 10.8, 1.9, 2],
  [1.8, 11.0, 2.5, 0],
  [2.5, 12.1, 3.1, 1],
];

/**
 * How thick a rill is against its width, and how far it stands proud of the
 * flank. Nothing can cut a gully, so the rib between two gullies stands out. A
 * thicker slab shows its underside from the ground.
 */
const SLAB = 0.16;
const PROUD = 0.16;

/** Volcanic bombs on the plain: `[bearing in degrees, radius, half-width, height, dark]`. */
const BOMBS: [bearing: number, radius: number, half: number, height: number, dark: boolean][] = [
  [12, 22.4, 1.4, 1.8, false],
  [37, 21.3, 0.9, 1.1, true],
  [64, 23.0, 1.9, 2.4, false],
  [88, 21.8, 1.1, 1.4, true],
  [109, 22.9, 1.6, 2.0, false],
  [131, 21.2, 0.8, 0.9, false],
  [152, 22.6, 2.0, 2.6, true],
  [176, 21.6, 1.2, 1.5, false],
  [198, 22.8, 1.5, 1.9, false],
  [221, 21.4, 1.0, 1.2, true],
  [244, 23.1, 1.8, 2.2, false],
  [268, 21.9, 1.3, 1.6, false],
  [292, 22.5, 0.9, 1.0, true],
  [318, 21.5, 1.7, 2.1, false],
  [341, 23.0, 1.2, 1.4, false],
  [26, 20.9, 2.1, 2.7, true],
  [143, 21.0, 1.9, 2.3, false],
  [259, 20.8, 2.2, 2.8, true],
  [304, 21.1, 1.6, 1.9, false],
];

/**
 * Debris fans spilling off the cone onto the plain: `[bearing, radius, half-width]`.
 * `contract.ts` turns every prism half a segment so a face points at +Z, which
 * for a triangle leaves the flat edge at the apothem on +Z and the apex at twice
 * the apothem on -Z. On a spoke that is broad edge outward and point inward, as
 * a fan spreading downslope should be.
 */
const FANS: [bearing: number, radius: number, half: number][] = [
  [24, 19.4, 3.0],
  [96, 19.8, 2.4],
  [163, 19.2, 3.4],
  [247, 19.6, 2.8],
  [306, 19.3, 2.2],
  [71, 19.5, 2.6],
  [199, 19.7, 3.1],
];

/**
 * Ash banked into drifts near the plain's outer edge: `[bearing, radius,
 * half-width, height]`. They sit just inside the lip on bearings that share no
 * factor with 16, so the plain's horizon rises and falls instead of being a
 * level circle.
 */
const DRIFTS: [bearing: number, radius: number, half: number, height: number][] = [
  [8, 22.2, 2.4, 1.3],
  [59, 22.8, 1.9, 0.9],
  [117, 21.9, 2.8, 1.6],
  [168, 22.6, 2.1, 1.1],
  [214, 22.0, 2.6, 1.4],
  [271, 22.9, 1.8, 0.8],
  [329, 22.3, 2.3, 1.2],
];

const RAD = Math.PI / 180;

function radiusAt(y: number): number {
  const first = PROFILE[0]!;
  if (y <= first.y) return first.r;
  for (let i = 1; i < PROFILE.length; i++) {
    const a = PROFILE[i - 1]!;
    const b = PROFILE[i]!;
    if (y <= b.y) return a.r + ((b.r - a.r) * (y - a.y)) / (b.y - a.y);
  }
  return PROFILE[PROFILE.length - 1]!.r;
}

export const mountYasur: Monument = {
  id: 'mount-yasur',
  name: 'Mount Yasur',
  iso: 'VUT',
  lat: -19.53,
  lon: 169.447,
  realHeight: 361,
  tier: 'building',
  surface: 'none',
  // 25.8 of it is used, by the corner of the ash plain. Tanna's baked ring is 72
  // by 91 units, so a wider plain would run into the sea on both coasts.
  footprint: 26,

  build(ctx: MonumentContext): Group {
    const { THREE, palette, column, taper, ringWall, around } = ctx;

    const cinder = palette.bark; // the cone: warm dark, and it keeps a hue in shade
    const ash = palette.slate; // the plain, the rills and the billows
    const fresh = palette.steel; // the darkest scoria, and the ash column
    const ember = palette.orange; // the vent and the base of the plume, and nothing else
    const lit = palette.bone; // the top of the cloud, the only thing up in full sun

    const group = new THREE.Group();

    const put = <T extends Object3D>(child: T, x: number, y: number, z: number): T => {
      child.position.set(x, y, z);
      group.add(child);
      return child;
    };

    /** Puts a child out at `radius` on +Z and `base` up, then swings it to `bearing`. */
    const spoke = (bearing: number, radius: number, base: number, child: Object3D): void => {
      const pivot = new THREE.Group();
      pivot.rotation.y = bearing * RAD;
      child.position.set(0, base, radius);
      pivot.add(child);
      group.add(pivot);
    };

    /**
     * A rib lying along the flank between two heights, standing `PROUD` of it. A
     * `taper` stands on +Y, so the slab is held in a group turned about X until
     * its +Y points up the slope; its +Z is then the surface normal, and
     * squashing that axis makes a slab. The scale and the rotation are on
     * different nodes on purpose: Three composes `T * R * S`, and a group carrying
     * the scale inside one carrying the rotation composes `S` then `R`.
     */
    const rib = (foot: number, head: number, half: number, color: number): Group => {
      const bottom = radiusAt(foot);
      const top = radiusAt(head);
      const holder = new THREE.Group();
      holder.position.set(0, foot, bottom + PROUD);
      holder.rotation.x = Math.atan2(head - foot, bottom - top) - Math.PI / 2;

      const slab = new THREE.Group();
      slab.scale.z = SLAB;
      slab.add(taper(half, half * 0.35, Math.hypot(head - foot, bottom - top), color, 4));
      holder.add(slab);
      return holder;
    };

    // --- 1. The Siwi ash plain: a taper, whose 1.1 of batter on the lip stops it
    // reading as a plate the cone is mounted on ---
    put(taper(25.3, 24.2, PLAIN_TOP, ash, SIDES), 0, 0, 0);

    // --- 2. The cone: three bands at one angle, all the same colour ---
    for (let i = 0; i + 1 < PROFILE.length; i++) {
      const a = PROFILE[i]!;
      const b = PROFILE[i + 1]!;
      put(taper(a.r, b.r, b.y - a.y, cinder, SIDES), 0, a.y, 0);
    }

    // --- 3. The rills: one slab per facet centre, each in one piece ---
    const tones = [ash, cinder, fresh];
    group.add(
      around(RIBS.length, (index) => {
        const [foot, head, half, tone] = RIBS[index]!;
        return rib(foot, head, half, tones[tone]!);
      }),
    );

    // --- 4. The crater: a ring standing 0.3 proud of the cone's head, a floor
    // that glows, and eleven uneven crags with the notch turned to the front ---
    put(ringWall(6.4, 11.1, RIM_TOP - RIM_BASE, cinder, SIDES), 0, RIM_BASE, 0);
    put(column(6.0, 0.4, ember, 12), 0, RIM_BASE, 0);
    group.add(
      around(CRAGS.length, (index) => {
        const height = CRAGS[index]!;
        if (height === 0) return null;
        // Tapered and five-sided: a block on a rim is a merlon, a wedge is rock.
        const crag = taper(1.6, 0.9, height, cinder, 5);
        crag.position.set(0, RIM_TOP, 8.75);
        return crag;
      }),
    );

    // --- 5. The plume: one leaning group, five lobes, and the only orange in the
    // model. Every piece overlaps the one under it, so the column is joined even
    // though little of it stands on anything. ---
    const plume = new THREE.Group();
    plume.position.set(0, RIM_BASE + 0.3, 0);
    plume.rotation.set(0.05, 0, -0.17);
    group.add(plume);

    const puff = (child: Object3D, x: number, y: number, z: number): void => {
      child.position.set(x, y, z);
      plume.add(child);
    };

    puff(taper(3.4, 3.0, 1.3, cinder, 7), 0, 0, 0);
    puff(taper(3.0, 3.6, 3.8, ember, 7), 0, 1.3, 0);
    puff(taper(3.6, 4.6, 4.4, fresh, 7), 0, 5.1, 0);
    puff(taper(4.8, 6.0, 4.0, ash, 7), 0.4, 8.8, -0.3);
    puff(taper(6.0, 5.0, 3.6, ash, 7), -0.9, 12.0, 0.7);
    puff(column(4.2, 3.0, ash, 6), 3.6, 12.4, -1.4);
    puff(taper(5.2, 3.2, 3.4, lit, 7), 0.5, 14.2, 0.2);
    puff(column(2.8, 2.4, lit, 6), -2.4, 15.8, 1.0);

    // --- 6. What is scattered on the plain: bombs, black debris fans running out
    // over the grey, and a second vent ---
    for (const [bearing, radius, half, height, dark] of BOMBS) {
      spoke(bearing, radius, PLAIN_TOP, taper(half, half * 0.45, height, dark ? fresh : cinder, 5));
    }
    for (const [bearing, radius, half] of FANS) {
      spoke(bearing, radius, PLAIN_TOP, taper(half, half * 0.86, 0.7, cinder, 3));
    }
    // Drifts of ash banked near the plain's edge, `ash` on `ash`, so the ink does the drawing.
    for (const [bearing, radius, half, height] of DRIFTS) {
      spoke(bearing, radius, PLAIN_TOP, taper(half, half * 0.8, height, ash, 3));
    }

    // The second vent, on the front-right where both fixed cameras catch it.
    spoke(56, 21.0, PLAIN_TOP, taper(3.2, 1.9, 2.4, cinder, 8));
    spoke(56, 21.0, PLAIN_TOP + 2.4, taper(2.0, 2.1, 0.5, fresh, 8));

    return group;
  },
};
