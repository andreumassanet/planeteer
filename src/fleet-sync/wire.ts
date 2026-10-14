import type { WirePose } from '../craft/contract.ts';

export const isPose = (value: unknown): value is WirePose =>
  Array.isArray(value) && value.length === 9 && value.every((n) => typeof n === 'number' && Number.isFinite(n));
export const isSeats = (value: unknown): value is (string | null)[] =>
  Array.isArray(value) && value.every((id) => id === null || typeof id === 'string');
/** Short on the wire: centimetres of position, thousandths of a direction. */
export const wire = (pose: WirePose): number[] => pose.map((n, i) => +n.toFixed(i < 3 ? 2 : 3));
