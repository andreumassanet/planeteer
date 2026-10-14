import * as THREE from 'three';

/**
 * Things arriving and leaving by dissolving rather than popping.
 *
 * Transparency breaks the ink (a see-through fill that writes no depth shows its
 * whole hull through itself), so the fade is a screen door: a fixed dither
 * across the screen and a threshold, every pixel either drawn whole with its
 * depth or discarded. Over `FADE_MS` the eye reads it as a dissolve.
 *
 * Two fades of one place are complementary: a mesh fading in keeps the pixels
 * whose dither is at least `1 - t`, one fading out the pixels under `1 - t`, so
 * an old tile and its replacement crossing over at the same `t` share every
 * pixel and neither overlap nor leave a gap.
 *
 * The ink dissolves with the fill. `OutlineEffect` builds its own program and
 * ignores a fill's `onBeforeCompile`, so a fading material hands the effect its
 * fade as `outlineParameters.dissolve` and the hull discards the same pixels.
 *
 * It is a material swap and not a uniform on the shared material, because three
 * uploads a material's own uniforms only when the material changes between two
 * draws and every town is drawn with one material. A fading mesh wears a clone
 * of its material (a different program, `|dissolve` on the cache key, compiled
 * once and shared by every clone of its kind) for the length of the fade, and
 * the clones are pooled. `FADES` off makes everything arrive and leave at once.
 */
export const FADES = true;
/** Fade duration, ms. */
export const FADE_MS = 350;

/**
 * The dither, once, for every shader that dissolves: interleaved gradient noise
 * on the pixel's own coordinates, so the pattern holds still on the screen
 * while the threshold moves through it.
 */
export const DITHER_GLSL = 'fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))))';

/**
 * The discard for a fade value `fade`: positive fades in (the share drawn),
 * negative fades out (minus the share still drawn), and the two keep
 * complementary pixels. 1 draws everything.
 */
export function dissolveGLSL(fade: string): string {
  return `{ float atlasDither = ${DITHER_GLSL};
    if (${fade} >= 0.0 ? atlasDither < 1.0 - ${fade} : atlasDither >= -(${fade})) discard; }`;
}

interface Fading {
  mesh: THREE.Mesh;
  source: THREE.Material;
  clone: THREE.Material & { atlasFade?: THREE.IUniform<number> };
  began: number;
  /** +1 fading in, -1 fading out. */
  way: 1 | -1;
  done: (() => void) | null;
}

export interface Fader {
  /** Dissolves `mesh` in. It must already be where it will be drawn. */
  in(mesh: THREE.Mesh): void;
  /**
   * Dissolves `mesh` out and then calls `done`, which removes and disposes it.
   * With fades off, or the mesh never drawn, `done` runs now.
   */
  out(mesh: THREE.Mesh, done: () => void): void;
  /** Ends any fade on `mesh` at once, its own material back and nothing called. */
  cancel(mesh: THREE.Mesh): void;
  /** Once a frame. */
  update(): void;
  /** Meshes mid-fade. */
  readonly stats: { fading: number };
}

/** Clones of each source material, free for the next fade. */
const pools = new WeakMap<THREE.Material, (THREE.Material & { atlasFade?: THREE.IUniform<number> })[]>();

function cloneOf(source: THREE.Material): THREE.Material & { atlasFade?: THREE.IUniform<number> } {
  const free = pools.get(source)?.pop();
  if (free !== undefined) return free;
  const clone = source.clone() as THREE.Material & { atlasFade?: THREE.IUniform<number> };
  const uniform = { value: 1 };
  clone.atlasFade = uniform;
  // The source's own hook first (the windows' light, whatever it does), on the
  // source's own uniforms, which the clone shares by reference.
  const base = source.onBeforeCompile.bind(source);
  const key = source.customProgramCacheKey();
  clone.onBeforeCompile = (shader, renderer) => {
    base(shader, renderer);
    shader.uniforms['atlasFade'] = uniform;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float atlasFade;')
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>\n${dissolveGLSL('atlasFade')}`);
  };
  clone.customProgramCacheKey = () => `${key}|dissolve`;
  const ink = source.userData.outlineParameters as Record<string, unknown> | undefined;
  clone.userData.outlineParameters = { ...(ink ?? {}), dissolve: uniform };
  return clone;
}

function release(source: THREE.Material, clone: THREE.Material & { atlasFade?: THREE.IUniform<number> }): void {
  let pool = pools.get(source);
  if (pool === undefined) {
    pool = [];
    pools.set(source, pool);
  }
  pool.push(clone);
}

/**
 * A fading clone of `source`, for `warm.ts` to compile the dissolving program
 * before anything fades. Handed back to the pool unused.
 */
export function fadeTwin(source: THREE.Material): THREE.Material {
  const clone = cloneOf(source);
  release(source, clone);
  return clone;
}

export function createFader(): Fader {
  const fading = new Map<THREE.Mesh, Fading>();
  const stats = { fading: 0 };

  function finish(entry: Fading): void {
    fading.delete(entry.mesh);
    entry.mesh.material = entry.source;
    release(entry.source, entry.clone);
    entry.done?.();
  }

  function start(mesh: THREE.Mesh, way: 1 | -1, done: (() => void) | null): void {
    const now = performance.now();
    const running = fading.get(mesh);
    if (running !== undefined) {
      // Turned round mid-fade: carry on from the share already drawn.
      const t = Math.min(1, (now - running.began) / FADE_MS);
      running.began = now - (1 - t) * FADE_MS;
      running.way = way;
      running.done = done;
      return;
    }
    const source = mesh.material as THREE.Material;
    const clone = cloneOf(source);
    clone.atlasFade!.value = way === 1 ? 0 : -1;
    mesh.material = clone;
    fading.set(mesh, { mesh, source, clone, began: now, way, done });
  }

  return {
    stats,
    in(mesh) {
      if (!FADES) return;
      start(mesh, 1, null);
    },
    out(mesh, done) {
      if (!FADES || mesh.parent === null) {
        const running = fading.get(mesh);
        if (running !== undefined) {
          running.done = null;
          finish(running);
        }
        done();
        return;
      }
      start(mesh, -1, done);
    },
    cancel(mesh) {
      const running = fading.get(mesh);
      if (running === undefined) return;
      running.done = null;
      finish(running);
    },
    update() {
      stats.fading = fading.size;
      if (fading.size === 0) return;
      const now = performance.now();
      // A map may drop the entry it is visiting, which `finish` does.
      for (const entry of fading.values()) {
        const t = Math.min(1, (now - entry.began) / FADE_MS);
        entry.clone.atlasFade!.value = entry.way === 1 ? t : -(1 - t);
        if (t >= 1) finish(entry);
      }
    },
  };
}
