/**
 * What hangs over a town's streets: bunting, lanterns, garlands, cut paper,
 * washing, shade sails, festoon bulbs, a banner, and the poles and wires of a
 * street's services.
 *
 * Everything hangs between two things that stand. A span's ends are found by
 * a horizontal ray from the street's line out to each side against the
 * triangles of the buildings (`OverheadHost`); a span is drawn only where both
 * rays meet a building within reach and the line between them passes through
 * no building box. Poles bring their own ends: a line of service poles on a
 * street's edge, or a pair of masts across a main street too low to string
 * from its walls.
 *
 * It hangs over what drives under it: the lowest point of a span clears the
 * floor by `OVERHEAD_CLEAR` over a main street, `SIDE_CLEAR` over any other,
 * and the height of any vehicle parked under it. Nothing here is a wall.
 *
 * Built into a near town's buffer, in the town's own frame, as one run of
 * vertices with vertex colours. Deterministic from the town's seed.
 */
import { useCrowns, streetsOf } from './overhead/anchors.ts';
import type { Overhead, OverheadSite } from './overhead/anchors.ts';
import { PROFILES } from './overhead/config.ts';
import { Out, prepare } from './overhead/geometry.ts';
import { createHanger } from './overhead/hanger.ts';
import { stringStreets } from './overhead/strings.ts';
import { POLE_WIDTH } from '../roadside.ts';
import { raisePoles } from './overhead/wires.ts';

export { OVERHEAD_CLEAR, SIDE_CLEAR } from './overhead/config.ts';
export type { Hang } from './overhead/config.ts';
export type { Overhead, OverheadSite } from './overhead/anchors.ts';
export type { OverheadHost } from './overhead/geometry.ts';

/** The overhead of one near town, in its own frame, or null for none. */
export function hangOverhead(site: OverheadSite): Overhead | null {
  const profile = PROFILES[site.region];
  if (profile === undefined || site.grid.cells < 2 || site.hosts.length < 2) return null;
  const hosts = site.hosts.map(prepare);
  useCrowns(site.crowns);
  const out = new Out();
  const h = createHanger(site, profile, hosts, out, streetsOf(site.grid, site.band));

  stringStreets(h);
  raisePoles(h);

  const triangles = out.triangles;
  if (triangles === 0) return null;
  let emits = false;
  const glow = Uint8Array.from(out.glow);
  for (let i = 0; i < glow.length; i += 2) {
    if (glow[i]! > 0) {
      emits = true;
      break;
    }
  }
  return {
    position: Float32Array.from(out.position),
    normal: Float32Array.from(out.normal),
    color: Float32Array.from(out.color),
    glow,
    triangles,
    emits,
    spans: h.spans,
    poles: h.poles,
    masts: h.masts,
    wires: h.wires,
    cells: h.cells,
    spots: h.taken.flatMap(([x, z]) => [x, z, POLE_WIDTH * 0.5 + 0.5]),
  };
}
