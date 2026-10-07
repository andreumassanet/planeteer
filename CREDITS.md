# Data and assets

The [MIT licence](LICENSE) covers the source code. The data and the models in
`public/` are derived from third-party sources and carry their own terms.

- **`public/data/countries.bin`, `public/data/lakes.bin`**: [Natural Earth](https://www.naturalearthdata.com),
  1:10m Admin 0 countries and 1:50m lakes. Public domain.
- **`public/data/places.bin`, `public/data/countries-info.json`**, and the roads
  derived from the places in `public/data/roads.bin`: [GeoNames](https://www.geonames.org),
  cities5000 and countryInfo, under [Creative Commons Attribution 4.0](https://creativecommons.org/licenses/by/4.0/).
  The credit is shown on the loading screen and on the settings card.
- **`public/data/stars.bin`**: the Bright Star Catalogue, 5th Revised Ed.
  (Hoffleit, D. & Warren Jr., W. H. 1991, Astronomical Data Center, NSSDC/ADC),
  as distributed by the CDS, Strasbourg, as [catalogue V/50](https://cdsarc.cds.unistra.fr/viz-bin/cat/V/50).
  No licence ships with it; the CDS distributes it for free use on condition
  that the authors and the CDS are acknowledged, which is done here, on the
  loading screen and on the settings card.
- **`public/models/*/`**: CC0 1.0 Universal kits by Kenney, Quaternius, Kay
  Lousberg and CreativeTrio, rebuilt by the bake scripts. Each directory's
  `LICENSE.txt` names the packs it was built from.
- **`public/audio/`**: CC0 1.0 Universal sounds from Kenney's Impact Sounds,
  Interface Sounds, Music Jingles and RPG Audio, re-encoded by
  `scripts/build-audio.mjs`; its `LICENSE.txt` names them.

`scripts/sources.json` records where each data source is downloaded from, its
licence, and the hash of the copy the bakes were last run against;
`scripts/fetch-sources.mjs` fetches and verifies them.
