/**
 * Slack factor for the checks' wall-clock budgets. A shared CI runner is
 * slower and noisier than a desk machine, and the budgets guard against a cost
 * growing by an order of magnitude, not against hardware variance, so on CI
 * (`CI` set) every time budget is three times looser. `ATLAS_TIME_SCALE`
 * overrides it either way.
 */
export const TIME_SCALE = Number(process.env['ATLAS_TIME_SCALE'] ?? (process.env['CI'] ? 3 : 1)) || 1;
