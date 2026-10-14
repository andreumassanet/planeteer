// The wire format for the baked data files, written once and read once.
//
// The numbers are integers at the precision the bakes already round to,
// delta-coded where the sequence is ordered and left alone where it is not.
// Both halves of the format live here on purpose: a writer in `scripts/` and a
// reader in `src/` would be two definitions of one thing, so every bake
// round-trips its own output through these decoders and refuses to write if
// anything moved. The bake gzips and the client inflates (`inflate`), because no
// CDN compresses `application/octet-stream`. Nothing is lossy: a coordinate is
// the integer the bake's `toFixed` produced, divided back by the same power of
// ten, which is exact. The codecs live in `pack/`.

/**
 * Where the baked files are served from, for every loader that fetches one.
 * `BASE_URL` so a build served under a sub-path still finds its files; optional,
 * because Node has no `import.meta.env` and the bakes and checks call the same
 * loaders with `fetch` stubbed.
 */
export const DATA_URL = `${import.meta.env?.BASE_URL ?? '/'}data/`;

export { inflate } from './pack/bytes.ts';
export type { PackedCountry, PackedRing } from './pack/countries.ts';
export { decodeCountries, decodeLakes, encodeCountries, encodeLakes } from './pack/countries.ts';
export { decodePlaces, encodePlaces } from './pack/places.ts';
export type { RailData } from './pack/roads.ts';
export { decodeRails, decodeRoads, encodeRails, encodeRoads, packedBend, packedSpan } from './pack/roads.ts';
export type { StarCatalogue } from './pack/stars.ts';
export { decodeStars, encodeStars } from './pack/stars.ts';
