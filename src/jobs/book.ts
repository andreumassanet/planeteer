/** The jobs' record as the passport's page reads it: the counts, the medals and each country's standing. Pure. */
import { STANDINGS, standingOf } from './score.ts';
import { reputationOf } from './store.ts';
import type { JobRecord } from './store.ts';

export function jobsForPassport(record: JobRecord, nameOf: (iso: string) => string) {
  const reputation = reputationOf(record);
  const countries = [...reputation.byCountry]
    .map(([iso, points]) => {
      const standing = standingOf(points);
      return { iso, name: nameOf(iso), points, standing: standing.name, rank: standing.rank };
    })
    .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
  return {
    done: record.done.size,
    byKind: reputation.byKind,
    medals: reputation.medals,
    countries,
    ranks: STANDINGS.length - 1,
  };
}
