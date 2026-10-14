/** Small helpers shared by the music's parts. */

export const between = (a: number, b: number): number => a + Math.random() * (b - a);
export const frequencyOf = (midi: number): number => 440 * Math.pow(2, (midi - 69) / 12);

/** Freezes a ramp where it is before a new one starts. */
export function hold(param: AudioParam, at: number): void {
  // `cancelScheduledValues` alone snaps back to the last set value, which clicks.
  if (typeof param.cancelAndHoldAtTime === 'function') param.cancelAndHoldAtTime(at);
  else {
    const value = param.value;
    param.cancelScheduledValues(at);
    param.setValueAtTime(value, at);
  }
}
