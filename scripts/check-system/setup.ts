export const DEG = Math.PI / 180;

export let failures = 0;
export const fail = (message: string): void => {
  failures++;
  console.log(`  FAIL  ${message}`);
};
export const near = (label: string, got: number, want: number, tol: number, unit = ''): void => {
  const off = Math.abs(got - want);
  if (off > tol) fail(`${label}: ${got.toFixed(6)}${unit} against ${want.toFixed(6)}${unit} — off by ${off.toFixed(6)}`);
};
