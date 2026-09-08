/**
 * The flag contact sheet: every country in `countries.bin`, drawn.
 *
 * A grid is the only sane way to review 234 hand-written specs. A flag that is
 * wrong is obvious next to its neighbours and invisible on its own, which is
 * the same argument the monument contact sheet makes.
 *
 * Not part of the game. `pnpm dev` serves `/sheets/flags.html` without any
 * config; it is a review tool, not a page anyone ships, and like every sheet in
 * this directory it is deliberately absent from `vite.config.ts`'s `input`.
 */
import { loadCountries, type Country } from '../geo.ts';
import { CONTINENT_COLORS, DEFAULT_LAND } from '../theme.ts';
import { createFlagCanvas, drawFlag, hasFlag, isSimplified } from '../flags.ts';

const WIDTH = 150;
const HEIGHT = 100;

const css = (color: number): string => `#${color.toString(16).padStart(6, '0')}`;

async function main(): Promise<void> {
  const countries: Country[] = await loadCountries();

  const grid = document.getElementById('grid')!;
  let faithful = 0;
  let simplified = 0;
  let missing = 0;

  for (const country of countries) {
    const tint = css(CONTINENT_COLORS[country.continent] ?? DEFAULT_LAND);
    const canvas = createFlagCanvas(country.iso, WIDTH, HEIGHT, { tint });

    const figure = document.createElement('figure');
    figure.appendChild(canvas);

    const caption = document.createElement('figcaption');
    caption.textContent = country.name;
    const code = document.createElement('em');
    code.textContent = `${country.iso} · ${country.continent}`;
    caption.appendChild(code);

    if (!hasFlag(country.iso)) {
      missing++;
      caption.insertAdjacentHTML('beforeend', '<span class="tag none">no flag</span>');
    } else if (isSimplified(country.iso)) {
      simplified++;
      caption.insertAdjacentHTML('beforeend', '<span class="tag simplified">arms simplified</span>');
    } else {
      faithful++;
    }

    figure.appendChild(caption);
    grid.appendChild(figure);
  }

  document.getElementById('summary')!.innerHTML =
    `<h1>flag contact sheet</h1>` +
    `<b>${countries.length} countries</b>` +
    `<span>${faithful} drawn in full</span>` +
    `<span>${simplified} with the arms reduced to a mark</span>` +
    `<span>${missing} on the fallback plate</span>`;

  // For looking at one flag properly: `flags.show('NPL', 'KIR')` swaps the
  // sheet for a handful drawn large. Same idea as `window.atlas` in `main.ts`.
  Object.assign(globalThis, {
    flags: {
      drawFlag,
      show(...keys: string[]) {
        grid.replaceChildren(...keys.map((key) => {
          const figure = document.createElement('figure');
          figure.appendChild(createFlagCanvas(key, 600, 400));
          figure.insertAdjacentHTML('beforeend', `<figcaption>${key}</figcaption>`);
          return figure;
        }));
      },
    },
  });

  // Reviewing 234 cells means editing a spec and looking again, and a Vite
  // reload otherwise throws you back to Afghanistan every time.
  const at = sessionStorage.getItem('flags-scroll');
  if (at) scrollTo(0, Number(at));
  addEventListener('scroll', () => sessionStorage.setItem('flags-scroll', String(scrollY)), { passive: true });
}

main().catch((error: unknown) => {
  document.getElementById('summary')!.textContent = `Error: ${String(error)}`;
});
