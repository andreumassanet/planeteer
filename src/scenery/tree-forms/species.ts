import * as THREE from 'three';
import type { Rng } from '../random.ts';
import { CONE_RAGGED, clusterCards, crownShade, hash, keepInside, lump, type Cluster, type Crown } from './crowns.ts';
import { cone, frondCard, frondSolid } from './fronds.ts';
import { LEAF_ATLAS, LEAF_TEXTURE_MEAN, limb, linear, mix, path, push, scaled, tube, type FormSpec, type RGB, type Soup, type Species, type TreeForm } from './soup.ts';

/** The trunk's colour up its length: darker at the root, where the ground's shade is. */
export const barkAlong = (bark: RGB) => (t: number): RGB => scaled(bark, 0.72 + 0.35 * t);

/** A round broadleaf: a leaning bole into a crown of ten or so clusters, three or four limbs up into them. */
export function broadleaf(rng: Rng, spec: FormSpec, form: TreeForm): void {
  const H = spec.height;
  const bark = linear(spec.bark);
  const green = linear(spec.leaf);
  const green2 = linear(spec.leaf2);
  const trunkTop = H * rng.range(0.36, 0.44);
  const crownRy = (H - trunkTop) / 1.75;
  const crownR = Math.min(spec.reach - 0.4, (crownRy / 0.9) * rng.range(0.92, 1.08));
  const lean = rng.range(0, Math.PI * 2);
  const leanBy = H * rng.range(0, 0.045);
  const lx = Math.cos(lean) * leanBy;
  const lz = Math.sin(lean) * leanBy;
  const crown: Crown = { c: new THREE.Vector3(lx, trunkTop + crownRy * 0.75, lz), r: new THREE.Vector3(crownR, crownRy, crownR) };
  const tint = (): RGB => scaled(mix(green, green2, rng.range(0, 0.5)), rng.range(0.9, 1.1));

  const clusters: Cluster[] = [];
  clusters.push({ c: crown.c.clone().add(new THREE.Vector3(rng.jitter() * 0.1 * crownR, crownRy * 0.45, rng.jitter() * 0.1 * crownR)), r: crownR * rng.range(0.46, 0.54), squat: 0.85, colour: tint() });
  const ring = rng.pick([5, 6, 6, 7]);
  const turn = rng.range(0, Math.PI * 2);
  for (let i = 0; i < ring; i++) {
    const a = turn + (i / ring) * Math.PI * 2 + rng.range(-0.3, 0.3);
    const d = crownR * rng.range(0.48, 0.6);
    clusters.push({ c: new THREE.Vector3(crown.c.x + Math.cos(a) * d, crown.c.y + crownRy * rng.range(-0.1, 0.4), crown.c.z + Math.sin(a) * d), r: crownR * rng.range(0.4, 0.5), squat: 0.8, colour: tint() });
  }
  const solidCount = clusters.length;
  const low = rng.pick([3, 4]);
  for (let i = 0; i < low; i++) {
    const a = turn + 0.5 + (i / low) * Math.PI * 2 + rng.range(-0.3, 0.3);
    const d = crownR * rng.range(0.3, 0.45);
    clusters.push({ c: new THREE.Vector3(crown.c.x + Math.cos(a) * d, crown.c.y - crownRy * rng.range(0.3, 0.5), crown.c.z + Math.sin(a) * d), r: crownR * rng.range(0.36, 0.44), squat: 0.75, colour: scaled(tint(), 0.9) });
  }
  keepInside(clusters, spec.reach);

  const r0 = H * rng.range(0.027, 0.035);
  const bole = path([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(lx * 0.15, trunkTop * 0.35, lz * 0.15),
    new THREE.Vector3(lx * 0.55, trunkTop * 0.72, lz * 0.55),
    new THREE.Vector3(lx, trunkTop, lz),
    new THREE.Vector3(lx * 1.1, crown.c.y, lz * 1.1),
  ], 4);
  tube(form.trunk, bole, (t) => r0 * (1 - t * 0.6) * (1 + 0.8 * Math.max(0, 1 - t / 0.12) ** 2), 6, barkAlong(bark));

  const limbs = rng.pick([3, 4, 4]);
  for (let i = 0; i < limbs; i++) {
    const to = clusters[1 + ((i * 2) % (clusters.length - 1))]!;
    const from = bole[Math.min(bole.length - 1, Math.floor(rng.range(0.55, 0.85) * (bole.length - 1)))]!.clone();
    limb(form.limbs, from, to.c.clone().lerp(crown.c, 0.25), r0 * 0.4, bark, crownRy * 0.2);
  }
  for (let i = 0; i < solidCount; i++) lump(form.crown, clusters[i]!, crown, 0.92);
  clusterCards(form.cards, rng.fork('cards'), clusters, crown, LEAF_ATLAS.broadleaf, 48, 1.45, spec.reach);
}

/** A birch or a poplar: a pale, slender bole, small clusters stacked up it, fine leaves. */
export function birch(rng: Rng, spec: FormSpec, form: TreeForm): void {
  const H = spec.height;
  const bark = linear(spec.bark);
  const green = linear(spec.leaf);
  const green2 = linear(spec.leaf2);
  const lean = rng.range(0, Math.PI * 2);
  const leanBy = H * rng.range(0, 0.05);
  const lx = Math.cos(lean) * leanBy;
  const lz = Math.sin(lean) * leanBy;
  const r0 = H * rng.range(0.016, 0.021);
  const bole = path([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(lx * 0.2 + rng.jitter() * 0.1, H * 0.3, lz * 0.2),
    new THREE.Vector3(lx * 0.6, H * 0.62, lz * 0.6 + rng.jitter() * 0.1),
    new THREE.Vector3(lx, H * 0.9, lz),
  ], 5);
  tube(form.trunk, bole, (t) => r0 * (1 - t * 0.7) * (1 + 0.5 * Math.max(0, 1 - t / 0.08) ** 2), 5, (t, ring) => scaled(bark, (ring % 2 === 0 ? 1 : 0.86) * (0.8 + 0.2 * t)));
  const width = Math.min(spec.reach - 0.3, H * rng.range(0.17, 0.21));
  const crown: Crown = { c: new THREE.Vector3(lx * 0.8, H * 0.66, lz * 0.8), r: new THREE.Vector3(width, H * 0.32, width) };
  const clusters: Cluster[] = [];
  const count = rng.pick([5, 6, 6, 7]);
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    const y = H * (0.42 + 0.5 * t);
    const at = bole[Math.min(bole.length - 1, Math.round((y / H / 0.9) * (bole.length - 1)))]!;
    const a = rng.range(0, Math.PI * 2);
    const off = (1 - t) * width * rng.range(0.25, 0.5);
    clusters.push({
      c: new THREE.Vector3(at.x + Math.cos(a) * off, y, at.z + Math.sin(a) * off),
      r: width * (0.95 - 0.4 * t) * rng.range(0.9, 1.1),
      squat: 0.9,
      colour: scaled(mix(green, green2, rng.range(0, 0.5)), rng.range(0.92, 1.12)),
    });
  }
  keepInside(clusters, spec.reach);
  for (let i = 0; i < 3; i++) {
    const to = clusters[i]!;
    const from = bole[Math.max(1, Math.floor((to.c.y / H / 0.9 - 0.08) * (bole.length - 1)))]!.clone();
    limb(form.limbs, from, to.c.clone(), r0 * 0.35, bark, 0.3);
  }
  for (const cluster of clusters) lump(form.crown, cluster, crown, 0.85);
  clusterCards(form.cards, rng.fork('cards'), clusters, crown, LEAF_ATLAS.fine, 44, 1.55, spec.reach);
}

/** A Mediterranean cypress: a dark flame of small clusters up a short bole. */
export function cypress(rng: Rng, spec: FormSpec, form: TreeForm): void {
  const H = spec.height;
  const bark = linear(spec.bark);
  const green = scaled(linear(spec.leaf), 0.82);
  const green2 = scaled(linear(spec.leaf2), 0.82);
  const r0 = H * 0.022;
  tube(form.trunk, [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, H * 0.4, 0), new THREE.Vector3(0, H * 0.8, 0)], (t) => r0 * (1 - 0.6 * t), 5, barkAlong(bark));
  const widest = Math.min(spec.reach - 0.25, H * rng.range(0.1, 0.125));
  const from = H * 0.07;
  const crown: Crown = { c: new THREE.Vector3(0, H * 0.45, 0), r: new THREE.Vector3(widest, H * 0.5, widest) };
  const flame = (t: number): number => Math.sin(Math.PI * (0.12 + 0.88 * t)) ** 0.7 * (1 - 0.35 * t) + 0.08;
  const clusters: Cluster[] = [];
  const count = rng.between(7, 9);
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    const r = widest * flame(t) * rng.range(0.92, 1.05);
    const y = from + (H - from - r * 0.9) * t;
    clusters.push({
      c: new THREE.Vector3(rng.jitter() * 0.12 * r, Math.max(y, r * 0.9 + from * 0.5), rng.jitter() * 0.12 * r),
      r,
      squat: 1.15,
      colour: scaled(mix(green, green2, rng.range(0, 0.4)), rng.range(0.9, 1.08)),
    });
  }
  keepInside(clusters, spec.reach);
  // The far flame: a lathe through the clusters' widths, six round, its rings
  // ragged; and the near one's dark core, the same lathe at seven tenths.
  const sides = 6;
  const flameOf = (out: Soup, share: number, colourAt: (p: THREE.Vector3) => RGB): void => {
    const stations = clusters.map((cluster) => ({ y: cluster.c.y, r: cluster.r * share }));
    stations.unshift({ y: from, r: clusters[0]!.r * share * 0.5 });
    stations.push({ y: H * (share > 0.8 ? 1 : 0.94), r: 0.05 });
    const lathe = stations.map(({ y, r }, i) => {
      const below = stations[Math.max(0, i - 1)]!;
      const above = stations[Math.min(stations.length - 1, i + 1)]!;
      const slope = (below.r - above.r) / Math.max(0.1, above.y - below.y);
      const ring: { p: THREE.Vector3; n: THREE.Vector3 }[] = [];
      for (let k = 0; k < sides; k++) {
        const a = -(k / sides) * Math.PI * 2;
        const rr = r * (1 + CONE_RAGGED * (hash(i, k, share) * 2 - 1));
        ring.push({ p: new THREE.Vector3(Math.cos(a) * rr, y, Math.sin(a) * rr), n: new THREE.Vector3(Math.cos(a), slope, Math.sin(a)).normalize() });
      }
      return ring;
    });
    for (let i = 0; i + 1 < lathe.length; i++) {
      for (let k = 0; k < sides; k++) {
        const a = lathe[i]![k]!;
        const b = lathe[i]![(k + 1) % sides]!;
        const c = lathe[i + 1]![k]!;
        const d = lathe[i + 1]![(k + 1) % sides]!;
        for (const v of [a, b, c, b, d, c]) push(out, v.p, v.n, colourAt(v.p));
      }
    }
  };
  const flameGreen = mix(green, green2, 0.25);
  flameOf(form.crown, 0.95, (p) => crownShade(crown, p, scaled(flameGreen, LEAF_TEXTURE_MEAN)));
  flameOf(form.limbs, 0.68, (p) => crownShade(crown, p, scaled(flameGreen, LEAF_TEXTURE_MEAN * 0.45)));
  clusterCards(form.cards, rng.fork('cards'), clusters, crown, LEAF_ATLAS.fine, 58, 1.6, spec.reach);
}

/**
 * A conifer: a spire, and nine to eleven tiers of drooping boughs round it,
 * fewer and shorter up it, each tier's tips falling past the next one's
 * roots so no sky shows between them but at the ragged edge; and inside the
 * boughs, a dark core of cones, so a near fir is never a pole with twigs on
 * it however the cards fall. Far off, a stack of ragged cones, one a tier.
 */
export function conifer(rng: Rng, spec: FormSpec, form: TreeForm): void {
  const H = spec.height;
  const bark = linear(spec.bark);
  // A fir's green is bluer than a meadow's, and bluer still in its shade.
  const cool = (c: RGB, k: number): RGB => [c[0] * (1 - 0.12 * k), c[1] * (1 - 0.02 * k), c[2] * (1 + 0.22 * k)];
  const green = cool(linear(spec.leaf), 1);
  const green2 = cool(linear(spec.leaf2), 1);
  const r0 = H * rng.range(0.022, 0.028);
  tube(form.trunk, [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, H * 0.35, 0), new THREE.Vector3(0, H * 0.7, 0), new THREE.Vector3(0, H * 0.97, 0)], (t) => r0 * (1 - 0.85 * t) * (1 + 0.6 * Math.max(0, 1 - t / 0.1) ** 2), 5, barkAlong(bark));
  const widest = Math.min(spec.reach - 0.2, H * rng.range(0.28, 0.33));
  const bottom = H * rng.range(0.12, 0.17);
  const tiers = rng.between(9, 11);
  const crown: Crown = { c: new THREE.Vector3(0, (bottom + H) / 2, 0), r: new THREE.Vector3(widest, (H - bottom) / 2, widest) };
  const rect = LEAF_ATLAS.needles;
  let previousTop = H;
  let coreTop = H * 0.9;
  for (let i = tiers - 1; i >= 0; i--) {
    // Built top down, so each cone knows where the one above starts.
    const t = i / (tiers - 1);
    const y = bottom + (H - bottom - H * 0.08) * t ** 0.92;
    const R = Math.max(0.6, widest * (1 - 0.82 * t ** 0.85)) * rng.range(0.94, 1.06);
    const droop = rng.range(0.45, 0.6);
    const lift = rng.range(0, 0.15);
    const fronds = Math.max(4, Math.round(8 - 4 * t));
    const turn = rng.range(0, Math.PI * 2);
    const shade = 0.7 + 0.34 * t;
    const tierColour = scaled(mix(green, green2, rng.range(0, 0.5)), shade * rng.range(0.93, 1.07));
    for (let k = 0; k < fronds; k++) {
      const a = turn + (k / fronds) * Math.PI * 2 + rng.range(-0.3, 0.3);
      const dir = new THREE.Vector3(Math.cos(a), lift, Math.sin(a)).normalize();
      const length = Math.min((R * rng.range(0.92, 1.1)) / Math.hypot(1, lift), spec.reach - 0.3);
      const base = new THREE.Vector3(Math.cos(a) * r0 * 0.5, y + rng.range(-0.2, 0.2), Math.sin(a) * r0 * 0.5);
      // Dark and blue at the root, light at the tip.
      const colour = (s: number): RGB => crownShade(crown, base.clone().addScaledVector(dir, s * length), cool(scaled(tierColour, 0.62 + 0.55 * s), 1 - s));
      // The three lowest tiers, the longest boughs and the ones at eye level,
      // bend along their length; the rest are one straight piece, which is
      // half the triangles and at their size reads the same.
      const segments = i < 3 ? 2 : 1;
      frondCard(form.cards, { base, dir, length, width: length * rng.range(0.85, 1.05), droop: segments === 2 ? droop : droop * 0.6, segments, upward: 0.35, fold: 0.75, taper: 1, colour }, rect, 0.5 + 0.5 * (1 - t), rng.unit());
    }
    // Open underneath: a far fir is seen from the side and above, and its
    // skirts' undersides were half its triangles.
    // Kept off the ground by a slice of bare trunk, which is what the trunk's
    // disc is measured from (`partShape`).
    const skirt = Math.max(0.8, y - droop * R * 0.75);
    const far = cool(scaled(tierColour, LEAF_TEXTURE_MEAN * 0.9), 0.5);
    cone(form.crown, skirt, Math.min(previousTop, y + R * 1.3), Math.min(R * 0.95, spec.reach / (1 + CONE_RAGGED)), 8, far, null, crown);
    previousTop = y + R * 0.45;
    // The near core, every other tier: the far cone at seven tenths, in the
    // shade's colour, so what shows between the boughs is the dark of a fir.
    if ((tiers - 1 - i) % 2 === 0 || i === 0) {
      const core = cool(scaled(tierColour, LEAF_TEXTURE_MEAN * 0.5), 1);
      cone(form.limbs, Math.max(0.9, y - droop * R * 0.4), Math.min(coreTop, y + R * 1.2), R * 0.68, 6, core, scaled(core, 0.6), crown);
      coreTop = y + R * 0.5;
    }
  }
  // The leader: a few short boughs standing up round the top.
  for (let k = 0; k < 3; k++) {
    const a = rng.range(0, Math.PI * 2);
    const dir = new THREE.Vector3(Math.cos(a) * 0.35, 1, Math.sin(a) * 0.35).normalize();
    const base = new THREE.Vector3(0, H * 0.84, 0);
    const colour = (s: number): RGB => scaled(green, 0.95 + 0.2 * s);
    frondCard(form.cards, { base, dir, length: H * 0.16, width: H * 0.08, droop: 0.05, segments: 1, upward: 0.3, fold: 0.3, taper: 1, colour }, rect, 0.8, rng.unit());
  }
}

/** A palm: a curving, ringed trunk and a head of drooping fronds. */
export function palm(rng: Rng, spec: FormSpec, form: TreeForm): void {
  const H = spec.height;
  const bark = linear(spec.bark);
  const green = linear(spec.leaf);
  const green2 = linear(spec.leaf2);
  const trunkH = H - H * rng.range(0.07, 0.1);
  const bend = H * rng.range(0.06, 0.16);
  const heading = rng.range(0, Math.PI * 2);
  const bx = Math.cos(heading);
  const bz = Math.sin(heading);
  const bole = path([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(bx * bend * 0.1, trunkH * 0.35, bz * bend * 0.1),
    new THREE.Vector3(bx * bend * 0.45, trunkH * 0.7, bz * bend * 0.45),
    new THREE.Vector3(bx * bend, trunkH, bz * bend),
  ], 6);
  const r0 = H * rng.range(0.022, 0.027);
  tube(form.trunk, bole, (t) => r0 * (1 - 0.35 * t) * (1 + 0.5 * Math.max(0, 1 - t / 0.08) ** 2), 6, (t, ring) => scaled(bark, (ring % 2 === 0 ? 1 : 0.8) * (0.78 + 0.3 * t)));
  const top = bole[bole.length - 1]!.clone();
  const count = rng.pick([9, 10, 11, 12]);
  const room = spec.reach - Math.hypot(top.x, top.z) - 0.3;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + rng.range(-0.2, 0.2);
    const lift = i % 2 === 0 ? rng.range(0.35, 0.6) : rng.range(0.05, 0.3);
    const dir = new THREE.Vector3(Math.cos(a), lift, Math.sin(a)).normalize();
    const length = Math.min(room / Math.max(0.5, Math.hypot(dir.x, dir.z)), H * rng.range(0.3, 0.37));
    const droop = rng.range(0.28, 0.45);
    const tone = scaled(mix(green, green2, rng.range(0, 0.5)), rng.range(0.9, 1.1));
    const colour = (s: number): RGB => scaled(tone, (0.7 + 0.35 * s) * 1.15);
    const frond = { base: top.clone().add(new THREE.Vector3(0, 0.1, 0)), dir, length, width: length * rng.range(0.42, 0.5), droop, segments: 4, upward: 0.55, fold: 0.6, taper: 1, colour };
    frondCard(form.cards, frond, LEAF_ATLAS.frond, 1, rng.unit());
    if (i % 5 !== 4) frondSolid(form.crown, { ...frond, segments: 2, width: frond.width * 0.5, taper: 0.35, colour: (s) => scaled(colour(s), LEAF_TEXTURE_MEAN * 1.1) });
  }
  for (let i = 0; i < 3; i++) {
    const a = rng.range(0, Math.PI * 2);
    const dir = new THREE.Vector3(Math.cos(a) * 0.4, 1, Math.sin(a) * 0.4).normalize();
    frondCard(form.cards, { base: top.clone(), dir, length: H * 0.13, width: H * 0.06, droop: 0.1, segments: 2, upward: 0.3, fold: 0.3, taper: 1, colour: () => scaled(green, 0.85) }, LEAF_ATLAS.frond, 0.6, rng.unit());
  }
}

/** An umbrella acacia: a bole that forks into two or three limbs under a flat crown. */
export function acacia(rng: Rng, spec: FormSpec, form: TreeForm): void {
  const H = spec.height;
  const bark = linear(spec.bark);
  const green = linear(spec.leaf);
  const green2 = linear(spec.leaf2);
  const fork = H * rng.range(0.35, 0.48);
  const r0 = H * rng.range(0.028, 0.034);
  const crownR = Math.min(spec.reach - 0.3, H * rng.range(0.44, 0.52));
  const crownY = H * 0.86;
  const crownRy = H * 0.1;
  const crown: Crown = { c: new THREE.Vector3(0, crownY, 0), r: new THREE.Vector3(crownR, crownRy * 1.6, crownR) };
  const forkAt = new THREE.Vector3(rng.jitter() * 0.3, fork, rng.jitter() * 0.3);
  tube(form.trunk, [new THREE.Vector3(0, 0, 0), new THREE.Vector3(forkAt.x * 0.4, fork * 0.5, forkAt.z * 0.4), forkAt], (t) => r0 * (1 - 0.25 * t) * (1 + 0.6 * Math.max(0, 1 - t / 0.12) ** 2), 5, barkAlong(bark));
  const limbs = rng.pick([2, 3, 3]);
  const turn = rng.range(0, Math.PI * 2);
  const clusters: Cluster[] = [];
  for (let i = 0; i < limbs; i++) {
    const a = turn + (i / limbs) * Math.PI * 2 + rng.range(-0.3, 0.3);
    const to = new THREE.Vector3(Math.cos(a) * crownR * 0.45, crownY - crownRy * 0.6, Math.sin(a) * crownR * 0.45);
    // The forks are what a far eye sees of an acacia's wood: on the trunk.
    tube(form.trunk, [forkAt, forkAt.clone().lerp(to, 0.5).add(new THREE.Vector3(0, 0.2, 0)), to], (t) => r0 * 0.7 * (1 - 0.5 * t), 4, (t) => scaled(bark, 0.9 + 0.2 * t));
  }
  const tint = (): RGB => scaled(mix(green, green2, rng.range(0, 0.5)), rng.range(0.9, 1.1));
  clusters.push({ c: new THREE.Vector3(0, crownY + crownRy * 0.3, 0), r: crownR * 0.5, squat: 0.36, colour: tint() });
  const ring = rng.between(5, 6);
  for (let i = 0; i < ring; i++) {
    const a = turn + 0.4 + (i / ring) * Math.PI * 2 + rng.range(-0.25, 0.25);
    const d = crownR * rng.range(0.5, 0.62);
    clusters.push({ c: new THREE.Vector3(Math.cos(a) * d, crownY + crownRy * rng.range(-0.3, 0.2), Math.sin(a) * d), r: crownR * rng.range(0.36, 0.44), squat: 0.4, colour: tint() });
  }
  keepInside(clusters, spec.reach);
  for (let i = 0; i < limbs; i++) {
    const to = clusters[1 + i]!;
    limb(form.limbs, new THREE.Vector3(Math.cos(turn + i * 2.1) * crownR * 0.4, crownY - crownRy * 0.6, Math.sin(turn + i * 2.1) * crownR * 0.4), to.c.clone(), r0 * 0.3, bark, 0.1);
  }
  for (const cluster of clusters) lump(form.crown, cluster, crown, 0.9);
  // A dark, flat core under the leaves, so the umbrella is not lace from below.
  lump(form.limbs, { c: new THREE.Vector3(0, crownY, 0), r: crownR * 0.62, squat: 0.28, colour: scaled(clusters[0]!.colour, 0.5) }, crown, 1);
  clusterCards(form.cards, rng.fork('cards'), clusters, crown, LEAF_ATLAS.fine, 48, 1.3, spec.reach, 0.9);
}

/** A bush: two to four clusters on the ground and no wood to speak of. */
export function bush(rng: Rng, spec: FormSpec, form: TreeForm): void {
  const H = spec.height;
  const green = linear(spec.leaf);
  const green2 = linear(spec.leaf2);
  const width = Math.min(spec.reach, H * rng.range(0.9, 1.3));
  const crown: Crown = { c: new THREE.Vector3(0, H * 0.45, 0), r: new THREE.Vector3(width, H * 0.55, width) };
  const clusters: Cluster[] = [];
  const count = rng.between(2, 4);
  const turn = rng.range(0, Math.PI * 2);
  for (let i = 0; i < count; i++) {
    const main = i === 0;
    const r = main ? Math.min(H * 0.62, width * 0.7) : Math.min(H * 0.5, width * 0.5) * rng.range(0.8, 1.05);
    const a = turn + (i / count) * Math.PI * 2;
    const d = main ? 0 : width - r;
    clusters.push({ c: new THREE.Vector3(Math.cos(a) * d, r * 0.72, Math.sin(a) * d), r, squat: 0.82, colour: scaled(mix(green, green2, rng.range(0, 0.5)), rng.range(0.9, 1.1)) });
  }
  keepInside(clusters, spec.reach - 0.05);
  for (const cluster of clusters) lump(form.crown, cluster, crown, 0.92);
  clusterCards(form.cards, rng.fork('cards'), clusters, crown, LEAF_ATLAS.broadleaf, 14, 1.6, spec.reach);
}

export const SPECIES: Record<Species, (rng: Rng, spec: FormSpec, form: TreeForm) => void> = {
  broadleaf,
  birch,
  conifer,
  cypress,
  palm,
  acacia,
  bush,
};
