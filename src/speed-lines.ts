/**
 * Speed lines: thin streaks thrown out from the point the player is heading
 * for towards the screen's edges, and the corners drawn in, while the world
 * streams past fast (`rush.ts`). A 2D canvas over the world's and under the
 * HUD, at CSS pixels, drawn only while there is something on it.
 */

/** Streaks alive at a full rush. */
const MAX_STREAKS = 120;
/** Streaks born a second at a full rush. */
const BIRTH_RATE = 420;
/** How far out a streak is born and how fast it leaves, in half-diagonals and half-diagonals a second. */
const BIRTH_FROM = 0.36;
const BIRTH_TO = 0.85;
const SPEED_FROM = 1.6;
const SPEED_TO = 3.4;
/** A streak's length and its widest, in half-diagonals and CSS px. */
const LENGTH_FROM = 0.1;
const LENGTH_TO = 0.32;
const WIDTH_FROM = 1.6;
const WIDTH_TO = 4.6;
/** How dark the corners are drawn in at a full rush. */
const TUNNEL = 0.42;
/** Under this the overlay counts as off. */
const QUIET = 0.02;

interface Streak {
  angle: number;
  /** Where its inner end is, in half-diagonals from the focus. */
  from: number;
  length: number;
  speed: number;
  width: number;
  alpha: number;
}

export interface SpeedLines {
  readonly element: HTMLCanvasElement;
  /**
   * Each frame: the rush 0 to 1 and the focus the streaks leave from, in CSS
   * px (null for the screen's middle). Draws nothing and clears once when
   * there is nothing to draw.
   */
  update(dt: number, rush: number, focusX?: number | null, focusY?: number | null): void;
  /** Live streaks, for the console. */
  readonly stats: { streaks: number; drawn: boolean };
  dispose(): void;
}

export function createSpeedLines(parent: HTMLElement = document.body): SpeedLines {
  const element = document.createElement('canvas');
  element.className = 'atlas-speed-lines';
  element.setAttribute('aria-hidden', 'true');
  Object.assign(element.style, {
    position: 'fixed',
    inset: '0',
    width: '100%',
    height: '100%',
    pointerEvents: 'none',
    zIndex: '4',
    display: 'none',
  } satisfies Partial<CSSStyleDeclaration>);
  parent.append(element);
  const context = element.getContext('2d');
  const streaks: Streak[] = [];
  let owed = 0;
  let drawn = false;
  let width = 0;
  let height = 0;
  /** The focus eased, so a turn swings the streaks rather than snapping them. */
  let fx = NaN;
  let fy = NaN;
  const stats = { streaks: 0, drawn: false };

  function fit(): void {
    const w = Math.max(1, Math.round(innerWidth));
    const h = Math.max(1, Math.round(innerHeight));
    if (w === width && h === height) return;
    width = element.width = w;
    height = element.height = h;
  }

  function born(): Streak {
    return {
      angle: Math.random() * Math.PI * 2,
      from: BIRTH_FROM + Math.random() * (BIRTH_TO - BIRTH_FROM),
      length: LENGTH_FROM + Math.random() * (LENGTH_TO - LENGTH_FROM),
      speed: SPEED_FROM + Math.random() * (SPEED_TO - SPEED_FROM),
      width: WIDTH_FROM + Math.random() * (WIDTH_TO - WIDTH_FROM),
      alpha: 0.5 + Math.random() * 0.45,
    };
  }

  function clear(): void {
    if (!drawn) return;
    context?.clearRect(0, 0, width, height);
    element.style.display = 'none';
    drawn = false;
    stats.drawn = false;
  }

  return {
    element,
    stats,
    update(dt, rush, focusX = null, focusY = null) {
      if (context === null) return;
      const level = Number.isFinite(rush) ? Math.min(1, Math.max(0, rush)) : 0;
      // Fewer streaks are born as the rush falls; the ones alive run out.
      owed += BIRTH_RATE * level * level * dt;
      const cap = Math.round(MAX_STREAKS * level);
      while (owed >= 1) {
        owed -= 1;
        if (streaks.length < cap) streaks.push(born());
      }
      if (level < QUIET && streaks.length === 0) {
        owed = 0;
        clear();
        return;
      }
      fit();
      if (!drawn) {
        element.style.display = 'block';
        drawn = true;
        stats.drawn = true;
      }
      const wantX = focusX ?? width / 2;
      const wantY = focusY ?? height / 2;
      const ease = 1 - Math.exp(-dt * 6);
      fx = Number.isFinite(fx) ? fx + (wantX - fx) * ease : wantX;
      fy = Number.isFinite(fy) ? fy + (wantY - fy) * ease : wantY;
      // Kept on screen: a focus behind the camera or far off its edge would throw every streak one way.
      const cx = Math.min(width * 0.8, Math.max(width * 0.2, fx));
      const cy = Math.min(height * 0.8, Math.max(height * 0.2, fy));
      const reach = Math.hypot(width, height) / 2;

      context.clearRect(0, 0, width, height);
      if (level > QUIET) {
        const tunnel = context.createRadialGradient(cx, cy, reach * 0.45, cx, cy, reach * 1.05);
        tunnel.addColorStop(0, 'rgba(18, 10, 24, 0)');
        tunnel.addColorStop(1, `rgba(18, 10, 24, ${(TUNNEL * level).toFixed(3)})`);
        context.fillStyle = tunnel;
        context.fillRect(0, 0, width, height);
      }
      context.fillStyle = '#ffffff';
      for (let i = streaks.length - 1; i >= 0; i--) {
        const s = streaks[i]!;
        s.from += s.speed * s.from * dt;
        if (s.from > 1.25) {
          streaks[i] = streaks[streaks.length - 1]!;
          streaks.pop();
          continue;
        }
        const c = Math.cos(s.angle);
        const n = Math.sin(s.angle);
        const r0 = s.from * reach;
        const r1 = (s.from + s.length * s.from) * reach;
        // A thin wedge: a point at its inner end, its full width at the outer.
        const half = (s.width * Math.min(1.6, s.from + 0.4)) / 2;
        context.globalAlpha = s.alpha * Math.min(1, (s.from - BIRTH_FROM * 0.8) * 4) * (0.35 + 0.65 * level);
        context.beginPath();
        context.moveTo(cx + c * r0, cy + n * r0);
        context.lineTo(cx + c * r1 - n * half, cy + n * r1 + c * half);
        context.lineTo(cx + c * r1 + n * half, cy + n * r1 - c * half);
        context.closePath();
        context.fill();
      }
      context.globalAlpha = 1;
      stats.streaks = streaks.length;
    },
    dispose() {
      element.remove();
      streaks.length = 0;
    },
  };
}
