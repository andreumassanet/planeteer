/**
 * Rolling frame cost, on `atlas.stats` and the performance overlay. Means
 * over half a second for the update (everything before the draw), the draw
 * (both passes) and their sum; `p95Ms` and `worstMs` are the intervals
 * between frames over the last `FRAME_WINDOW`, which is what a stutter is.
 * Triangles and calls are the last frame's whole, both passes included.
 */
import type * as THREE from 'three';

/** How many frame intervals the worst and the 95th percentile are taken over: two seconds at 60 Hz. */
const FRAME_WINDOW = 120;

export interface FrameStatsValues {
  fps: number;
  frameMs: number;
  updateMs: number;
  drawMs: number;
  p95Ms: number;
  worstMs: number;
  triangles: number;
  calls: number;
}

export interface FrameStats {
  stats: FrameStatsValues;
  /** Records the interval between two frames' timestamps. */
  interval(now: number, previous: number): void;
  /** Adds one frame's update and draw times; returns true when the half-second window was just closed. */
  sample(now: number, updateMs: number, drawMs: number, renderer: THREE.WebGLRenderer): boolean;
}

export function createFrameStats(startedAt: number): FrameStats {
  const stats: FrameStatsValues = { fps: 0, frameMs: 0, updateMs: 0, drawMs: 0, p95Ms: 0, worstMs: 0, triangles: 0, calls: 0 };
  let frames = 0;
  let sampledAt = startedAt;
  let updateSum = 0;
  let drawSum = 0;
  const intervals = new Float32Array(FRAME_WINDOW);
  const sorted = new Float32Array(FRAME_WINDOW);
  let intervalCount = 0;
  let intervalAt = 0;
  return {
    stats,
    interval(now, previous) {
      if (now <= previous) return;
      intervals[intervalAt] = now - previous;
      intervalAt = (intervalAt + 1) % FRAME_WINDOW;
      intervalCount = Math.min(FRAME_WINDOW, intervalCount + 1);
    },
    sample(now, updateMs, drawMs, renderer) {
      updateSum += updateMs;
      drawSum += drawMs;
      frames++;
      if (now - sampledAt <= 500) return false;
      stats.fps = Math.round((frames * 1000) / (now - sampledAt));
      stats.updateMs = Number((updateSum / frames).toFixed(2));
      stats.drawMs = Number((drawSum / frames).toFixed(2));
      stats.frameMs = Number(((updateSum + drawSum) / frames).toFixed(2));
      if (intervalCount > 0) {
        const span = sorted.subarray(0, intervalCount);
        span.set(intervals.subarray(0, intervalCount));
        span.sort();
        stats.p95Ms = Number(span[Math.min(intervalCount - 1, Math.floor(intervalCount * 0.95))]!.toFixed(1));
        stats.worstMs = Number(span[intervalCount - 1]!.toFixed(1));
      }
      stats.triangles = renderer.info.render.triangles;
      stats.calls = renderer.info.render.calls;
      frames = 0;
      updateSum = 0;
      drawSum = 0;
      sampledAt = now;
      return true;
    },
  };
}
