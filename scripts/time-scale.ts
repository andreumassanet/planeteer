/**
 * How much slower a machine is allowed to be than the one the checks' wall-clock
 * budgets were measured on.
 *
 * A budget in milliseconds or microseconds is a claim about a machine, and a
 * shared CI runner is a slower and noisier one than a desk, where a p95 taken
 * here has come out more than twice as long (2026-09-25). What the checks guard against is a cost that grows by an order,
 * not one that moves with the hardware, so on CI (`CI` is set) every time budget
 * is three times as loose. `ATLAS_TIME_SCALE` overrides it either way.
 */
export const TIME_SCALE = Number(process.env['ATLAS_TIME_SCALE'] ?? (process.env['CI'] ? 3 : 1)) || 1;
