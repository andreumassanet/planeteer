/** The credits page: who made it, and whose maps, models and sounds it is made of. */
import { h } from '../ui.ts';
import { link, out, section } from './widgets.ts';

export function createCreditsPage(): HTMLElement[] {
  return [
    section(
      'Made by',
      h(
        'div',
        { class: 'atlas-settings-links' },
        out('https://github.com/andreumassanet/planeteer', 'Source code'),
        out('https://github.com/andreumassanet', 'Andreu Massanet'),
        out('https://github.com/diegoMalagrida', 'Diego Malagrida'),
      ),
    ),
    // Who made what, as the LICENSE.txt files in `public/` credit them. GeoNames is CC BY 4.0
    // (name and licence); the CDS asks for the catalogue's credit; the rest is CC0.
    section(
      'Made with',
      h('dl', {
        class: 'atlas-settings-credit',
        html:
          `<dt>Map data</dt><dd>${link('https://www.naturalearthdata.com/', 'Natural Earth')}, ` +
          `${link('https://www.geonames.org/', 'GeoNames')} (${link('https://creativecommons.org/licenses/by/4.0/', 'CC&nbsp;BY&nbsp;4.0')})</dd>` +
          `<dt>Stars</dt><dd>${link('https://cdsarc.cds.unistra.fr/viz-bin/cat/V/50', 'Bright Star Catalogue')} ` +
          `(Hoffleit &amp; Warren 1991, NASA ADC), distributed by the ${link('https://cds.unistra.fr/', 'CDS')}, Strasbourg</dd>` +
          `<dt>Models</dt><dd>${link('https://quaternius.com', 'Quaternius')}, ${link('https://kenney.nl', 'Kenney')}, ` +
          `${link('https://www.kaylousberg.com', 'KayKit')}, CreativeTrio (CC0)</dd>` +
          `<dt>Sounds</dt><dd>${link('https://kenney.nl', 'Kenney')} (CC0)</dd>` +
          '<dt>The rest</dt><dd>Drawn and synthesised in code</dd>',
      }),
    ),
  ];
}
