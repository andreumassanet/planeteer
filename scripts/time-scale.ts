/**
 * How much slower a machine is allowed to be than the one the checks' wall-clock
 * budgets were measured on.
 *
 * A budget in milliseconds or microseconds is a claim about a machine, and a
 * shared CI runner is a slower and noisier one than a desk: the interiors'
 * build measured a p95 of 13.5 ms here and 28.6 ms on a runner, against a
 * 20 ms budget. What the checks guard against is a cost that grows by an order,
 * not one that moves with the hardware, so on CI (`CI` is set) every time budget
 * is three times as loose. `ATLAS_TIME_SCALE` overrides it either way.
 */
export const TIME_SCALE = Number(process.env['ATLAS_TIME_SCALE'] ?? (process.env['CI'] ? 3 : 1)) || 1;
