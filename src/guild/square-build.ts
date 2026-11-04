/**
 * The Explorers' Guild's square drawn: the hall (`square-hall.ts`) and
 * everything round it, laid where `guildLayout` says, written into `Sink`s
 * (the street dressing's writer) in the square's own frame: its middle at
 * the origin on the paving, `+x` and `+z` the town's. The town turns that
 * frame onto its terrace and merges the runs into its one buffer.
 *
 * What it draws: the compass rose and the ring of light stone round the
 * fountain and a border round the square, flush on the paving as the
 * street's paint is (`DECAL_LIFT`); the fountain with its armillary globe;
 * the two poles, the country's colours and the guild's banner, with bunting
 * in the country's colours strung to the porch; and, near, the stalls, the
 * noticeboard and the Hall of Fame, the signpost, the map table and the tree
 * beds. The lamps, benches and trees are the town's own kit.
 */
import * as THREE from 'three';
import { flagPalette } from '../country-colors.ts';
import { tone } from '../monuments/contract.ts';
import { PROUD } from '../scenery/contract/tones.ts';
import { rngFrom } from '../scenery/random.ts';
import { DECAL_LIFT } from '../scenery/street-dressing/config.ts';
import { drawStall } from '../scenery/street-dressing/furniture.ts';
import { shade } from '../scenery/street-dressing/paint.ts';
import { Sink } from '../scenery/street-dressing/sink.ts';
import { BASE, STYLES } from '../scenery/street-dressing/styles.ts';
import { AVATAR_HEIGHT } from '../stature.ts';
import { PALETTE } from '../theme.ts';
import { BOARD_DEPTH, PLANTER_RADIUS, PORCH_HEIGHT, POLE_HEIGHT } from './square.ts';
import type { BoardSpot, GuildLayout, Spot } from './square.ts';
import { HALL_COLOURS, compass, drawHall } from './square-hall.ts';

const P = PALETTE;
const M = AVATAR_HEIGHT / 1.75;
const C = HALL_COLOURS;

/** The fountain's still water. */
export const FOUNTAIN_WATER = tone(P.skyBlue, 0.88);
/** The ring of light stone round the fountain, as a share of the square's own paving. */
export const RING_SHADE = 1.16;

/** What a square is drawn for: its region (the stalls' cloth), its country (the flags) and its paving's stone. */
export interface GuildLook {
  region: string;
  iso: string;
  /** The region's plaza stone (`GroundStyle.plaza`), which the paint on the paving is toned from. */
  plaza: number;
  /** Whether the near things are drawn too: the stalls, the boards, the bunting, the signpost, the table, the beds. */
  near: boolean;
  seed: string;
}

/** The square's runs: the hall's stone storey, its upper storey and roof, and everything else. */
export interface GuildDrawn {
  stone: Sink;
  upper: Sink;
  decor: Sink;
  /** The hall's height over the paving, to its vane. */
  hallHeight: number;
}

/** The cloth a pole flies: the country's flag colours as bands, the largest first. */
function flagBands(iso: string): number[] {
  const colours = flagPalette(iso).map((colour) => Number.parseInt(colour.hex.slice(1), 16));
  if (colours.length === 0) return [P.crimson, P.gold];
  return colours.slice(0, 3);
}

/** A point of the town's plane in the square's frame. */
const local = (layout: GuildLayout, x: number, z: number): [number, number] => [x - layout.cx, z - layout.cz];

/** The transform that stands a piece at `spot` in the square's frame: there, turned by its yaw. */
function placeAt(layout: GuildLayout, spot: Spot, y = 0): THREE.Matrix4 {
  const [x, z] = local(layout, spot.x, spot.z);
  return new THREE.Matrix4().makeRotationY(spot.yaw).setPosition(x, y, z);
}

/** Draws the whole square: the hall and the decor, each run in the square's frame. */
export function drawGuild(layout: GuildLayout, look: GuildLook): GuildDrawn {
  const hall = drawHall(layout.hall, placeAt(layout, layout.hall));
  const decor = new Sink();
  const identity = new THREE.Matrix4();
  decor.place(identity);
  paving(decor, layout, look.plaza);
  fountain(decor, layout);
  const bands = flagBands(look.iso);
  layout.flags.forEach((pole, k) => flagPole(decor, layout, pole, k === 0 ? bands : null));
  if (look.near) {
    const rng = rngFrom(look.seed, 'guild-decor');
    const style = STYLES[look.region] ?? BASE;
    for (const stall of layout.stalls) {
      decor.place(placeAt(layout, stall));
      drawStall(decor, rng, style);
    }
    for (const board of layout.boards) {
      decor.place(placeAt(layout, board));
      if (board.kind === 'jobs') noticeboard(decor, board, rng);
      else fameBoard(decor, board);
    }
    if (layout.signpost !== null) signpost(decor, placeAt(layout, layout.signpost));
    if (layout.table !== null) mapTable(decor, placeAt(layout, layout.table));
    for (const bed of layout.planters) {
      decor.place(placeAt(layout, bed));
      treeBed(decor, rng);
    }
    decor.place(identity);
    bunting(decor, layout, bands);
  }
  decor.place(identity);
  return { stone: hall.stone, upper: hall.upper, decor, hallHeight: hall.height };
}

/**
 * The paint on the square's paving, flush and one layer: a border round the
 * square, a ring of light stone round the fountain, the compass rose out
 * from it with its north point true, and a ring closing the rose. No two
 * pieces overlap, so none fights another for the pixel.
 */
function paving(sink: Sink, layout: GuildLayout, plaza: number): void {
  const y = DECAL_LIFT;
  const [x0, z0] = local(layout, layout.x0, layout.z0);
  const [x1, z1] = local(layout, layout.x1, layout.z1);
  const border = 0.55;
  sink.paint(shade(plaza, 0.8));
  const flat = (a0: number, a1: number, b0: number, b1: number): void =>
    sink.quad([a0, y, b1, a1, y, b1, a1, y, b0, a0, y, b0], 0, 1, 0);
  flat(x0, x1, z0, z0 + border);
  flat(x0, x1, z1 - border, z1);
  flat(x0, x0 + border, z0 + border, z1 - border);
  flat(x1 - border, x1, z0 + border, z1 - border);
  const [fx, fz] = local(layout, layout.fountain.x, layout.fountain.z);
  const r = layout.fountain.radius;
  const rose = layout.fountain.rose;
  const ring = (inner: number, outer: number, sides: number): void => {
    for (let i = 0; i < sides; i++) {
      const a = (i / sides) * Math.PI * 2;
      const b = ((i + 1) / sides) * Math.PI * 2;
      sink.quad([
        fx + Math.cos(a) * inner, y, fz + Math.sin(a) * inner,
        fx + Math.cos(a) * outer, y, fz + Math.sin(a) * outer,
        fx + Math.cos(b) * outer, y, fz + Math.sin(b) * outer,
        fx + Math.cos(b) * inner, y, fz + Math.sin(b) * inner,
      ], 0, 1, 0);
    }
  };
  const inner = r + 0.25;
  const hub = r + 0.9;
  sink.paint(shade(plaza, RING_SHADE));
  ring(inner, hub, 28);
  sink.paint(shade(plaza, 1.1));
  ring(rose + 0.12, rose + 0.5, 32);
  // The points: the long four on the cardinals, north (+z) in crimson; the short four between.
  const point = (angle: number, length: number, light: number, dark: number): void => {
    const spread = 0.26;
    const mx = fx + Math.cos(angle) * hub;
    const mz = fz + Math.sin(angle) * hub;
    const tx = fx + Math.cos(angle) * length;
    const tz = fz + Math.sin(angle) * length;
    sink.paint(light);
    sink.tri(mx, y, mz, tx, y, tz, fx + Math.cos(angle + spread) * hub, y, fz + Math.sin(angle + spread) * hub, 0, 1, 0);
    sink.paint(dark);
    sink.tri(mx, y, mz, fx + Math.cos(angle - spread) * hub, y, fz + Math.sin(angle - spread) * hub, tx, y, tz, 0, 1, 0);
  };
  for (let k = 0; k < 4; k++) {
    const angle = Math.PI / 2 + (k * Math.PI) / 2;
    const north = k === 0;
    point(angle, rose, north ? P.crimson : shade(plaza, 1.22), north ? tone(P.crimson, 0.72) : shade(plaza, 0.72));
  }
  for (let k = 0; k < 4; k++) {
    point(Math.PI / 4 + (k * Math.PI) / 2, hub + (rose - hub) * 0.6, shade(plaza, 1.12), shade(plaza, 0.8));
  }
}

/** The fountain: a stone basin of still water, a pedestal and a bowl, and over it an armillary globe in gold rings. */
function fountain(sink: Sink, layout: GuildLayout): void {
  const [x, z] = local(layout, layout.fountain.x, layout.fountain.z);
  const r = layout.fountain.radius;
  const wall = 0.34;
  const high = 0.5 * M;
  const water = FOUNTAIN_WATER;
  sink.paint(C.stoneDark);
  sink.lathe(x, z, [[r + 0.12, 0], [r + 0.12, 0.25], [r, 0.25]], 20);
  sink.paint(C.stone);
  sink.lathe(x, z, [[r, 0.25], [r, high], [r + 0.08, high + 0.1], [r - wall, high + 0.1], [r - wall, high - 0.22]], 20);
  sink.paint(water);
  sink.disc(x, z, high - 0.22, r - wall, 20, 0);
  // The pedestal from the water, and its bowl.
  const bowl = 1.0 * M;
  sink.paint(C.stoneLight);
  sink.lathe(x, z, [[0.55, high - 0.22], [0.42, high + 0.3], [0.3, bowl - 0.1], [0.3, bowl]], 8);
  sink.paint(C.stone);
  sink.lathe(x, z, [[0.3, bowl], [r * 0.34, bowl + 0.12], [r * 0.38, bowl + 0.42], [r * 0.32, bowl + 0.42], [r * 0.32, bowl + 0.32]], 12);
  sink.paint(water);
  sink.disc(x, z, bowl + 0.32, r * 0.32, 12, 0);
  // The globe on a gold stem, and its three rings: a meridian, the equator and the ecliptic.
  sink.paint(C.gold);
  sink.post(x, z, 0.16, 0.16, bowl + 0.3, 0.6, 'd');
  const gr = 0.42 * M;
  const gy = bowl + 0.85;
  sink.paint(C.globe);
  sink.lump(x, gy, z, gr, gr * 2, 10);
  sink.paint(tone(P.green, 0.92));
  sink.lump(x + gr * 0.25, gy + gr * 1.2, z + gr * 0.3, gr * 0.42, gr * 0.6, 5);
  sink.lump(x - gr * 0.35, gy + gr * 0.55, z - gr * 0.3, gr * 0.38, gr * 0.5, 5);
  sink.paint(C.gold);
  const centre = new THREE.Matrix4().makeTranslation(x, gy + gr, z);
  for (const turn of [new THREE.Matrix4(), new THREE.Matrix4().makeRotationZ(Math.PI / 2), new THREE.Matrix4().makeRotationZ(Math.PI / 2).premultiply(new THREE.Matrix4().makeRotationX(0.41))]) {
    sink.place(new THREE.Matrix4().multiplyMatrices(centre, turn));
    sink.wheel(0, 0, 0, gr + 0.22, gr + 0.1, 14);
  }
  sink.place(new THREE.Matrix4());
}

/**
 * A pole at the front, flying the country's colours (`bands`, top to bottom)
 * or, with none, the guild's banner: crimson with the compass in gold.
 */
function flagPole(sink: Sink, layout: GuildLayout, pole: Spot, bands: readonly number[] | null): void {
  sink.place(placeAt(layout, pole));
  sink.paint(C.stoneDark);
  sink.box(-0.36, 0.36, 0, 0.42, -0.36, 0.36, 'd');
  sink.paint(tone(P.bark, 0.9));
  sink.lathe(0, 0, [[0.14, 0.42], [0.12, POLE_HEIGHT - 0.1], [0, POLE_HEIGHT - 0.1]], 6);
  sink.paint(C.gold);
  sink.lump(0, POLE_HEIGHT - 0.12, 0, 0.2, 0.42, 6);
  const w = 1.35 * M;
  const h = 0.86 * M;
  const top = POLE_HEIGHT - 0.4;
  const x0 = 0.14;
  if (bands !== null) {
    const step = h / bands.length;
    bands.forEach((colour, k) => {
      sink.paint(colour);
      const y1 = top - k * step;
      const y0 = y1 - step;
      sink.sheet([x0, y0, 0, x0 + w, y0, 0, x0 + w, y1, 0, x0, y1, 0], 0, 0, 1);
    });
  } else {
    sink.paint(C.banner);
    sink.sheet([x0, top - h, 0, x0 + w, top - h, 0, x0 + w, top, 0, x0, top, 0], 0, 0, 1);
    for (const facing of [1, -1] as const) compass(sink, x0 + w / 2, top - h / 2, facing * PROUD, h * 0.4, facing);
  }
  sink.place(new THREE.Matrix4());
}

/** Bunting in the country's colours: from each corner of the porch's roof to the pole on its side, and pole to pole. */
function bunting(sink: Sink, layout: GuildLayout, bands: readonly number[]): void {
  const { hall } = layout;
  const ax = Math.cos(hall.yaw);
  const az = -Math.sin(hall.yaw);
  const fx = Math.sin(hall.yaw);
  const fz = Math.cos(hall.yaw);
  const porchY = PORCH_HEIGHT + 0.85;
  const corner = (sign: number): THREE.Vector3 => {
    const x = hall.x + ax * sign * (hall.width / 2 - 0.2) + fx * (hall.porch + 0.1);
    const z = hall.z + az * sign * (hall.width / 2 - 0.2) + fz * (hall.porch + 0.1);
    const [lx, lz] = local(layout, x, z);
    return new THREE.Vector3(lx, porchY, lz);
  };
  const poleTop = (pole: Spot): THREE.Vector3 => {
    const [lx, lz] = local(layout, pole.x, pole.z);
    return new THREE.Vector3(lx, POLE_HEIGHT - 1.25 * M, lz);
  };
  const colours = bands.length >= 2 ? bands : [P.crimson, P.gold, P.white];
  const lines: [THREE.Vector3, THREE.Vector3][] = [];
  if (layout.flags.length === 2) {
    const [left, right] = layout.flags;
    // Which pole is on which side of the hall: by the hall's own across axis.
    const side = (pole: Spot): number => (pole.x - hall.x) * ax + (pole.z - hall.z) * az;
    const [a, b] = side(left!) < side(right!) ? [left!, right!] : [right!, left!];
    lines.push([corner(-1), poleTop(a)], [corner(1), poleTop(b)], [poleTop(a), poleTop(b)]);
  }
  for (const [from, to] of lines) pennants(sink, from, to, colours);
}

/** One string of pennants, sagging between two points. */
function pennants(sink: Sink, from: THREE.Vector3, to: THREE.Vector3, colours: readonly number[]): void {
  const length = from.distanceTo(to);
  const sag = Math.min(1.2, length * 0.05);
  const at = (t: number): THREE.Vector3 => from.clone().lerp(to, t).setY(from.y + (to.y - from.y) * t - sag * 4 * t * (1 - t));
  const pitch = 0.5 * M;
  const count = Math.max(2, Math.floor(length / pitch));
  sink.paint(tone(P.bark, 0.7));
  const segments = 8;
  for (let i = 0; i < segments; i++) {
    const a = at(i / segments);
    const b = at((i + 1) / segments);
    sink.bar(a.x, a.y, a.z, b.x, b.y, b.z, 0.05);
  }
  const along = to.clone().sub(from).setY(0).normalize();
  const nx = -along.z;
  const nz = along.x;
  const width = 0.36 * M;
  const drop = 0.5 * M;
  for (let k = 0; k < count; k++) {
    const t = (k + 0.5) / count;
    const a = at(t - width / 2 / length);
    const b = at(t + width / 2 / length);
    const m = at(t);
    sink.paint(colours[k % colours.length]!);
    sink.tri(a.x, a.y, a.z, b.x, b.y, b.z, m.x, m.y - drop, m.z, nx, 0, nz);
    sink.tri(a.x, a.y, a.z, m.x, m.y - drop, m.z, b.x, b.y, b.z, -nx, 0, -nz);
  }
}

/**
 * The jobs board: a cork face in a timber frame on two posts under a little
 * roof, papers pinned to it and a gold plate over it. Its face is `width` by
 * `height` at `lift`, `BOARD_DEPTH / 2 + PROUD` in front of its foot.
 */
function noticeboard(sink: Sink, board: BoardSpot, rng: ReturnType<typeof rngFrom>): void {
  const w = board.width / 2;
  const h = board.height / 2;
  const y = board.lift;
  const d = BOARD_DEPTH / 2;
  const frame = 0.14 * M;
  const wood = tone(P.brown, 0.7);
  sink.paint(tone(P.bark, 0.95));
  for (const sign of [-1, 1]) sink.post(sign * (w + frame * 0.5), 0, 0.18, 0.18, 0, y + h + frame + 0.5, 'd');
  sink.paint(wood);
  sink.box(-w - frame, w + frame, y - h - frame, y + h + frame, -d, d, '');
  sink.paint(tone(P.clay, 0.92));
  const face = d + PROUD;
  sink.quad([-w, y - h, face, w, y - h, face, w, y + h, face, -w, y + h, face], 0, 0, 1);
  // The papers, a few rows of them, each a slip of its own colour with a red pin.
  const slips = [P.white, P.cream, tone(P.sand, 1.08), P.blush];
  const paper = face + PROUD / 2;
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 3; col++) {
      if (!rng.chance(0.82)) continue;
      const cx = -w + ((col + 0.5) * 2 * w) / 3 + rng.jitter() * 0.12;
      const cy = y + h - ((row + 0.5) * 2 * h) / 2 + rng.jitter() * 0.1;
      const sw = rng.range(0.42, 0.56);
      const sh = rng.range(0.5, 0.7);
      sink.paint(rng.pick(slips));
      sink.quad([cx - sw / 2, cy - sh / 2, paper, cx + sw / 2, cy - sh / 2, paper, cx + sw / 2, cy + sh / 2, paper, cx - sw / 2, cy + sh / 2, paper], 0, 0, 1);
      sink.paint(P.red);
      sink.box(cx - 0.05, cx + 0.05, cy + sh / 2 - 0.14, cy + sh / 2 - 0.04, paper, paper + PROUD, 'b');
    }
  }
  // The plate, and the roof over all of it.
  sink.paint(C.gold);
  sink.box(-0.55, 0.55, y + h + frame + 0.05, y + h + frame + 0.4, -0.06, d + PROUD, '');
  const eave = y + h + frame + 0.5;
  const reach = d + 0.35;
  sink.paint(tone(P.crimson, 0.72));
  sink.sheet([-w - frame - 0.3, eave, reach, w + frame + 0.3, eave, reach, w + frame + 0.3, eave + 0.5, 0, -w - frame - 0.3, eave + 0.5, 0], 0, 1, 1);
  sink.sheet([w + frame + 0.3, eave, -reach, -w - frame - 0.3, eave, -reach, -w - frame - 0.3, eave + 0.5, 0, w + frame + 0.3, eave + 0.5, 0], 0, 1, -1);
}

/**
 * The Hall of Fame: a tall gold frame on a stone plinth, its face a cream
 * panel `BOARD_DEPTH / 2 + PROUD` in front of its foot, a crimson crest over
 * it carrying the compass.
 */
function fameBoard(sink: Sink, board: BoardSpot): void {
  const w = board.width / 2;
  const h = board.height / 2;
  const y = board.lift;
  const d = BOARD_DEPTH / 2;
  const frame = 0.12 * M;
  sink.paint(C.stoneDark);
  sink.box(-w - frame - 0.25, w + frame + 0.25, 0, y - h - frame, -d - 0.2, d + 0.2, 'd');
  sink.paint(C.gold);
  sink.box(-w - frame, w + frame, y - h - frame, y + h + frame, -d, d, '');
  sink.paint(P.cream);
  const face = d + PROUD;
  sink.quad([-w, y - h, face, w, y - h, face, w, y + h, face, -w, y + h, face], 0, 0, 1);
  const crest = y + h + frame;
  sink.paint(C.banner);
  sink.slab([[-w * 0.7, crest], [w * 0.7, crest], [w * 0.45, crest + 0.55 * M], [0, crest + 0.7 * M], [-w * 0.45, crest + 0.55 * M]], -d * 0.7, d * 0.7);
  compass(sink, 0, crest + 0.34 * M, d * 0.7 + PROUD, 0.3 * M);
}

/** A signpost at `base`: a post with three arrows pointing three ways, and a gold knob on top. */
function signpost(sink: Sink, base: THREE.Matrix4): void {
  sink.place(base);
  const top = 1.45 * M;
  sink.paint(tone(P.bark, 0.92));
  sink.post(0, 0, 0.2, 0.2, 0, top, 'd');
  sink.paint(C.gold);
  sink.lump(0, top, 0, 0.17, 0.3, 6);
  const arrows: [number, number, number][] = [[top - 0.35, 0.4, P.cream], [top - 0.75, 2.1, C.gold], [top - 1.15, -1.0, P.white]];
  for (const [y, yaw, colour] of arrows) {
    sink.place(new THREE.Matrix4().multiplyMatrices(base, new THREE.Matrix4().makeRotationY(yaw)));
    sink.paint(colour);
    sink.slab([[0.1, y - 0.16], [1.0, y - 0.16], [1.25, y], [1.0, y + 0.16], [0.1, y + 0.16]], -0.05, 0.05);
  }
  sink.place(base);
}

/** A map table at `base`: a timber table with a chart spread on it and a small globe at its corner. */
function mapTable(sink: Sink, base: THREE.Matrix4): void {
  sink.place(base);
  const hx = 0.72 * M;
  const hz = 0.42 * M;
  const top = 0.82 * M;
  const wood = tone(P.brown, 0.78);
  sink.paint(tone(P.brown, 0.6));
  for (const [x, z] of [[-hx + 0.15, -hz + 0.15], [hx - 0.15, -hz + 0.15], [hx - 0.15, hz - 0.15], [-hx + 0.15, hz - 0.15]] as const) sink.post(x, z, 0.16, 0.16, 0, top - 0.1, 'd');
  sink.paint(wood);
  sink.box(-hx, hx, top - 0.12, top, -hz, hz, '');
  const sheet = top + PROUD / 2;
  sink.paint(P.cream);
  sink.quad([-hx * 0.86, sheet, hz * 0.8, hx * 0.5, sheet, hz * 0.8, hx * 0.5, sheet, -hz * 0.8, -hx * 0.86, sheet, -hz * 0.8], 0, 1, 0);
  // The land on the chart, a step over it; and a route in red.
  const land = sheet + PROUD / 2;
  sink.paint(tone(P.green, 0.95));
  sink.quad([-hx * 0.7, land, hz * 0.55, -hx * 0.25, land, hz * 0.62, -hx * 0.2, land, -hz * 0.1, -hx * 0.62, land, -hz * 0.3], 0, 1, 0);
  sink.paint(tone(P.sand, 0.95));
  sink.quad([hx * 0.02, land, hz * 0.2, hx * 0.38, land, hz * 0.45, hx * 0.42, land, -hz * 0.55, hx * 0.08, land, -hz * 0.4], 0, 1, 0);
  sink.paint(P.red);
  sink.bar(-hx * 0.45, land + 0.02, hz * 0.1, hx * 0.2, land + 0.02, -hz * 0.05, 0.04);
  // The globe on its stand.
  sink.paint(C.gold);
  sink.post(hx * 0.72, 0, 0.1, 0.1, top, 0.22, 'd');
  sink.paint(C.globe);
  sink.lump(hx * 0.72, top + 0.2, 0, 0.26, 0.52, 8);
  sink.paint(C.gold);
  sink.place(new THREE.Matrix4().multiplyMatrices(base, new THREE.Matrix4().makeTranslation(hx * 0.72, top + 0.46, 0)));
  sink.wheel(0, 0, 0, 0.34, 0.29, 10);
  sink.place(base);
}

/** A round stone bed for one of the town's trees, a low hedge of shrubs round its trunk. */
function treeBed(sink: Sink, rng: ReturnType<typeof rngFrom>): void {
  const r = PLANTER_RADIUS;
  const high = 0.38 * M;
  sink.paint(C.stoneLight);
  sink.lathe(0, 0, [[r, 0], [r, high], [r - 0.18, high], [r - 0.18, high - 0.08]], 12);
  sink.paint(tone(P.bark, 0.85));
  sink.disc(0, 0, high - 0.08, r - 0.18, 12, 0);
  const leaf = rng.chance(0.5) ? P.green : tone(P.green, 0.82);
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + 0.4;
    sink.paint(k % 2 === 0 ? leaf : tone(P.green, 0.72));
    sink.lump(Math.cos(a) * r * 0.55, high - 0.1, Math.sin(a) * r * 0.55, r * 0.26, r * 0.42, 5);
  }
}
