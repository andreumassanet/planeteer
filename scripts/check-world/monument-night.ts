/**
 * The landmarks at night (`landmark-lights.ts`): every model built and merged
 * as `placement.ts` raises it, its square and all, and its night baked beside
 * it, then held to the rules its look was tuned by, as bytes.
 */
import { at, check } from './harness.ts';
import type { PlacedMonument, WorldContext } from './context.ts';
import { readdirSync } from 'node:fs';
import { Color, Object3D, Vector3 } from 'three';
import { PLANET_RADIUS } from '../../src/globe.ts';
import { PALETTE } from '../../src/theme.ts';
import { createContext, paletteName } from '../../src/monuments/contract.ts';
import type { Monument } from '../../src/monuments/contract.ts';
import { mergeMeshes } from '../../src/merge.ts';
import type { MergePiece } from '../../src/merge.ts';
import { regionFor } from '../../src/scenery/regions.ts';
import { planShape } from '../../src/landmark-ground.ts';
import {
  FLOOD_CAP,
  FLOOD_CURVE_GLSL,
  FLOOD_FACING_GLSL,
  FLOOD_SPAN,
  FLOOD_STRENGTH,
  FLOOD_STYLES,
  FLOOD_TARGET,
  floodAt,
  floodTint,
  nightAt,
  setSunDirection,
} from '../../src/lights.ts';
import { BEACON_HEIGHT, DARK, DEFAULT_LOOK, GLOW_SHARE, LOOKS, bakeNight, createLandmarkLights, lookOf } from '../../src/landmark-lights.ts';
import { LAMP_OFFSET, buildSetting } from '../../src/landmark-setting.ts';
import { BLOOM_THRESHOLD } from '../../src/post.ts';
import { solarPosition, sunDirection } from '../../src/sun.ts';
import { TIME_SCALE } from '../time-scale.ts';
import { modelDir } from './monument-models.ts';

/**
 * The share of a floodlit landmark's surface that may be driven to the cap in
 * all three channels (white), and the mean luminance of its flood over that
 * surface past which it is a lantern rather than a lit building.
 */
const NIGHT_WHITE_SHARE = 0.01;
const NIGHT_LANTERN = 0.3;
/** Metres: the Burj Khalifa. Anything in the list taller is a mountain or a waterfall. */
const NIGHT_TALLEST_BUILT = 830;

/** A model built and merged the way `placement.ts` raises it, with the square it stands in. */
interface BakedLandmark {
  merged: ReturnType<typeof mergeMeshes>;
  pieces: MergePiece[];
  square: Object3D | null;
  height?: number;
}

export async function checkMonumentsAtNight(worldContext: WorldContext): Promise<void> {
  const { world, placed: monuments } = worldContext;
  console.log('\nmonuments at night');
  const ctx = createContext();
  const continentOf = new Map<string, string>(world.countries.map((country) => [country.iso, country.continent]));
  const registry = new Set<string>();
  const tableProblems: string[] = [];
  const floodProblems: string[] = [];
  const normalised: string[] = [];
  const lanterns: string[] = [];
  const glowProblems: string[] = [];
  const beaconProblems: string[] = [];
  const lampProblems: string[] = [];
  const tipsOf = new Map<string, number>();
  let lit = 0;
  let styled = 0;
  let dark = 0;
  let plazas = 0;
  let lampCount = 0;
  let twinError = 0;
  let eiffel: BakedLandmark | null = null;
  /** The first landmark with lamps round it in the country, for the lamps' handover below. */
  let litSample: (BakedLandmark & { id: string }) | null = null;
  const edge1 = new Vector3();
  const edge2 = new Vector3();
  const lum = (r: number, g: number, b: number): number => 0.2126 * r + 0.7152 * g + 0.0722 * b;
  for (const file of readdirSync(modelDir).sort()) {
    if (!file.endsWith('.ts') || file === 'contract.ts' || file === 'index.ts') continue;
    const module = (await import(`../../src/monuments/${file}`)) as Record<string, unknown>;
    const model = Object.values(module).find(
      (value): value is Monument => typeof (value as Monument | undefined)?.build === 'function' && typeof (value as Monument).id === 'string',
    );
    if (model === undefined) continue;
    registry.add(model.id);
    const placement = monuments.find((m) => m.id === model.id);
    if (placement === undefined) continue;
    const group = model.build(ctx);
    let square: Object3D | null = null;
    if (placement.setting === 'plaza') {
      const region = regionFor(placement.iso, continentOf.get(placement.iso) ?? '', placement.lat).id;
      square = buildSetting(ctx, placement, region);
      if (square !== null) group.add(square);
    }
    const pieces: MergePiece[] = [];
    const merged = mergeMeshes(group, pieces);
    const bake = bakeNight(model.id, placement.height, merged, pieces, square);
    if (model.id === 'eiffel-tower') eiffel = { merged, pieces: [...pieces], square, height: placement.height };
    if (square !== null && litSample === null) litSample = { id: model.id, merged, pieces: [...pieces], square, height: placement.height };
    const look = lookOf(model.id);
    if (look === null) dark++;
    else if (LOOKS[model.id] !== undefined) styled++;
    else lit++;
    const onSquare = new Set<Object3D>();
    square?.traverse((object) => onSquare.add(object));
    const floodLit = look !== null && look.strength > 0;
    const tint = floodTint(look?.tint ?? 0, new Color());
    const kByte = Math.round((bake.strength / FLOOD_SPAN) * 255);
    const styleByte = look === null ? 0 : FLOOD_STYLES.indexOf(look.style) * 85;
    const tintByte = look === null ? 0 : Math.round(((look.tint + 1) / 2) * 255);
    const from = look?.style === 'crown' ? look.from : 0;
    let wrong = '';
    const wrongFlood = (what: string): void => {
      wrong ||= what;
    };
    let area = 0;
    let white = 0;
    let shone = 0;
    const glowFound = new Set<string>();
    for (const piece of pieces) {
      const plaza = onSquare.has(piece.mesh);
      const stamp = piece.material.userData.atlasToon as number | undefined;
      const colour = stamp === undefined ? '' : paletteName(stamp).split('×')[0]!;
      const glow = plaza ? 0 : ((look?.glow as Record<string, number> | undefined)?.[colour] ?? 0);
      if (glow > 0) glowFound.add(colour);
      const lamp = plaza && typeof piece.mesh.userData.atlasLit === 'number' ? (piece.mesh.userData.atlasLit as number) : 0;
      const litWant = glow > 0 ? Math.round(glow * 255) : lamp > 0 ? Math.round(lamp * 255) : 0;
      for (let v = piece.first; v < piece.first + piece.count; v++) {
        const f = v * 4;
        const y = merged.position[v * 3 + 1]!;
        if (bake.lit[v * 2] !== litWant || bake.lit[v * 2 + 1] !== (litWant > 0 ? 255 : 0)) {
          wrong ||= `lit bytes ${bake.lit[v * 2]},${bake.lit[v * 2 + 1]} on ${plaza ? 'the square' : 'the model'}'s ${colour}, wanted ${litWant}`;
        }
        if (plaza || !floodLit) {
          if (bake.flood[f] !== 0 || bake.flood[f + 1] !== 0 || bake.flood[f + 2] !== 0 || bake.flood[f + 3] !== 0) wrongFlood(`${plaza ? 'its square' : 'a dark landmark'} carries flood bytes`);
          continue;
        }
        const h = Math.max(0, Math.min(1, (y / bake.top - from) / (1 - from)));
        if (Math.abs(bake.flood[f]! / 255 - h) > 0.5 / 255 + 1e-6) wrongFlood(`height byte ${bake.flood[f]} at y ${y.toFixed(2)} of ${bake.top.toFixed(1)}`);
        if (bake.flood[f + 1] !== kByte || kByte === 0) wrongFlood(`strength byte ${bake.flood[f + 1]}, wanted ${kByte}`);
        if (bake.flood[f + 2] !== styleByte || bake.flood[f + 3] !== tintByte) wrongFlood(`style ${bake.flood[f + 2]} tint ${bake.flood[f + 3]}`);
        // The twin read off the bytes against the twin at the true numbers:
        // what a byte's rounding costs, across every lit vertex on Earth.
        const up = merged.normal[v * 3 + 1]!;
        const style = bake.flood[f + 2]! / 85;
        const exact = floodAt(h, style, up, bake.strength);
        const read = floodAt(bake.flood[f]! / 255, style, up, (bake.flood[f + 1]! / 255) * FLOOD_SPAN);
        twinError = Math.max(twinError, Math.abs(read - exact) / bake.strength);
      }
      if (plaza || !floodLit) continue;
      // Per triangle, at its middle: how much of the surface the flood drives
      // to the cap in all three channels, and how bright it is on average.
      for (let v = piece.first; v + 2 < piece.first + piece.count; v += 3) {
        const i = v * 3;
        edge1.set(merged.position[i + 3]! - merged.position[i]!, merged.position[i + 4]! - merged.position[i + 1]!, merged.position[i + 5]! - merged.position[i + 2]!);
        edge2.set(merged.position[i + 6]! - merged.position[i]!, merged.position[i + 7]! - merged.position[i + 1]!, merged.position[i + 8]! - merged.position[i + 2]!);
        const a = edge1.cross(edge2).length() / 2;
        const y = (merged.position[i + 1]! + merged.position[i + 4]! + merged.position[i + 7]!) / 3;
        const h = Math.max(0, Math.min(1, (y / bake.top - from) / (1 - from)));
        const x = floodAt(h, FLOOD_STYLES.indexOf(look.style), merged.normal[i + 1]!, bake.strength);
        const r = Math.min(FLOOD_CAP, merged.color[i]! * tint.r * x);
        const g = Math.min(FLOOD_CAP, merged.color[i + 1]! * tint.g * x);
        const b = Math.min(FLOOD_CAP, merged.color[i + 2]! * tint.b * x);
        area += a;
        shone += a * lum(r, g, b);
        if (Math.min(r, g, b) >= FLOOD_CAP) white += a;
      }
    }
    if (wrong !== '') floodProblems.push(`${model.id}: ${wrong}`);
    if (floodLit) {
      const unclamped = FLOOD_TARGET / bake.albedo;
      const k = bake.strength / look.strength;
      if (unclamped < FLOOD_STRENGTH[0] || unclamped > FLOOD_STRENGTH[1] || Math.abs(bake.albedo * k - FLOOD_TARGET) > 0.05) {
        normalised.push(`${model.id} ${(bake.albedo * k).toFixed(3)} (albedo ${bake.albedo.toFixed(3)}, strength ${k.toFixed(2)})`);
      }
      if (area > 0 && (white / area > NIGHT_WHITE_SHARE || shone / area > NIGHT_LANTERN)) {
        lanterns.push(`${model.id} ${((100 * white) / area).toFixed(1)}% white, mean ${(shone / area).toFixed(3)}`);
      }
    }
    for (const colour of Object.keys(look?.glow ?? {})) if (!glowFound.has(colour)) glowProblems.push(`${model.id}'s ${colour} is no part of it`);
    if (bake.glowShare > GLOW_SHARE) glowProblems.push(`${model.id} ${((100 * bake.glowShare)).toFixed(1)}% of its surface shines`);
    // The red lights: on a lit tower of `BEACON_HEIGHT` or more, at its top.
    const tall = (placement.height ?? 0) >= BEACON_HEIGHT && look !== null && look.beacon !== false;
    const tips = bake.tips.length / 3;
    tipsOf.set(model.id, tips);
    if (tall !== (tips > 0) || tips > 4) beaconProblems.push(`${model.id} ${placement.height ?? '-'} m has ${tips} red lights`);
    for (let t = 0; t < bake.tips.length; t += 3) {
      const y = bake.tips[t + 1]!;
      if (y < bake.top || y > bake.top + 1.2) beaconProblems.push(`${model.id}'s light hangs at ${y.toFixed(1)} over a top of ${bake.top.toFixed(1)}`);
    }
    // The lamps round it: at least one, lit, a stride off the plan and at a lamp's height.
    if (square !== null) {
      plazas++;
      const lamps = bake.lamps.length / 3;
      lampCount += lamps;
      if (lamps === 0) lampProblems.push(`${model.id}'s square has no lit lamp`);
      const plan = planShape(placement);
      for (let l = 0; l < bake.lamps.length; l += 3) {
        const [x, y, z] = [bake.lamps[l]!, bake.lamps[l + 1]!, bake.lamps[l + 2]!];
        const onRing = Math.abs(x - plan.cx) <= plan.hx + LAMP_OFFSET + 0.5 && Math.abs(z - plan.cz) <= plan.hz + LAMP_OFFSET + 0.5;
        if (!onRing || y < 4 || y > 7) lampProblems.push(`${model.id} lamp at (${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)})`);
      }
    }
  }
  for (const id of [...DARK, ...Object.keys(LOOKS)]) if (!registry.has(id)) tableProblems.push(`${id} is not a landmark`);
  for (const id of DARK) if (LOOKS[id] !== undefined) tableProblems.push(`${id} is both dark and styled`);
  for (const [id, own] of Object.entries(LOOKS)) {
    const look = { ...DEFAULT_LOOK, ...own };
    if (!(look.tint >= -1 && look.tint <= 1) || !(look.strength >= 0) || !(look.from >= 0 && look.from < 1)) tableProblems.push(`${id} has a look out of range`);
    for (const [colour, gain] of Object.entries(look.glow)) {
      if (!(colour in PALETTE) || !(gain! > 0 && gain! <= 1)) tableProblems.push(`${id} glows ${colour} at ${gain}`);
    }
  }
  for (const m of monuments) {
    if ((m.height ?? 0) > NIGHT_TALLEST_BUILT && lookOf(m.id) !== null) tableProblems.push(`${m.id} is ${m.height} m and lit`);
  }
  check(
    tableProblems.length === 0,
    'the night\'s table names real landmarks, none twice, and lights no mountain',
    tableProblems.length > 0 ? tableProblems.slice(0, 4).join('; ') : `${lit} on the default flood, ${styled} styled, ${dark} dark`,
  );
  check(
    floodProblems.length === 0 && lit + styled > 0,
    'every lit landmark carries its flood and its lit parts, and its square no flood',
    floodProblems.length > 0 ? floodProblems.slice(0, 3).join('; ') : '',
  );
  check(
    normalised.length === 0,
    `every floodlit surface averages ${FLOOD_TARGET} under its own light, inside the strength's bounds`,
    normalised.slice(0, 4).join('; '),
  );
  check(
    FLOOD_CAP < BLOOM_THRESHOLD && lanterns.length === 0,
    'no floodlit surface blooms, is a white tile, or makes its landmark a lantern',
    lanterns.length > 0 ? lanterns.slice(0, 4).join('; ') : `cap ${FLOOD_CAP} under the bloom's ${BLOOM_THRESHOLD}`,
  );
  check(glowProblems.length === 0, `the lit parts are the parts named, and under ${GLOW_SHARE * 100}% of a landmark`, glowProblems.slice(0, 4).join('; '));
  const towers = [...tipsOf].filter(([, n]) => n > 0);
  check(
    beaconProblems.length === 0 && towers.length > 0 && (tipsOf.get('petronas-towers') ?? 2) === 2 && (tipsOf.get('golden-gate-bridge') ?? 4) === 4,
    `red lights on the ${towers.length} lit towers of ${BEACON_HEIGHT} m and over, at their tops, and on nothing else`,
    beaconProblems.length > 0 ? beaconProblems.slice(0, 4).join('; ') : towers.map(([id, n]) => (n > 1 ? `${id} ${n}` : id)).join(', '),
  );
  check(lampProblems.length === 0 && plazas > 0, 'every landmark in the country with a square has lit lamps round it', lampProblems.length > 0 ? lampProblems.slice(0, 4).join('; ') : `${lampCount} lamps round ${plazas} squares`);

  checkShaderTwin(twinError);

  // The terminator the flood shares with every window, at the Eiffel Tower's
  // feet: nothing at noon, everything at midnight (both UTC, near enough the
  // meridian at 2.3 degrees east).
  const eiffelSite = monuments.find((m) => m.id === 'eiffel-tower');
  if (eiffelSite !== undefined) {
    checkNightClock(eiffelSite, eiffel, litSample, monuments);
  }
}

function checkShaderTwin(twinError: number): void {
  // The twin against the shader's own text, which is the same string the
  // fragment shader compiles, evaluated here as JavaScript.
  const smoothstep = (a: number, b: number, x: number): number => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  const clamp = (x: number, a: number, b: number): number => Math.min(b, Math.max(a, x));
  const curve = new Function('h', 's', 'smoothstep', 'clamp', `return ${FLOOD_CURVE_GLSL};`) as unknown as (h: number, s: number, ss: typeof smoothstep, c: typeof clamp) => number;
  const facing = new Function('up', 'smoothstep', 'clamp', `return ${FLOOD_FACING_GLSL};`) as unknown as (up: number, ss: typeof smoothstep, c: typeof clamp) => number;
  let shaderError = 0;
  for (let s = 0; s < FLOOD_STYLES.length; s++) {
    for (let h = 0; h <= 1.0001; h += 0.025) {
      for (let up = -1; up <= 1.0001; up += 0.05) {
        shaderError = Math.max(shaderError, Math.abs(curve(h, s, smoothstep, clamp) * facing(up, smoothstep, clamp) * 1.7 - floodAt(h, s, up, 1.7)));
      }
    }
  }
  check(
    shaderError < 1e-9 && twinError < 0.02,
    'the CPU twin is the shader\'s own curve, and the bytes carry it to 2% of a landmark\'s strength',
    `shader ${shaderError.toExponential(1)}, bytes ${(100 * twinError).toFixed(2)}% at worst`,
  );
}

function checkNightClock(eiffelSite: PlacedMonument, eiffel: BakedLandmark | null, litSample: (BakedLandmark & { id: string }) | null, monuments: PlacedMonument[]): void {
  const sun = new Vector3();
  const up = at(eiffelSite.lat, eiffelSite.lon).normalize();
  const gate = (when: string): number => {
    const date = new Date(when);
    setSunDirection(sunDirection(date, sun), solarPosition(date).subsolarLon);
    return nightAt(up);
  };
  const noon = gate('2026-10-04T12:00:00Z');
  const midnight = gate('2026-10-04T00:00:00Z');
  // And the sparkle's civil clock: 22:02 in Paris is inside the five
  // minutes, 22:30 is not, and 14:02 is daylight. Stood with a stand-in
  // model where the bake says, under each instant's own sun.
  const standing = createLandmarkLights();
  let sparkles = '';
  // And whether the red lights are drawn at all, which they are not by day.
  let shown = '';
  if (eiffel !== null) {
    const bake = bakeNight('eiffel-tower', eiffel.height, eiffel.merged, eiffel.pieces, eiffel.square);
    const stand = new Object3D();
    stand.position.copy(up).multiplyScalar(PLANET_RADIUS);
    standing.stand('eiffel-tower', eiffelSite, stand, bake);
    for (const when of ['2026-10-04T20:02:00Z', '2026-10-04T20:30:00Z', '2026-10-04T12:02:00Z']) {
      gate(when);
      standing.update(new Date(when));
      sparkles += standing.stats.sparkling ? '1' : '0';
      shown += standing.beacons.visible ? '1' : '0';
    }
  }
  check(
    noon === 0 && midnight > 0.99 && sparkles === '100' && shown === '110',
    'the flood is off at noon and on at midnight, the Eiffel sparkles on Paris\'s hour, and its red light is drawn only after dark',
    `night ${noon.toFixed(2)} at noon, ${midnight.toFixed(2)} at midnight; sparkle at 22:02, 22:30 and 14:02 ${sparkles}, red light ${shown}`,
  );

  // A landmark's lamps handed over as the near lamps want them: within
  // reach, nearest first, after the ones already in the list. The Eiffel
  // Tower stands in a parcel of Paris, whose lamps are the town's, so the
  // first landmark with lamps of its own stands in for it.
  const litSite = litSample === null ? undefined : monuments.find((m) => m.id === litSample!.id);
  if (litSample !== null && litSite !== undefined) {
    const litUp = at(litSite.lat, litSite.lon).normalize();
    const lamps = createLandmarkLights();
    const stand = new Object3D();
    stand.position.copy(litUp).multiplyScalar(PLANET_RADIUS);
    lamps.stand(litSample.id, litSite, stand, bakeNight(litSample.id, litSample.height, litSample.merged, litSample.pieces, litSample.square));
    const out = new Float32Array(24 * 4);
    out.set([0, 0, 0, 0.5]);
    const viewer = new Vector3().copy(litUp).multiplyScalar(PLANET_RADIUS + 3);
    const count = lamps.lampsNear(viewer, 170, out, 1);
    let sorted = count > 1;
    for (let i = 1; i < count; i++) if (out[i * 4 + 3]! < out[(i - 1) * 4 + 3]! || out[i * 4 + 3]! > 170) sorted = false;
    check(sorted, 'a landmark\'s lamps join the near lamps, sorted, after the town\'s', `${count - 1} of the ${litSample.id}'s handed over`);
  } else check(false, 'a landmark\'s lamps join the near lamps, sorted, after the town\'s', 'no landmark in the country has lamps');

  if (eiffel !== null) {
    const times: number[] = [];
    for (let run = 0; run < 7; run++) {
      const began = performance.now();
      bakeNight('eiffel-tower', eiffel.height, eiffel.merged, eiffel.pieces, eiffel.square);
      times.push(performance.now() - began);
    }
    times.sort((a, b) => a - b);
    check(times[3]! < 2 * TIME_SCALE, `the Eiffel Tower's night bakes under ${2 * TIME_SCALE} ms`, `${times[3]!.toFixed(2)} ms, ${eiffel.merged.position.length / 3} vertices`);
  }
}
