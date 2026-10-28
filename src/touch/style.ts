/** The touch pad's stylesheet. */

export const STYLE = `
.atlas-touch {
  position: fixed;
  inset: 0;
  z-index: 4;
  display: none;
  pointer-events: none;
  font-family: var(--ui-font);
  color: var(--ui-ink);
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
  transition: opacity 0.2s ease, visibility 0.2s;
}
html.touch-ui .atlas-touch { display: block; }
.atlas-touch.away { opacity: 0; visibility: hidden; }
.atlas-touch.away * { pointer-events: none !important; }

/* The stick: a ring at rest in the corner, and wherever the thumb lands. */
.tp-stick {
  position: absolute;
  left: calc(env(safe-area-inset-left) + 92px);
  top: calc(100% - env(safe-area-inset-bottom) - 100px);
  width: 120px;
  height: 120px;
  margin: -60px 0 0 -60px;
  box-sizing: border-box;
  border: 3px solid rgba(255, 242, 232, 0.85);
  border-radius: 50%;
  background: rgba(30, 6, 3, 0.24);
  box-shadow: 0 0 0 3px rgba(30, 6, 3, 0.28);
  opacity: 0.55;
  transition: opacity 0.2s ease, border-color 0.15s ease;
}
.tp-stick.held { opacity: 1; transition: border-color 0.15s ease; }
.tp-stick.running { border-color: var(--ui-gold); }
.tp-nub {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 52px;
  height: 52px;
  margin: -26px 0 0 -26px;
  box-sizing: border-box;
  border: 3px solid var(--ui-ink);
  border-radius: 50%;
  background: var(--ui-paper);
  box-shadow: 0 4px 0 var(--ui-ink);
}
.tp-stick.held .tp-nub { background: var(--ui-gold); }
.tp-run {
  position: absolute;
  left: 50%;
  bottom: calc(100% + 10px);
  transform: translateX(-50%);
  padding: 3px 9px;
  font-size: 12px;
  font-weight: 800;
  background: var(--ui-gold);
  border: 2.5px solid var(--ui-ink);
  border-radius: 999px;
  box-shadow: 0 3px 0 var(--ui-ink);
  opacity: 0;
  transition: opacity 0.12s ease;
}
.tp-stick.running .tp-run { opacity: 1; }

/* The buttons, round the primary's centre in the right thumb's arc. */
.tp-actions {
  position: absolute;
  right: calc(env(safe-area-inset-right) + 62px);
  bottom: calc(env(safe-area-inset-bottom) + 66px);
  width: 0;
  height: 0;
}
.tp-btn {
  position: absolute;
  left: calc(var(--x) - var(--size) / 2);
  top: calc(var(--y) - var(--size) / 2);
  width: var(--size);
  height: var(--size);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  padding: 0;
  box-sizing: border-box;
  border: 3px solid var(--ui-ink);
  border-radius: 50%;
  background: var(--ui-paper);
  color: var(--ui-ink);
  box-shadow: 0 5px 0 var(--ui-ink);
  font: 800 10.5px/1 var(--ui-font);
  letter-spacing: -0.01em;
  pointer-events: auto;
  touch-action: none;
  -webkit-tap-highlight-color: transparent;
  transition: transform 0.08s ease, box-shadow 0.08s ease;
  animation: tp-in 0.28s var(--ui-spring) both;
}
.tp-btn svg { width: 24px; height: 24px; }
.tp-btn.primary { background: var(--ui-gold); font-size: 11.5px; }
.tp-btn.primary svg { width: 30px; height: 30px; }
.tp-btn.on { transform: translateY(4px); box-shadow: 0 1px 0 var(--ui-ink); }

/* What use does here: a pill over the buttons, only while there is one. */
.tp-use {
  position: absolute;
  right: calc(env(safe-area-inset-right) + 18px);
  bottom: calc(env(safe-area-inset-bottom) + 186px);
  display: flex;
  align-items: center;
  gap: 9px;
  max-width: min(300px, calc(100vw - 190px));
  height: 50px;
  padding: 0 16px 0 6px;
  box-sizing: border-box;
  border: 3px solid var(--ui-ink);
  border-radius: 999px;
  background: var(--ui-paper);
  color: var(--ui-ink);
  box-shadow: 0 5px 0 var(--ui-ink);
  font: 800 15px/1.1 var(--ui-font);
  letter-spacing: -0.01em;
  pointer-events: auto;
  touch-action: none;
  -webkit-tap-highlight-color: transparent;
  opacity: 0;
  visibility: hidden;
  transform: translateY(8px) scale(0.96);
  transition: opacity 0.15s ease, transform 0.25s var(--ui-spring), visibility 0.15s, box-shadow 0.08s ease;
}
.tp-use.lower { bottom: calc(env(safe-area-inset-bottom) + 122px); }
.tp-use.show { opacity: 1; visibility: visible; transform: none; }
.tp-use.on { transform: translateY(4px); box-shadow: 0 1px 0 var(--ui-ink); }
.tp-use-icon {
  display: grid;
  place-items: center;
  flex: none;
  width: 34px;
  height: 34px;
  box-sizing: border-box;
  border: 2.5px solid var(--ui-ink);
  border-radius: 50%;
  background: var(--ui-gold);
}
.tp-use-icon svg { width: 19px; height: 19px; }
.tp-use-text { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* A short landscape phone: everything a little smaller and lower. */
@media (orientation: landscape) and (max-height: 500px) {
  .tp-stick { width: 108px; height: 108px; margin: -54px 0 0 -54px; left: calc(env(safe-area-inset-left) + 86px); top: calc(100% - env(safe-area-inset-bottom) - 80px); }
  .tp-actions { right: calc(env(safe-area-inset-right) + 56px); bottom: calc(env(safe-area-inset-bottom) + 52px); }
  .tp-use { bottom: calc(env(safe-area-inset-bottom) + 160px); }
  .tp-use.lower { bottom: calc(env(safe-area-inset-bottom) + 104px); }
}
@keyframes tp-in { from { opacity: 0; transform: scale(0.6); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) {
  .tp-btn { animation: none; }
  .tp-use, .tp-use.show { transform: none; }
}
`;
