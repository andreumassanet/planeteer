/** The monument bake's console report: what was snapped, spread, seated and walked out. */

interface Moved {
  id: string;
  km: number;
}

interface TownMove extends Moved {
  town: string;
}

export interface Report {
  placed: readonly { id: string; snappedKm?: number; clearance?: number }[];
  total: number;
  notes: readonly string[];
  spread: Moved[];
  parcelled: readonly TownMove[];
  walkedOut: TownMove[];
  leftIn: readonly string[];
  outsideReach: number;
  seated: Moved[];
}

export function printReport(r: Report): void {
  const { placed, notes, spread, parcelled, walkedOut, leftIn, seated } = r;
  console.log(`${placed.length} of ${r.total} monuments placed\n`);
  if (notes.length) {
    console.log('snapped to land, each into the country it declares:');
    for (const n of notes) console.log('  ' + n);
  }
  const far = placed.filter((p) => (p.snappedKm ?? 0) > 60);
  console.log(`\n${notes.length} needed snapping, ${far.length} moved more than 60 km`);

  if (spread.length > 0) {
    console.log(`\nspread apart so their footprints clear (${spread.length} monuments):`);
    for (const s of spread.sort((a, b) => b.km - a.km)) {
      console.log(`  ${s.id.padEnd(24)} ${s.km.toFixed(1)} km`);
    }
  }

  if (parcelled.length > 0) {
    console.log(`\nstood in a parcel of their town (${parcelled.length}):`);
    for (const s of parcelled) console.log(`  ${s.id.padEnd(24)} ${s.town.padEnd(20)} ${s.km.toFixed(1)} km`);
  }
  if (walkedOut.length > 0) {
    console.log(`\nwalked out of a town into the country beside it (${walkedOut.length}):`);
    for (const s of walkedOut.sort((a, b) => b.km - a.km)) console.log(`  ${s.id.padEnd(24)} ${s.town.padEnd(20)} ${s.km.toFixed(1)} km`);
  }
  if (leftIn.length > 0) console.log(`\nleft reaching a town, with no spot out of it within ${r.outsideReach} units: ${leftIn.join(', ')}`);

  if (seated.length > 0) {
    console.log(`\nmoved off the coast until the plan and its margin stand on one shelf (${seated.length}):`);
    for (const s of seated.sort((a, b) => b.km - a.km)) {
      console.log(`  ${s.id.padEnd(24)} ${s.km.toFixed(1)} km`);
    }
  }

  // Shore landmarks that overhang the water, and by how much. Never empty (a
  // bridge spans a strait), but it must not quietly grow.
  const overhanging = placed
    .filter((p) => (p.clearance ?? 0) < 0)
    .map((p) => ({ id: p.id, short: -(p.clearance ?? 0) }))
    .sort((a, b) => b.short - a.short);
  console.log(`\nshore landmarks standing over the water (${overhanging.length}), the water this far into the plan:`);
  for (const o of overhanging) console.log(`  ${o.id.padEnd(24)} ${o.short.toFixed(0)} units`);
}
