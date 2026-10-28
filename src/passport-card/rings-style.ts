/** The rings' pages' stylesheet: the course log's lines; the landmarks' rings use the visas' grid. */
import { hex } from '../ui.ts';
import { PALETTE } from '../theme.ts';

export const RINGS_STYLE = `
/* --- the course log ------------------------------------------------------------ */
.p-log { display: flex; flex-direction: column; }
.p-log-head {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 54px;
  padding-top: 12px;
  box-sizing: border-box;
  border-bottom: 1.5px solid rgba(30, 6, 3, 0.28);
}
.p-log-badge { flex: none; width: 30px; height: 30px; }
.p-log-badge svg, .p-log-medal svg, .p-tally svg { display: block; width: 100%; height: 100%; overflow: visible; }
.p-log-head > div { flex: 1; min-width: 0; }
.p-log-head b { display: block; font-size: 15px; font-weight: 800; line-height: 1.1; }
.p-log-head small { display: block; margin-top: 1px; font-size: 9.5px; font-weight: 800; letter-spacing: 0.16em; text-transform: uppercase; opacity: 0.55; }
.p-tally { display: flex; gap: 7px; font-size: 12.5px; font-weight: 800; font-variant-numeric: tabular-nums; }
.p-tally span { display: flex; align-items: center; gap: 1px; }
.p-tally span.none { opacity: 0.32; }
.p-tally i { display: block; width: 19px; height: 19px; }
.p-log-row {
  display: flex;
  align-items: center;
  gap: 9px;
  height: 34px;
  padding: 0 2px;
  box-sizing: border-box;
  border-bottom: 1px dashed rgba(30, 6, 3, 0.2);
}
.p-log-medal { flex: none; width: 26px; height: 26px; }
.p-log-row > div { flex: 1; min-width: 0; }
.p-log-row b { display: block; font-size: 12px; font-weight: 800; line-height: 1.2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.p-log-row small { display: block; font-size: 9.5px; font-weight: 700; line-height: 1.2; opacity: 0.55; }
/* The best time, stamped: a double-ruled box in the log's ink, a little askew. */
.p-time {
  flex: none;
  padding: 1px 7px;
  border: 2px solid currentColor;
  border-radius: 6px;
  box-shadow: inset 0 0 0 1.5px ${hex(PALETTE.white)}, inset 0 0 0 2.5px currentColor;
  font-size: 14px;
  font-weight: 800;
  letter-spacing: 0.04em;
  font-variant-numeric: tabular-nums;
  transform: rotate(var(--tilt, 0deg));
  mix-blend-mode: multiply;
}
.p-log-none { height: 48px; padding: 7px 6px 0 40px; box-sizing: border-box; font-size: 11.5px; font-weight: 600; font-style: italic; line-height: 1.35; opacity: 0.6; }
`;
