import { at, check, here } from './harness.ts';
import type { WorldContext } from './context.ts';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Vector3 } from 'three';
import ts from 'typescript';
import { toLatLon } from '../../src/geo.ts';
import { PLANET_RADIUS, onSphere } from '../../src/globe.ts';
import { bearingTo, toUnit } from '../../src/cartography.ts';
import { latOf, lonOf, unitAt } from '../../src/sphere.ts';

/**
 * The planet is right-handed, like the Earth.
 *
 * `z = -cos(lat)sin(lon)`: with `+sin(lon)` the globe is a mirror image that
 * is self-consistent, so every lookup agrees and only the view from the air
 * is wrong. The witness must therefore be independent of `src/`: the
 * textbook `at()` in `harness.ts`, and facts about the Earth.
 *
 * - The basis: `onSphere` (the land mesh), `toUnit` (the maps) and
 *   `unitAt` agree with `at()`, and east crosses north into up.
 * - The way back: `toLatLon`, `latOf` and `lonOf` return the coordinate
 *   `at()` was given, and Lisbon is in Portugal.
 * - Standing in Madrid facing north, `bearingTo` puts Barcelona on the
 *   right and Lisbon on the left.
 */
export function checkHandedness(ctx: WorldContext): void {
  const { world } = ctx;
  const onSrc = (lat: number, lon: number): Vector3 => onSphere(lon, lat, new Vector3());
  const unit = new Float32Array(3);
  const wrong: string[] = [];
  for (const [lat, lon] of [[0, 0], [40, -3], [-33, 151], [60, 120], [-20, -60], [71, -156]] as [number, number][]) {
    const up = onSrc(lat, lon);
    const east = onSrc(lat, lon + 0.01).sub(up).normalize();
    const north = onSrc(lat + 0.01, lon).sub(up).normalize();
    if (east.cross(north).dot(up) < 0.99) wrong.push(`onSphere is left-handed at ${lat},${lon}`);
    const textbook = at(lat, lon).divideScalar(PLANET_RADIUS);
    if (up.distanceTo(textbook) > 1e-9) wrong.push(`onSphere disagrees with the textbook at ${lat},${lon}`);
    toUnit(lat, lon, unit);
    if (Math.hypot(unit[0]! - textbook.x, unit[1]! - textbook.y, unit[2]! - textbook.z) > 1e-6) {
      wrong.push(`toUnit disagrees with the textbook at ${lat},${lon}`);
    }
    if (unitAt(lat, lon, new Vector3()).distanceTo(textbook) > 1e-9) {
      wrong.push(`unitAt disagrees with the textbook at ${lat},${lon}`);
    }
    const back = toLatLon(at(lat, lon));
    if (Math.abs(back.lat - lat) > 1e-9 || Math.abs(back.lon - lon) > 1e-9) {
      wrong.push(`toLatLon reads ${lat},${lon} back as ${back.lat.toFixed(2)},${back.lon.toFixed(2)}`);
    }
    const unitLat = latOf(textbook.y);
    const unitLon = lonOf(textbook.x, textbook.z);
    if (Math.abs(unitLat - lat) > 1e-9 || Math.abs(unitLon - lon) > 1e-9) {
      wrong.push(`latOf and lonOf read ${lat},${lon} back as ${unitLat.toFixed(2)},${unitLon.toFixed(2)}`);
    }
  }
  const madrid = at(40.42, -3.7);
  const north = at(40.52, -3.7).sub(madrid);
  const barcelona = bearingTo(madrid, north, 41.39, 2.17);
  const lisbon = bearingTo(madrid, north, 38.72, -9.14);
  if (!(barcelona !== null && barcelona > 0)) wrong.push('Barcelona is not to the right of Madrid facing north');
  if (!(lisbon !== null && lisbon < 0)) wrong.push('Lisbon is not to the left of Madrid facing north');
  const lisbonIn = world.countryAtPoint(at(38.72, -9.14));
  if (lisbonIn === 0 || world.countries[lisbonIn - 1]!.name !== 'Portugal') wrong.push('Lisbon is not in Portugal');
  check(wrong.length === 0, 'the planet is right-handed, like the Earth', wrong.slice(0, 4).join('; '));
}

/**
 * Nothing in `src/` but `sphere.ts` converts lat/lon by hand.
 *
 * Each file is read with string, template and regex literals blanked (that
 * is where the GLSL lives) and comments stripped, and two shapes fail:
 *
 * - a longitude: `Math.atan2(…)` taken to degrees with an argument negated
 *   or a `z` in it (`atan2(-z, x)` or the mirror's `atan2(z, x)`);
 * - a component: anything times `Math.sin`/`Math.cos` of something named
 *   for a longitude.
 *
 * It is a net, not a proof. The scripts are not read (their textbook
 * witnesses are written out on purpose), and the GLSL is checked by eye:
 * `lights.ts`'s `atlasSolarHour` reads a longitude as `atan(-upDir.z, upDir.x)`.
 */
export function checkNoHandConversions(): void {
  const DEGREES = String.raw`\s*(?:\/\s*(?:DEG|D2R|RAD)\b|\*\s*(?:R2D\b|\(?\s*180\s*\/\s*Math\.PI))`;
  const LONGITUDE = new RegExp(String.raw`Math\.atan2\(([^()]*)\)` + DEGREES, 'g');
  const TELLS = /(?:^|,)\s*-|\b\w*z\b/;
  const OF_LONGITUDE = String.raw`Math\.(?:sin|cos)\([^()]*(?:(?<![A-Za-z])lon|Lon\b)[^()]*\)`;
  const FACTOR = String.raw`(?:Math\.cos\([^()]*\)|(?<![\w$])[A-Za-z_$][\w$]*(?:\[[^\]]*\])?!?)`;
  const COMPONENT = new RegExp(String.raw`${FACTOR}\s*\*\s*${OF_LONGITUDE}|${OF_LONGITUDE}\s*\*\s*${FACTOR}`, 'g');
  const blank = (text: string): string => text.replace(/[^\n]/g, ' ');
  const blankLiterals = (file: string, text: string): string => {
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
    const chars = text.split('');
    const visit = (node: ts.Node): void => {
      if (ts.isStringLiteralLike(node) || ts.isTemplateLiteralToken(node) || ts.isRegularExpressionLiteral(node)) {
        for (let i = node.getStart(source); i < node.end; i++) if (chars[i] !== '\n') chars[i] = ' ';
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
    return chars.join('');
  };
  const byHand: string[] = [];
  const src = resolve(here, '../src');
  const files = (readdirSync(src, { recursive: true }) as string[])
    .filter((file) => file.endsWith('.ts') && file !== 'sphere.ts')
    .sort();
  for (const file of files) {
    // Strip comments only after blanking literals: a literal such as
    // `'./parts/*.ts'` would otherwise open a comment.
    const code = blankLiterals(file, readFileSync(resolve(src, file), 'utf8'))
      .replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, blank);
    const lineOf = (index: number): number => code.slice(0, index).split('\n').length;
    for (const match of code.matchAll(LONGITUDE)) {
      if (TELLS.test(match[1]!)) byHand.push(`src/${file}:${lineOf(match.index)} a longitude`);
    }
    for (const match of code.matchAll(COMPONENT)) byHand.push(`src/${file}:${lineOf(match.index)} a component`);
  }
  check(
    byHand.length === 0,
    `no lat/lon conversion written out by hand in src/ (${files.length} files read; use sphere.ts)`,
    byHand.slice(0, 6).join('; '),
  );
}
