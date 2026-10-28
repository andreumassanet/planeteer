/**
 * The rings' HUD, mounted in the HUD's root so `H` hides it with the rest:
 *
 * - the course card, top centre: the course's name, a pip a ring (taken,
 *   taken through the middle, missed, next, to come), the clock and the best;
 * - the reticle: a gold circle over the next ring with how far it is, or an
 *   arrow on the screen's edge pointing round to it;
 * - the callout: a word in big inked letters for a moment (a perfect pass, a
 *   miss, a course found, a landmark's ring);
 * - the result: the medal, the time and the rings, when a course is flown.
 */
/** How a ring of a course stands, as the card draws its pip. */
export type Pip = 'perfect' | 'hit' | 'missed' | 'next' | 'todo';

export interface CourseView {
  title: string;
  pips: readonly Pip[];
  /** The clock, `m:ss.s`, or '' before the first ring. */
  clock: string;
  /** The best time and medal here, or null for none yet. */
  best: { time: string; medal: number } | null;
}

export interface CourseResult {
  title: string;
  time: string;
  /** 3 gold, 2 silver, 1 bronze, 0 none. */
  medal: number;
  rings: number;
  of: number;
  perfect: number;
  /** The time it beat, or null when it is the first or did not beat it. */
  beat: string | null;
  fresh: boolean;
}

export type CalloutTone = 'gold' | 'good' | 'miss' | 'info';

export interface RingPanel {
  readonly element: HTMLElement;
  /** Each frame: the course under way or offered, or null to put the card away. */
  course(view: CourseView | null): void;
  /** Each frame: the next ring on screen (inside) or the edge point and the way round to it; null hides it. */
  track(at: { x: number; y: number; inside: boolean; angle: number; distance: string } | null): void;
  callout(text: string, sub?: string, tone?: CalloutTone, seconds?: number): void;
  result(result: CourseResult): void;
}

/** Metal colours of the medals, by rank. */
export const MEDAL_COLOURS = ['#b5aca4', '#c98a4b', '#cfd6de', 'var(--ui-gold)'] as const;
export const MEDAL_NAMES = ['No', 'Bronze', 'Silver', 'Gold'] as const;

const STYLE = `
.atlas-course {
  position: absolute;
  left: 50%;
  top: var(--hud-top);
  min-width: 232px;
  padding: 8px 16px 9px;
  text-align: center;
  opacity: 0;
  transform: translate(-50%, -14px) scale(0.96);
  transition: opacity 0.22s ease, transform 0.35s var(--ui-spring);
}
.atlas-course.on { opacity: 1; transform: translate(-50%, 0) scale(1); }
.atlas-course-title {
  font-size: 11.5px;
  font-weight: 900;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  opacity: 0.6;
}
.atlas-course-pips { display: flex; justify-content: center; gap: 7px; margin: 7px 0 5px; }
.atlas-pip {
  width: 15px;
  height: 15px;
  border-radius: 50%;
  border: 3px solid var(--ui-ink);
  background: var(--ui-paper);
  box-sizing: border-box;
  transition: background 0.2s ease, transform 0.35s var(--ui-spring);
}
.atlas-pip.hit, .atlas-pip.perfect { background: var(--ui-gold); transform: scale(1.12); }
.atlas-pip.perfect { box-shadow: 0 0 0 3px rgba(242, 193, 78, 0.45); }
.atlas-pip.missed { background: var(--ui-crimson); transform: scale(0.82); }
.atlas-pip.next { border-color: var(--ui-gold); animation: atlas-pip-next 0.9s ease-in-out infinite; }
@keyframes atlas-pip-next { 50% { transform: scale(1.3); } }
.atlas-course-line { display: flex; justify-content: center; align-items: baseline; gap: 12px; font-variant-numeric: tabular-nums; }
.atlas-course-clock { font-size: 24px; font-weight: 900; line-height: 1.1; }
.atlas-course-clock:empty::before { content: 'Fly through the gold ring'; font-size: 14px; font-weight: 800; opacity: 0.75; }
.atlas-course-best { display: flex; align-items: center; gap: 5px; font-size: 13px; font-weight: 800; opacity: 0.65; }
.atlas-course-best:empty { display: none; }
.atlas-medal-dot { width: 13px; height: 13px; border-radius: 50%; border: 2px solid var(--ui-ink); box-sizing: border-box; }

.atlas-reticle { position: absolute; left: 0; top: 0; width: 0; height: 0; opacity: 0; transition: opacity 0.2s ease; will-change: transform; }
.atlas-reticle.on { opacity: 1; }
.atlas-reticle-ring {
  position: absolute;
  left: -27px;
  top: -27px;
  width: 54px;
  height: 54px;
  border-radius: 50%;
  border: 4px solid var(--ui-gold);
  box-shadow: 0 0 0 3px var(--ui-ink), inset 0 0 0 3px var(--ui-ink);
  animation: atlas-reticle-beat 1s ease-in-out infinite;
}
@keyframes atlas-reticle-beat { 50% { transform: scale(1.12); } }
.atlas-reticle-arrow {
  position: absolute;
  left: -20px;
  top: -20px;
  width: 40px;
  height: 40px;
  display: none;
}
.atlas-reticle.edge .atlas-reticle-ring { display: none; }
.atlas-reticle.edge .atlas-reticle-arrow { display: block; }
.atlas-reticle-label {
  position: absolute;
  left: 0;
  top: 34px;
  transform: translateX(-50%);
  padding: 2px 9px;
  border-radius: 999px;
  border: 2.5px solid var(--ui-ink);
  background: var(--ui-gold);
  font-size: 13px;
  font-weight: 900;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.atlas-callout {
  position: absolute;
  left: 50%;
  top: 27%;
  text-align: center;
  pointer-events: none;
  opacity: 0;
  transform: translate(-50%, 10px) scale(0.7);
}
.atlas-callout.on { animation: atlas-callout 0.5s var(--ui-spring) forwards; }
.atlas-callout.off { animation: atlas-callout-off 0.35s ease forwards; }
@keyframes atlas-callout { to { opacity: 1; transform: translate(-50%, 0) scale(1); } }
@keyframes atlas-callout-off { from { opacity: 1; transform: translate(-50%, 0) scale(1); } to { opacity: 0; transform: translate(-50%, -16px) scale(1.06); } }
.atlas-callout-text {
  font-size: clamp(34px, 5.4vw, 64px);
  font-weight: 900;
  line-height: 1;
  color: var(--ui-paper);
  -webkit-text-stroke: 9px var(--ui-ink);
  paint-order: stroke fill;
  text-shadow: 0 6px 0 var(--ui-ink);
}
.atlas-callout.gold .atlas-callout-text { color: var(--ui-gold); }
.atlas-callout.miss .atlas-callout-text { color: var(--ui-crimson); }
.atlas-callout.info .atlas-callout-text { font-size: clamp(28px, 4.2vw, 48px); }
.atlas-callout-sub {
  display: inline-block;
  margin-top: 10px;
  padding: 4px 14px;
  border-radius: 999px;
  border: 3px solid var(--ui-ink);
  background: var(--ui-paper);
  box-shadow: 0 4px 0 var(--ui-ink);
  font-size: 15px;
  font-weight: 800;
}
.atlas-callout-sub:empty { display: none; }

.atlas-result {
  position: absolute;
  left: 50%;
  top: 50%;
  width: min(330px, calc(100vw - 40px));
  padding: 20px 22px 18px;
  text-align: center;
  opacity: 0;
  pointer-events: none;
  transform: translate(-50%, -44%) scale(0.85);
  transition: opacity 0.25s ease, transform 0.45s var(--ui-spring);
}
.atlas-result.on { opacity: 1; transform: translate(-50%, -50%) scale(1); }
.atlas-result-medal { width: 84px; height: 84px; margin: -58px auto 6px; }
.atlas-result.on .atlas-result-medal { animation: atlas-medal 0.9s var(--ui-spring); }
@keyframes atlas-medal { 0% { transform: scale(0.2) rotate(-40deg); } 100% { transform: scale(1) rotate(0); } }
.atlas-result-kicker { font-size: 12px; font-weight: 900; letter-spacing: 0.12em; text-transform: uppercase; opacity: 0.6; }
.atlas-result-medal-name { font-size: 22px; font-weight: 900; margin-top: 2px; }
.atlas-result-time { font-size: 44px; font-weight: 900; line-height: 1.05; font-variant-numeric: tabular-nums; margin: 6px 0 4px; }
.atlas-result-facts { display: flex; justify-content: center; gap: 16px; font-size: 13.5px; font-weight: 800; opacity: 0.75; }
.atlas-result-best { margin-top: 10px; font-size: 14px; font-weight: 900; color: var(--ui-crimson); }
.atlas-result-best:empty { display: none; }

html.touch-ui .atlas-course { top: calc(max(10px, env(safe-area-inset-top)) + 96px); }
`;

const SVG = 'http://www.w3.org/2000/svg';

/** A medal: a ribbon, a disc of its metal, a star. */
export function medalSvg(rank: number): string {
  const metal = MEDAL_COLOURS[rank] ?? MEDAL_COLOURS[0];
  return (
    `<svg xmlns="${SVG}" viewBox="0 0 84 84" aria-hidden="true">` +
    '<path d="M26 4 L40 34 L30 38 L16 8 Z" fill="var(--ui-crimson)" stroke="var(--ui-ink)" stroke-width="3.5" stroke-linejoin="round"/>' +
    '<path d="M58 4 L44 34 L54 38 L68 8 Z" fill="var(--ui-violet)" stroke="var(--ui-ink)" stroke-width="3.5" stroke-linejoin="round"/>' +
    `<circle cx="42" cy="54" r="25" fill="${metal}" stroke="var(--ui-ink)" stroke-width="4"/>` +
    '<circle cx="42" cy="54" r="18" fill="none" stroke="var(--ui-ink)" stroke-width="2" opacity="0.35"/>' +
    '<path d="M42 42 L45.5 50 L54 50.5 L47.5 56 L49.6 64.5 L42 59.8 L34.4 64.5 L36.5 56 L30 50.5 L38.5 50 Z" ' +
    'fill="var(--ui-cream)" stroke="var(--ui-ink)" stroke-width="2.5" stroke-linejoin="round"/></svg>'
  );
}

const ARROW_SVG =
  `<svg xmlns="${SVG}" viewBox="0 0 40 40" aria-hidden="true">` +
  '<path d="M8 8 L34 20 L8 32 L15 20 Z" fill="var(--ui-gold)" stroke="var(--ui-ink)" stroke-width="4" stroke-linejoin="round"/></svg>';

let styled = false;

function el(tag: string, className: string, parent?: HTMLElement): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  parent?.append(node);
  return node;
}

export function createRingPanel(parent: HTMLElement): RingPanel {
  if (!styled && typeof document !== 'undefined') {
    styled = true;
    const style = document.createElement('style');
    style.textContent = STYLE;
    document.head.append(style);
  }
  const element = el('div', 'atlas-rings-hud');
  parent.append(element);

  const card = el('div', 'atlas-course ui-card', element);
  card.setAttribute('role', 'status');
  const title = el('div', 'atlas-course-title', card);
  const pipRow = el('div', 'atlas-course-pips', card);
  const line = el('div', 'atlas-course-line', card);
  const clock = el('div', 'atlas-course-clock', line);
  const best = el('div', 'atlas-course-best', line);
  let pips: HTMLElement[] = [];
  let shownPips = '';
  let shownBest = '';
  let cardOn = false;

  const reticle = el('div', 'atlas-reticle', element);
  el('div', 'atlas-reticle-ring', reticle);
  const arrow = el('div', 'atlas-reticle-arrow', reticle);
  arrow.innerHTML = ARROW_SVG;
  const reticleLabel = el('div', 'atlas-reticle-label', reticle);
  let reticleOn = false;

  const callout = el('div', 'atlas-callout', element);
  const calloutText = el('div', 'atlas-callout-text', callout);
  const calloutSub = el('div', 'atlas-callout-sub', callout);
  let calloutTimer = 0;

  const resultCard = el('div', 'atlas-result ui-card', element);
  resultCard.setAttribute('role', 'status');
  const resultMedal = el('div', 'atlas-result-medal', resultCard);
  const resultKicker = el('div', 'atlas-result-kicker', resultCard);
  const resultName = el('div', 'atlas-result-medal-name', resultCard);
  const resultTime = el('div', 'atlas-result-time', resultCard);
  const resultFacts = el('div', 'atlas-result-facts', resultCard);
  const resultBest = el('div', 'atlas-result-best', resultCard);
  let resultTimer = 0;

  /** Restarts a CSS animation by toggling its class across a reflow. */
  function replay(node: HTMLElement, name: string): void {
    node.classList.remove(name);
    void node.offsetWidth;
    node.classList.add(name);
  }

  return {
    element,
    course(view) {
      if (view === null) {
        if (cardOn) card.classList.remove('on');
        cardOn = false;
        return;
      }
      if (title.textContent !== view.title) title.textContent = view.title;
      const key = view.pips.join(',');
      if (key !== shownPips) {
        if (pips.length !== view.pips.length) {
          pipRow.replaceChildren();
          pips = view.pips.map(() => el('div', 'atlas-pip', pipRow));
        }
        view.pips.forEach((pip, i) => {
          pips[i]!.className = `atlas-pip ${pip}`;
        });
        shownPips = key;
      }
      if (clock.textContent !== view.clock) clock.textContent = view.clock;
      const bestKey = view.best === null ? '' : `${view.best.time}|${view.best.medal}`;
      if (bestKey !== shownBest) {
        shownBest = bestKey;
        best.replaceChildren();
        if (view.best !== null) {
          const dot = el('span', 'atlas-medal-dot', best);
          dot.style.background = MEDAL_COLOURS[view.best.medal] ?? MEDAL_COLOURS[1];
          best.append(`Best ${view.best.time}`);
        }
      }
      if (!cardOn) card.classList.add('on');
      cardOn = true;
    },
    track(at) {
      if (at === null) {
        if (reticleOn) reticle.classList.remove('on');
        reticleOn = false;
        return;
      }
      reticle.style.transform = `translate(${at.x.toFixed(1)}px, ${at.y.toFixed(1)}px)`;
      reticle.classList.toggle('edge', !at.inside);
      if (!at.inside) arrow.style.transform = `rotate(${((at.angle * 180) / Math.PI).toFixed(1)}deg)`;
      if (reticleLabel.textContent !== at.distance) reticleLabel.textContent = at.distance;
      if (!reticleOn) reticle.classList.add('on');
      reticleOn = true;
    },
    callout(text, sub = '', tone = 'good', seconds = 1.1) {
      calloutText.textContent = text;
      calloutSub.textContent = sub;
      callout.className = `atlas-callout ${tone}`;
      replay(callout, 'on');
      clearTimeout(calloutTimer);
      calloutTimer = window.setTimeout(() => {
        callout.classList.remove('on');
        callout.classList.add('off');
      }, seconds * 1000);
    },
    result(r) {
      resultMedal.innerHTML = medalSvg(r.medal);
      resultKicker.textContent = r.title;
      resultName.textContent = `${MEDAL_NAMES[r.medal] ?? 'No'} medal`;
      resultTime.textContent = r.time;
      resultFacts.replaceChildren();
      for (const fact of [`${r.rings} / ${r.of} rings`, `${r.perfect} perfect`]) el('span', '', resultFacts).textContent = fact;
      resultBest.textContent = r.fresh ? (r.beat === null ? 'First time round' : `New best · was ${r.beat}`) : '';
      replay(resultCard, 'on');
      clearTimeout(resultTimer);
      resultTimer = window.setTimeout(() => resultCard.classList.remove('on'), 6000);
    },
  };
}
