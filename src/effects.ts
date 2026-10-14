/**
 * What the world leaves behind it as it moves: a launch's wake, the rings
 * round a swimmer, a plane's smoke, a car's exhaust and the dust off its
 * wheels, a crash's burst and debris, the burner's flame.
 *
 * Three pools and at most four draw calls:
 * - puffs: an instanced flat-shaded ball (smoke, spray, dust, flame) on the
 *   world's toon ramp, drawn without ink because a puff ends by shrinking and
 *   the pen is screen space;
 * - foam: discs and ribbons lying on the sea, rewritten into one buffer each
 *   frame and never see-through;
 * - debris: a few inked cubes thrown by a crash.
 *
 * Emission is frame-rate independent: a trail owes one point every so many
 * units run and a stream one puff every so many seconds, carried from frame
 * to frame and placed where the emitter was at that instant. A move longer
 * than the fastest the kind goes is a jump (boarding, a teleport, a late
 * pose) and lays nothing. Particles live in typed arrays and are swapped out
 * when dead, so nothing allocates per frame; a full pool refuses and counts it.
 * The meshes ride with the player and particles are written relative to him,
 * so float32 keeps millimetres. Other players' vehicles only emit inside
 * `REACH` of the camera.
 */
import { PALETTE } from './theme.ts';
import { createAdvance } from './effects/advance.ts';
import { H, FOAM_RADIUS, crashStrength, dustOf } from './effects/constants.ts';
import { createBursts } from './effects/bursts.ts';
import { createEmitters } from './effects/emitters.ts';
import { createFoam } from './effects/foam.ts';
import { rand, markRange } from './effects/helpers.ts';
import { createPlayerMarks } from './effects/marks.ts';
import { createPools, disposePools, probeRibbons, proxiesOf } from './effects/pools.ts';
import { createSpawners } from './effects/spawn.ts';
import { createTracking } from './effects/tracking.ts';
import type { Effects, EffectsEvent } from './effects/types.ts';

export { MAX_DEBRIS, MAX_DISCS, MAX_PUFFS, MAX_RIBBONS, RIBBON_POINTS, crashStrength, dustOf } from './effects/constants.ts';
export type { EffectsEvent, EffectsStats, EffectsSubject, Effects, OtherVisitor, SmokeVisitor, WakeProbe } from './effects/types.ts';

export function createEffects(): Effects {
  const fx = createPools();
  const { group, puffs, foamGeo, foamAttribute, foamNormal, foam, ribbonHead, ribbonCount, ribbonActive, ribbonBroken, debris, stats, anchor, eye, splashUp, mine, tracks, right, at, vel, fwdAt } = fx;
  const { spawnPuff, spawnDisc } = createSpawners(fx);
  const { smoke } = createEmitters(fx);
  const { plume, whirl, splash, dustBurst, crash } = createBursts(fx);
  const { playerMarks } = createPlayerMarks(fx);
  const { follow, release, forget } = createTracking(fx);
  const { advancePuffs, advanceDebris } = createAdvance(fx);
  const { advanceDiscs, advanceRibbons } = createFoam(fx);

  function clear(): void {
    fx.puffCount = 0;
    fx.discCount = 0;
    fx.debrisCount = 0;
    puffs.count = 0;
    debris.count = 0;
    puffs.visible = false;
    debris.visible = false;
    foam.visible = false;
    foamGeo.setDrawRange(0, 0);
    ribbonCount.fill(0);
    ribbonHead.fill(0);
    ribbonActive.fill(-Infinity);
    ribbonBroken.fill(1);
    mine.fill(0);
    fx.hasLast = false;
    tracks.forEach(release);
    tracks.clear();
  }

  /* --- the events -------------------------------------------------------- */

  function event(name: EffectsEvent, strength: number): void {
    const s = fx.subject;
    if (!fx.enabled || s === null) return;
    const kind = s.ride?.model.kind ?? null;
    const size = s.ride?.model.size;
    if (name === 'swim') {
      splash(s.position, s.up, H * 1.2, 10);
    } else if (name === 'crashed' && size !== undefined) {
      const ahead = fx.speedAlong >= 0 ? 1 : -1;
      at.copy(s.position).addScaledVector(s.up, size[2] * 0.4).addScaledVector(s.forward, ahead * size[0] * 0.5);
      fwdAt.copy(s.forward).multiplyScalar(ahead);
      crash(at, s.up, fwdAt, s.position.length(), crashStrength(strength));
    } else if (name === 'water-refused' && size !== undefined) {
      at.copy(s.up).multiplyScalar(FOAM_RADIUS);
      splash(at, s.up, Math.max(size[0], size[1]) * 0.6, 14);
    } else if (name === 'foundered' && size !== undefined) {
      // Into the water on wheels: the bigger the vehicle, the bigger the splash.
      at.copy(s.up).multiplyScalar(FOAM_RADIUS);
      splash(at, s.up, Math.max(size[0], size[1]) * 0.75, 18);
    } else if ((name === 'landed' || name === 'took-off') && size !== undefined) {
      const hex = fx.paved ? PALETTE.bone : fx.dust ?? PALETTE.bone;
      const big = kind === 'plane' || kind === 'helicopter';
      const count = big ? (name === 'landed' ? 14 : 8) : 6;
      dustBurst(s.position, s.up, Math.max(size[0], size[1]) * 0.35, count, hex, H * (big ? 0.35 : 0.25));
    }
  }

  const effects: Effects = {
    group,
    get enabled() {
      return fx.enabled;
    },
    set enabled(on: boolean) {
      if (on === fx.enabled) return;
      fx.enabled = on;
      stats.enabled = on;
      if (!on) clear();
    },
    stats,
    update(dt, s, camera) {
      const began = performance.now();
      fx.subject = s;
      fx.frame++;
      fx.frameDt = dt;
      camera.getWorldPosition(eye);
      if (!fx.enabled) {
        stats.updateMs = 0;
        stats.calls = 0;
        return;
      }
      anchor.copy(s.position);
      group.position.copy(anchor);
      playerMarks(dt, s);
      if (fx.others !== null) fx.others(follow);
      if (fx.smokers !== null) fx.smokers(smoke);
      tracks.forEach(forget);
      stats.tracked = tracks.size;
      advancePuffs(dt);
      fx.cursor = 0;
      advanceDiscs(dt);
      advanceRibbons(dt);
      foamGeo.setDrawRange(0, fx.cursor);
      foam.visible = fx.cursor > 0;
      if (fx.cursor > 0) {
        markRange(foamAttribute, fx.cursor * 3);
        markRange(foamNormal, fx.cursor * 3);
      }
      advanceDebris(dt);
      stats.puffs = fx.puffCount;
      stats.discs = fx.discCount;
      stats.foamVertices = fx.cursor;
      stats.debris = fx.debrisCount;
      stats.calls = (fx.puffCount > 0 ? 1 : 0) + (fx.cursor > 0 ? 1 : 0) + (fx.debrisCount > 0 ? 2 : 0);
      stats.updateMs = Math.round((performance.now() - began) * 1000) / 1000;
    },
    setGround(onMade, biome) {
      fx.paved = onMade;
      fx.dust = dustOf(biome);
    },
    setOthers(visit) {
      fx.others = visit;
    },
    setSmokers(visit) {
      fx.smokers = visit;
    },
    plume,
    whirl,
    setDust(hex) {
      if (hex !== null) {
        fx.paved = false;
        fx.dust = hex;
      }
    },
    event,
    touchdown(speed) {
      const s = fx.subject;
      if (!fx.enabled || s === null || speed < 6 || s.state !== 'foot') return;
      const hex = fx.paved || fx.dust === null ? PALETTE.bone : fx.dust;
      dustBurst(s.position, s.up, H * 0.2, Math.round(4 + Math.min(6, speed / 4)), hex, H * 0.14);
    },
    step(weight) {
      const s = fx.subject;
      if (!fx.enabled || s === null || weight < 1.6 || fx.paved || fx.dust === null || s.state !== 'foot') return;
      right.crossVectors(s.up, s.forward).normalize();
      for (let i = 0; i < 2; i++) {
        at.copy(s.position).addScaledVector(right, rand(-0.1, 0.1) * H).addScaledVector(s.up, 0.05).addScaledVector(s.forward, -H * 0.1);
        vel.copy(s.up).multiplyScalar(rand(0.5, 1.5)).addScaledVector(s.forward, -rand(0.5, 1.5));
        spawnPuff(at, vel, s.up, rand(0.5, 0.7), H * 0.04, H * 0.1, 0.35, fx.dust, 0, 2.5, 0.4);
      }
    },
    burst(kind) {
      const s = fx.subject;
      if (s === null) return;
      if (kind === 'crash') {
        fwdAt.copy(s.forward);
        at.copy(s.position).addScaledVector(s.forward, H);
        crash(at, s.up, fwdAt, s.position.length(), 1);
      } else if (kind === 'splash') splash(s.position, s.up, H * 1.2, 10);
      else if (kind === 'dust') dustBurst(s.position, s.up, H * 0.6, 12, fx.dust ?? PALETTE.bone, H * 0.3);
      else spawnDisc(s.position, fwdAt.set(0, 0, 0), 1.6, H * 0.3, H * 1.4, 0.8, 0);
    },
    splashAt(point, reach) {
      if (!fx.enabled) return;
      splashUp.copy(point).normalize();
      splash(point, splashUp, reach, Math.max(2, Math.round(reach * 3)));
    },
    dustAt(point, reach, count) {
      if (!fx.enabled) return;
      splashUp.copy(point).normalize();
      dustBurst(point, splashUp, reach, count, fx.dust ?? PALETTE.bone, H * 0.3);
    },
    crashAt(point, facing, strength) {
      if (!fx.enabled) return;
      splashUp.copy(point).normalize();
      fwdAt.copy(facing).projectOnPlane(splashUp).normalize();
      crash(point, splashUp, fwdAt, point.length(), Math.max(0, Math.min(1, strength)));
    },
    probe: () => probeRibbons(fx),
    proxies: () => proxiesOf(fx),
    dispose: () => disposePools(fx),
  };
  return effects;
}
