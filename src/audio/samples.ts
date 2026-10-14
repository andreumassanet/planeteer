/** The recordings: fetched when the context unlocks, played by name. */
import { LANDINGS, ONE_SHOTS, PAGES, VARIANTS } from './levels.ts';
import type { Runtime } from './runtime.ts';
import type { Surface } from './types.ts';

export function createSamples(rt: Runtime) {
  async function fetchAll(ctx: AudioContext): Promise<void> {
    const names: string[] = [...ONE_SHOTS];
    for (const surface of Object.keys(VARIANTS) as Surface[]) {
      for (let i = 0; i < VARIANTS[surface]; i++) names.push(`step-${surface}-${i}`);
    }
    for (let i = 0; i < LANDINGS; i++) names.push(`land-${i}`);
    for (let i = 0; i < PAGES; i++) names.push(`page-${i}`);
    await Promise.all(
      names.map(async (name) => {
        try {
          const response = await fetch(`${import.meta.env.BASE_URL}audio/${name}.mp3`);
          if (!response.ok) return;
          const buffer = await ctx.decodeAudioData(await response.arrayBuffer());
          rt.buffers.set(name, buffer);
          rt.loaded++;
        } catch {
          // A missing sound is silence, never an error on the player's screen.
        }
      }),
    );
  }

  function play(name: string, gain: number, rate = 1): void {
    if (rt.context === null || rt.master === null) return;
    const buffer = rt.buffers.get(name);
    if (buffer === undefined) return;
    const source = rt.context.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = rate;
    const g = rt.context.createGain();
    g.gain.value = gain;
    source.connect(g).connect(rt.master);
    source.start();
    rt.voices++;
    source.onended = () => rt.voices--;
  }

  return { fetchAll, play };
}
