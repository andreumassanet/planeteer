/**
 * The hats, each built to the head it goes on.
 *
 * A hat is built in the rig's frame (`fit.ts`: metres, soles at 0, face to
 * +Z) round the head's own measurements: a band cut to the head's widest
 * points above it (`bandAt`) and, for a hat that covers the crown, a dome
 * over every point of the hair (`domeOver`). Nothing is placed by a number
 * that assumes one head: the brow is the eyes' top, the crown is the hair's,
 * the ears are where the head is widest beside them. A brim is a ring out
 * from the band; a peak is a swept arc in front of it.
 *
 * Most take the look's hat colour (`colourable`); the rest are what they
 * are: a crown is gold, a pilot's cap leather.
 */
import * as THREE from 'three';
import { craftContext } from '../craft/build.ts';
import { PALETTE } from '../theme.ts';
import { bandAt, domeOver, type Band, type Dome, type HeadFit } from './fit.ts';
import { FINISH, arc, ball, domeProfile, ellipse, ringProfile, turned, type Finish } from './shapes.ts';

export interface HatModel {
  /** Whether it is painted in the look's hat colour. */
  colourable: boolean;
  /** Whether every point of the head over its band is under it (`pnpm cosmetics` holds the ones that say so). */
  covers: boolean;
  build(fit: HeadFit, colour: number): HatBuilt;
}

export interface HatBuilt {
  parts: [THREE.Object3D, Finish][];
  /** The height its band is cut at. */
  band: number;
}

const SIDES = 12;
/** How far over the top of the eyes a brow is, metres. */
const BROW = 0.022;
/** A band of colour laid round a hat stands this far off it, metres: off its plane, so the two never fight. */
const STEP = 0.006;

const tone = (color: number, factor: number): number => craftContext().tone(color, factor);

function group(...meshes: THREE.Object3D[]): THREE.Object3D {
  const out = new THREE.Group();
  for (const mesh of meshes) out.add(mesh);
  return out;
}

/** How much a faceted turn of `sides` is grown so its flats, not its corners, stand on the radius. */
const FLATS = 1 / Math.cos(Math.PI / SIDES);

/** The crown of a covering hat: the dome, `tall` times as high as it needs to be, its facets outside it. */
function dome(d: Dome, color: number, tall = 1, rows = 4): THREE.Mesh {
  const rise = 1 / Math.cos(Math.PI / (4 * rows));
  return ellipse(turned(domeProfile(rows), color, SIDES), d.rx * FLATS * rise, d.height * tall * rise, d.rz * FLATS * rise, d.y, d.cz);
}

/** A ring round a band, `inner` to `outer` of its radii, `thick` deep under `y`, its edge dropped by `drop`. */
function brim(b: Band, color: number, inner: number, outer: number, thick: number, drop: number, y: number, deep = 1): THREE.Mesh {
  return ellipse(turned(ringProfile(inner, outer, thick, drop), color, SIDES), b.rx, 1, b.rz * deep, y, b.cz);
}

/** A peak in front of a band, over `spread` radians either side of the face. */
function peak(b: Band, color: number, reach: number, spread: number, y: number, drop: number): THREE.Mesh {
  const section = ringProfile(0.9, reach, 0.012, drop).slice(0, -1);
  return ellipse(arc(section, color, -spread, spread, 6), b.rx, 1, b.rz, y, b.cz);
}

/** Every hat, by catalogue id. */
export const HAT_MODELS: Readonly<Record<string, HatModel>> = {
  'hat-pith': {
    colourable: false,
    covers: true,
    build(fit) {
      const band = bandAt(fit, fit.eyeTop + BROW + 0.01, 0.012);
      const d = domeOver(fit, band, 0.012);
      const crown = dome(d, PALETTE.sand, 1.15);
      const rim = brim(band, tone(PALETTE.sand, 0.9), 0.9, 1.38, 0.012, 0.02, band.y + 0.006, 1.08);
      const ribbon = ellipse(turned(ringProfile(0.9, 1.0 + STEP / band.rx, 0.022), PALETTE.brown, SIDES), band.rx, 1, band.rz, band.y + 0.03, band.cz);
      const knob = ellipse(turned(domeProfile(2), tone(PALETTE.sand, 0.9), 8), 0.018, 0.018, 0.018, d.y + d.height * 1.15 - 0.006, d.cz);
      return { parts: [[group(crown, rim, knob), FINISH.cloth], [group(ribbon), FINISH.leather]], band: band.y };
    },
  },
  'hat-cap': capModel(false),
  'hat-beanie': {
    colourable: true,
    covers: true,
    build(fit, colour) {
      const band = bandAt(fit, fit.eyeTop + BROW + 0.004, 0.012);
      const d = domeOver(fit, band, 0.012);
      const crown = dome(d, colour, 1.08, 5);
      const cuff = ellipse(turned(ringProfile(0.9, 1.0 + (2 * STEP) / band.rx, 0.04), tone(colour, 0.85), SIDES), d.rx, 1, d.rz, band.y + 0.04, band.cz);
      const bobble = ball(0.036, PALETTE.white);
      bobble.position.set(0, d.y + d.height * 1.08 + 0.026, d.cz);
      return { parts: [[group(crown, cuff, bobble), FINISH.cloth]], band: band.y };
    },
  },
  'hat-bucket': {
    colourable: true,
    covers: true,
    build(fit, colour) {
      const band = bandAt(fit, fit.eyeTop + BROW + 0.014, 0.012);
      const d = domeOver(fit, band, 0.012);
      const profile: [number, number][] = [[0, 0], [1, 0], [1, 0.55], [0.86, 0.94], [0.7, 1], [0, 1]];
      const crown = ellipse(turned(profile, colour, SIDES), d.rx * 1.04, d.height * 1.05, d.rz * 1.04, band.y, band.cz);
      const rim = brim(band, tone(colour, 0.92), 0.9, 1.5, 0.012, 0.04, band.y + 0.008);
      const ribbon = ellipse(turned(ringProfile(0.9, 1.04 + STEP / band.rx, 0.024), tone(colour, 0.78), SIDES), d.rx, 1, d.rz, band.y + 0.034, band.cz);
      return { parts: [[group(crown, rim, ribbon), FINISH.cloth]], band: band.y };
    },
  },
  'hat-straw': {
    colourable: true,
    covers: true,
    build(fit, colour) {
      const band = bandAt(fit, fit.eyeTop + BROW + 0.02, 0.012);
      const d = domeOver(fit, band, 0.014);
      const profile: [number, number][] = [[0, 0], [1, 0], [1, 0.6], [0.88, 1], [0, 1]];
      const crown = ellipse(turned(profile, PALETTE.sand, SIDES), d.rx, d.height * 1.08, d.rz, band.y, band.cz);
      const rim = brim(band, tone(PALETTE.sand, 1.06), 0.9, 2.05, 0.012, 0.03, band.y + 0.008);
      const ribbon = ellipse(turned(ringProfile(0.9, 1.0 + STEP / d.rx, 0.026), colour, SIDES), d.rx, 1, d.rz, band.y + 0.038, band.cz);
      return { parts: [[group(crown, rim), FINISH.none], [group(ribbon), FINISH.cloth]], band: band.y };
    },
  },
  'hat-top': {
    colourable: true,
    covers: true,
    build(fit, colour) {
      const band = bandAt(fit, fit.eyeTop + BROW + 0.035, 0.01);
      const tall = Math.max(0.1, fit.crown - band.y) + 0.085;
      const profile: [number, number][] = [[0, 0], [1, 0], [1, 0.55], [1.07, 1], [0, 1]];
      const crown = ellipse(turned(profile, colour, SIDES), band.rx, tall, band.rz, band.y, band.cz);
      const rim = brim(band, tone(colour, 0.9), 0.9, 1.42, 0.012, -0.006, band.y + 0.008);
      const ribbon = ellipse(turned(ringProfile(0.9, 1.0 + STEP / band.rx, 0.034), PALETTE.crimson, SIDES), band.rx, 1, band.rz, band.y + 0.05, band.cz);
      return { parts: [[group(crown, rim, ribbon), FINISH.cloth]], band: band.y };
    },
  },
  'hat-beret': {
    colourable: true,
    covers: false,
    build(fit, colour) {
      const band = bandAt(fit, fit.eyeTop + BROW + 0.035, 0.01);
      const tall = Math.max(0.05, fit.crown - band.y) + 0.035;
      const profile: [number, number][] = [[0, 0], [1, 0], [1.22, 0.3], [1.2, 0.62], [0.9, 0.92], [0, 1]];
      const body = ellipse(turned(profile, colour, SIDES), band.rx, tall, band.rz, 0, 0);
      const stalk = craftContext().column(0.007, 0.02, tone(colour, 0.8), 5);
      stalk.position.set(0, tall - 0.004, 0);
      const tilted = group(body, stalk);
      tilted.rotation.z = -0.2;
      tilted.position.set(-0.012, band.y + 0.012, band.cz);
      return { parts: [[group(tilted), FINISH.cloth]], band: band.y };
    },
  },
  'hat-flat': {
    colourable: true,
    covers: true,
    build(fit, colour) {
      const band = bandAt(fit, fit.eyeTop + BROW + 0.012, 0.01);
      const d = domeOver(fit, band, 0.01);
      const crown = ellipse(turned(domeProfile(4, 1.6), colour, SIDES), d.rx * 1.04, d.height * 1.02, d.rz * 1.1, band.y, band.cz + 0.012);
      const front = peak(band, tone(colour, 0.9), 1.42, 0.95, band.y + 0.008, 0.014);
      return { parts: [[group(crown, front), FINISH.cloth]], band: band.y };
    },
  },
  'hat-captain': {
    colourable: true,
    covers: true,
    build(fit, colour) {
      const band = bandAt(fit, fit.eyeTop + BROW + 0.02, 0.01);
      const ctx = craftContext();
      const wall = 0.055;
      const ring = ellipse(turned([[0, 0], [1, 0], [1, 1], [0, 1]], colour, SIDES), band.rx, wall, band.rz, band.y, band.cz);
      const over = bandAt(fit, band.y + wall, 0.012);
      const tall = Math.max(0.04, fit.crown - band.y - wall + 0.035);
      const top = ellipse(turned([[0, 0], [1, 0], [1.32, 0.8], [1.28, 1], [0, 1]], PALETTE.white, SIDES), over.rx, tall, over.rz, band.y + wall - 0.004, band.cz);
      const visor = peak(band, PALETTE.slate, 1.5, 1.0, band.y + 0.01, 0.03);
      const badge = ctx.box(0.04, 0.03, 0.012, PALETTE.gold);
      badge.position.set(0, band.y + 0.012, band.cz + band.rz + 0.004);
      return { parts: [[group(ring, top), FINISH.cloth], [group(visor, badge), FINISH.none]], band: band.y };
    },
  },
  'hat-pilot': {
    colourable: false,
    covers: true,
    build(fit) {
      const ctx = craftContext();
      const band = bandAt(fit, fit.eyeTop + BROW + 0.004, 0.008);
      const d = domeOver(fit, band, 0.008);
      const leather = PALETTE.brown;
      const crown = dome(d, leather, 1.02);
      const flaps: THREE.Object3D[] = [];
      const side = Math.max(fit.earHalf, band.rx * 0.96) + 0.01;
      for (const s of [1, -1]) {
        const flap = ctx.box(0.02, 0.085, 0.08, tone(leather, 0.88));
        flap.position.set(s * side, band.y - 0.075, band.cz - 0.008);
        flaps.push(flap);
      }
      const strapY = band.y + 0.034;
      const strap = ellipse(turned(ringProfile(0.94, 1.0 + (2 * STEP) / d.rx, 0.016), PALETTE.bark, SIDES), d.rx, 1, d.rz, strapY, d.cz);
      const lenses: THREE.Object3D[] = [];
      const front = d.cz + d.rz * Math.sqrt(Math.max(0, 1 - ((strapY - d.y) / d.height) ** 2));
      for (const s of [1, -1]) {
        const rim = ctx.column(0.026, 0.022, tone(PALETTE.gold, 0.85), 8);
        rim.rotation.x = Math.PI / 2;
        rim.position.set(s * 0.045, strapY - 0.004, front - 0.006);
        const lens = ctx.column(0.019, 0.006, tone(PALETTE.skyBlue, 1.1), 8);
        lens.rotation.x = Math.PI / 2;
        lens.position.set(s * 0.045, strapY - 0.004, front + 0.016);
        lenses.push(rim, lens);
      }
      return { parts: [[group(crown, ...flaps, strap), FINISH.leather], [group(...lenses), FINISH.none]], band: band.y };
    },
  },
  'hat-crown': {
    colourable: false,
    covers: false,
    build(fit) {
      const ctx = craftContext();
      const band = bandAt(fit, fit.eyeTop + BROW + 0.04, 0.008);
      const height = 0.045;
      const gold = PALETTE.gold;
      const ring = ellipse(turned(ringProfile(1.0, 1.1, height), gold, SIDES), band.rx, 1, band.rz, band.y + height, band.cz);
      const pieces: THREE.Object3D[] = [ring];
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const point = ctx.taper(0.02, 0.003, 0.05, tone(gold, 1.08), 4);
        point.position.set(Math.sin(a) * band.rx * 1.05, band.y + height - 0.002, band.cz + Math.cos(a) * band.rz * 1.05);
        point.rotation.y = a;
        pieces.push(point);
        const gem = ball(0.012, i % 2 === 0 ? PALETTE.crimson : PALETTE.skyBlue);
        gem.position.set(Math.sin(a) * (band.rx * 1.1 + 0.004), band.y + height / 2, band.cz + Math.cos(a) * (band.rz * 1.1 + 0.004));
        pieces.push(gem);
      }
      return { parts: [[group(...pieces), FINISH.none]], band: band.y };
    },
  },
  'hat-horned': {
    colourable: false,
    covers: true,
    build(fit) {
      const ctx = craftContext();
      const band = bandAt(fit, fit.eyeTop + BROW + 0.012, 0.01);
      const d = domeOver(fit, band, 0.01);
      const crown = dome(d, PALETTE.steel, 1.06);
      const rim = ellipse(turned(ringProfile(0.94, 1.0 + (2 * STEP) / d.rx, 0.024), PALETTE.brown, SIDES), d.rx, 1, d.rz, band.y + 0.024, d.cz);
      const horns: THREE.Object3D[] = [];
      const hornY = band.y + d.height * 0.45;
      const hornX = d.rx * Math.sqrt(1 - 0.45 ** 2) - 0.008;
      for (const s of [1, -1]) {
        const base = ctx.taper(0.024, 0.016, 0.08, PALETTE.cream, 6);
        base.rotation.z = -s * 1.15;
        base.position.set(s * hornX, hornY, d.cz);
        const tip = ctx.taper(0.016, 0.002, 0.07, tone(PALETTE.cream, 0.94), 6);
        tip.rotation.z = -s * 0.35;
        const out = 0.08 * Math.sin(1.15);
        tip.position.set(s * (hornX + out - 0.004), hornY + 0.08 * Math.cos(1.15) - 0.004, d.cz);
        horns.push(base, tip);
      }
      return { parts: [[group(crown), FINISH.none], [group(rim), FINISH.leather], [group(...horns), FINISH.none]], band: band.y };
    },
  },
  'hat-flowers': {
    colourable: false,
    covers: false,
    build(fit) {
      const band = bandAt(fit, fit.eyeTop + BROW + 0.045, 0.004);
      const vine = ellipse(turned(ringProfile(1.0, 1.09, 0.02), PALETTE.green, SIDES), band.rx, 1, band.rz, band.y + 0.02, band.cz);
      const flowers: THREE.Object3D[] = [vine];
      const colours = [PALETTE.pink, PALETTE.white, PALETTE.gold, PALETTE.salmon, PALETTE.violet];
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        const flower = ball(0.028, colours[i % colours.length]!);
        flower.position.set(Math.sin(a) * band.rx * 1.1, band.y + 0.016, band.cz + Math.cos(a) * band.rz * 1.1);
        flower.scale.set(1, 0.7, 1);
        const leaf = ball(0.018, tone(PALETTE.green, 0.85));
        const b = a + Math.PI / 9;
        leaf.position.set(Math.sin(b) * band.rx * 1.07, band.y + 0.006, band.cz + Math.cos(b) * band.rz * 1.07);
        leaf.scale.set(1.4, 0.5, 1);
        leaf.rotation.y = b;
        flowers.push(flower, leaf);
      }
      return { parts: [[group(...flowers), FINISH.cloth]], band: band.y };
    },
  },
  'hat-headphones': {
    colourable: true,
    covers: false,
    build(fit, colour) {
      const ctx = craftContext();
      const band = bandAt(fit, fit.eyeTop + 0.005, 0.01);
      const d = domeOver(fit, band, 0.012);
      const pieces: THREE.Object3D[] = [];
      const steps = 7;
      const point = (i: number): THREE.Vector3 => {
        const a = (i / steps) * Math.PI;
        return new THREE.Vector3(Math.cos(a) * (d.rx + 0.012), d.y + Math.sin(a) * (d.height + 0.014), d.cz - 0.01);
      };
      for (let i = 0; i < steps; i++) pieces.push(ctx.strut(point(i), point(i + 1), 0.016, tone(colour, 0.8)));
      const cupX = Math.max(fit.earHalf, d.rx) + 0.016;
      for (const s of [1, -1]) {
        pieces.push(ctx.strut(new THREE.Vector3(s * (d.rx + 0.012), d.y + 0.006, d.cz - 0.01), new THREE.Vector3(s * (cupX + 0.004), fit.earY + 0.03, d.cz - 0.01), 0.016, tone(colour, 0.8)));
        const cup = ctx.column(0.042, 0.03, colour, 10);
        cup.rotation.z = -s * (Math.PI / 2);
        cup.position.set(s * (cupX - 0.006), fit.earY, d.cz - 0.01);
        pieces.push(cup);
      }
      return { parts: [[group(...pieces), FINISH.none]], band: band.y };
    },
  },
  'hat-party': {
    colourable: true,
    covers: false,
    build(fit, colour) {
      const tall = 0.17;
      const base = 0.06;
      const rings: THREE.Object3D[] = [];
      const bands = 4;
      for (let i = 0; i < bands; i++) {
        const lo = i / bands;
        const hi = (i + 1) / bands;
        const profile: [number, number][] = [[0, 0], [base * (1 - lo), 0], [base * (1 - hi), tall / bands], [0, tall / bands]];
        const piece = turned(profile, i % 2 === 0 ? colour : PALETTE.white, 10);
        piece.position.y = lo * tall;
        rings.push(piece);
      }
      const pompom = ball(0.024, PALETTE.gold);
      pompom.position.y = tall + 0.012;
      const cone = group(...rings, pompom);
      cone.rotation.set(-0.16, 0, -0.12);
      cone.position.set(0.01, fit.crown - 0.03, fit.centreZ - 0.01);
      return { parts: [[group(cone), FINISH.cloth]], band: fit.crown - 0.03 };
    },
  },
  'hat-guild': capModel(true),
};

/** A baseball cap; the Guild's is in its own colours with its badge on the front. */
function capModel(guild: boolean): HatModel {
  return {
    colourable: !guild,
    covers: true,
    build(fit, colour) {
      const cloth = guild ? PALETTE.darkOlive : colour;
      const band = bandAt(fit, fit.eyeTop + BROW + 0.012, 0.01);
      const d = domeOver(fit, band, 0.008);
      const crown = dome(d, cloth, 1.0, 4);
      const visor = peak(band, guild ? PALETTE.gold : tone(cloth, 0.86), 1.85, 0.85, band.y + 0.012, 0.022);
      const button = ball(0.014, guild ? PALETTE.gold : tone(cloth, 0.8));
      button.position.set(0, d.y + d.height - 0.002, d.cz);
      const pieces: THREE.Object3D[] = [crown, visor, button];
      if (guild) {
        const badgeY = band.y + d.height * 0.42;
        const front = d.cz + d.rz * Math.sqrt(1 - 0.42 ** 2);
        const badge = ball(0.026, PALETTE.gold);
        badge.scale.set(1, 1, 0.35);
        badge.position.set(0, badgeY, front + 0.002);
        const centre = ball(0.012, PALETTE.white);
        centre.scale.set(1, 1, 0.4);
        centre.position.set(0, badgeY, front + 0.01);
        pieces.push(badge, centre);
      }
      return { parts: [[group(...pieces), FINISH.cloth]], band: band.y };
    },
  };
}
