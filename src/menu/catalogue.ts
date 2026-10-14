/** A body's regions by key and its sites by region, grouped once per body. */
import type { Catalogue, MenuCtx } from './context.ts';
import type { MenuBody, MenuSite } from './types.ts';

export function catalogueOf(ctx: MenuCtx, of: MenuBody): Catalogue {
  const { catalogues } = ctx;
  let catalogue = catalogues.get(of.id);
  if (catalogue !== undefined) return catalogue;
  const indexByKey = new Map<string, number>();
  of.regions.forEach((one, i) => indexByKey.set(one.key, i + 1));
  const bySite = new Map<string, MenuSite[]>();
  for (const site of of.sites) {
    let list = bySite.get(site.key);
    if (list === undefined) bySite.set(site.key, (list = []));
    list.push(site);
  }
  for (const list of bySite.values()) list.sort((a, b) => b.weight - a.weight);
  catalogue = { regionIndexOf: indexByKey, sitesOf: bySite };
  catalogues.set(of.id, catalogue);
  return catalogue;
}

export function regionName(ctx: MenuCtx, key: string): string {
  return ctx.body.regions[(ctx.regionIndexOf.get(key) ?? 0) - 1]?.name ?? key;
}
