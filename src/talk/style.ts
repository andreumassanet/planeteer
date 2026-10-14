/** The speech bubble's stylesheet. */

export const STYLE = `
.atlas-bubble {
  position: fixed;
  left: 0;
  top: 0;
  z-index: 5;
  max-width: min(340px, calc(100vw - 32px));
  padding: 10px 14px 9px;
  pointer-events: none;
  opacity: 0;
  transform: translate(-50%, -100%) translate(var(--x), var(--y)) scale(0.92);
  transform-origin: 50% 100%;
  transition: opacity 0.15s ease;
  will-change: transform;
}
.atlas-bubble.on { opacity: 1; transform: translate(-50%, -100%) translate(var(--x), var(--y)); }
.atlas-bubble::after {
  content: '';
  position: absolute;
  left: 50%;
  bottom: -11px;
  width: 14px;
  height: 14px;
  background: var(--ui-paper);
  border-right: 3px solid var(--ui-ink);
  border-bottom: 3px solid var(--ui-ink);
  transform: translateX(-50%) rotate(45deg);
}
.atlas-bubble .said { font-size: 17px; font-weight: 800; line-height: 1.3; }
/* The part of a line not yet said keeps its room, so the bubble does not grow as it types. */
.atlas-bubble .said .unsaid { visibility: hidden; }
.atlas-bubble .meant { margin-top: 4px; font-size: 12.5px; font-weight: 600; line-height: 1.3; color: var(--ui-muted); }
.atlas-bubble .foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 7px;
  font-size: 11px;
  font-weight: 700;
  color: var(--ui-muted);
}
.atlas-bubble .foot .ui-kbd { height: 18px; min-width: 18px; font-size: 10px; margin-right: 4px; }
/* A finger has no E: the bubble itself is the button that goes on. */
html.touch-ui .atlas-bubble.on { pointer-events: auto; cursor: pointer; -webkit-tap-highlight-color: transparent; }
html.touch-ui .atlas-bubble .foot > span:last-child { color: var(--ui-ink); }
`;
