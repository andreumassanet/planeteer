/**
 * What the speedometer reads in: kilometres or miles an hour, or knots, and
 * whether boats and aircraft read in knots whatever the roads do. Kept on
 * this device; the first default follows the browser's locale.
 */
import type { Medium } from '../craft/contract.ts';
import { localeSpeedUnit, type SpeedUnit } from '../hud/speedometer.ts';
import { NAUTICAL_KEY, SPEED_UNIT_KEY, readSetting, writeSetting } from './storage.ts';

const UNITS: readonly SpeedUnit[] = ['kmh', 'mph', 'kn'];

function storedUnit(): SpeedUnit {
  const saved = readSetting(SPEED_UNIT_KEY);
  return UNITS.includes(saved as SpeedUnit) ? (saved as SpeedUnit) : localeSpeedUnit();
}

export const speedUnits = {
  unit: storedUnit(),
  nautical: readSetting(NAUTICAL_KEY) === '1',
};

export function setSpeedUnit(value: string): string {
  if (UNITS.includes(value as SpeedUnit)) {
    speedUnits.unit = value as SpeedUnit;
    writeSetting(SPEED_UNIT_KEY, value);
  }
  return speedUnits.unit;
}

export function setNautical(on: boolean): boolean {
  speedUnits.nautical = on;
  writeSetting(NAUTICAL_KEY, on ? '1' : '0');
  return on;
}

/** The unit a vehicle of this medium reads in: knots on the water and in the air when asked for. */
export function unitFor(medium: Medium): SpeedUnit {
  return speedUnits.nautical && medium !== 'road' ? 'kn' : speedUnits.unit;
}
