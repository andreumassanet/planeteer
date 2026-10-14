/** The stage's stylesheet. */

export const STYLE = `
.atlas-stage {
  position: fixed;
  inset: 0;
  z-index: 10;
  pointer-events: none;
  opacity: 0;
  visibility: hidden;
  transition: opacity 0.45s ease, visibility 0s 0.45s;
}
.atlas-stage.on { opacity: 1; visibility: visible; transition-delay: 0s; }
.hs-backdrop { position: absolute; inset: 0; transition: background 0.5s ease, backdrop-filter 0.5s ease; }
.hs-backdrop.clear {
  background: radial-gradient(ellipse 34% 46% at var(--hs-x, 70%) 62%, rgba(253, 230, 225, 0.1), transparent 70%);
}
.hs-backdrop.dim {
  background:
    radial-gradient(ellipse 36% 50% at var(--hs-x, 62%) 60%, rgba(253, 230, 225, 0.2), transparent 72%),
    linear-gradient(90deg, rgba(4, 6, 14, 0.78), rgba(4, 6, 14, 0.5) 45%, rgba(4, 6, 14, 0.62));
  backdrop-filter: blur(6px) saturate(0.75);
  -webkit-backdrop-filter: blur(6px) saturate(0.75);
}
.hs-view { position: absolute; inset: 0; pointer-events: auto; cursor: grab; touch-action: none; }
.hs-view.dragging { cursor: grabbing; }
.hs-view canvas { display: block; width: 100%; height: 100%; opacity: 0; transition: opacity 0.5s ease; }
.hs-view.drawn canvas { opacity: 1; }
.atlas-stage.leaving .hs-view { pointer-events: none; }
.hs-wait {
  position: absolute;
  left: var(--hs-x, 70%);
  top: 50%;
  transform: translate(-50%, -50%);
  font: 800 13px var(--ui-font);
  color: rgba(255, 242, 232, 0.8);
  text-shadow: 0 2px 0 rgba(4, 6, 14, 0.7);
}
.hs-plate {
  position: fixed;
  left: 0;
  top: 0;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 6px;
  max-width: 300px;
  padding: 5px 5px 5px 15px;
  font-family: var(--ui-font);
  color: var(--ui-ink);
  background: var(--ui-paper);
  border: 3px solid var(--ui-ink);
  border-radius: 999px;
  box-shadow: 0 4px 0 var(--ui-ink);
  pointer-events: auto;
  white-space: nowrap;
  transform: translate(-9999px, 0);
  will-change: transform;
  transition: opacity 0.3s ease;
}
.hs-plate[hidden] { display: none; }
.hs-plate.away { opacity: 0; pointer-events: none; }
.hs-plate::after {
  content: '';
  position: absolute;
  left: 50%;
  bottom: -11px;
  width: 12px;
  height: 12px;
  margin-left: -6px;
  background: var(--ui-paper);
  border: solid var(--ui-ink);
  border-width: 0 3px 3px 0;
  transform: rotate(45deg);
}
.hs-name { font-size: 18px; font-weight: 800; letter-spacing: -0.02em; overflow: hidden; text-overflow: ellipsis; }
.hs-name.empty { opacity: 0.45; }
.hs-plate input {
  width: 180px;
  height: 30px;
  padding: 0 8px;
  border: 0;
  border-radius: 8px;
  background: var(--ui-cream);
  font: 800 17px var(--ui-font);
  letter-spacing: -0.02em;
  color: var(--ui-ink);
}
.hs-plate input::placeholder { color: rgba(30, 6, 3, 0.4); }
.hs-plate input:focus-visible { outline: none; box-shadow: inset 0 0 0 2px var(--ui-violet); }
.hs-pen {
  display: grid;
  place-items: center;
  flex: none;
  width: 30px;
  height: 30px;
  padding: 0;
  border: 2.5px solid var(--ui-ink);
  border-radius: 50%;
  background: var(--ui-gold);
  color: var(--ui-ink);
  cursor: pointer;
  transition: transform 0.12s var(--ui-spring);
}
.hs-pen:hover { transform: rotate(-12deg) scale(1.08); }
.hs-pen:focus-visible { outline: var(--ui-ring); outline-offset: 3px; }
.hs-pen svg { width: 15px; height: 15px; }
@media (prefers-reduced-motion: reduce) {
  .atlas-stage, .hs-backdrop, .hs-view canvas { transition: none; }
}
`;
