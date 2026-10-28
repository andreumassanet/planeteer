/**
 * The small things a vehicle knocks over: trees, lamps, benches, signs, bins,
 * bollards, stalls, café tables and the rest of what a town and a wood merge
 * into their buffers. Buildings and monuments are not here and stay walls.
 *
 * A streamer registers each merged mesh with the props in it (`PropHost`:
 * where each stands and which run of vertices it is). A vehicle fast enough
 * (`BREAK_SPEED`) sweeping over one folds that run away in the buffer, takes
 * its wall down, throws a copy of it (`tumble.ts`) that bounces and lies
 * where it falls, and costs the vehicle no speed (`kinds.ts`). After
 * `LIE_SECONDS` the copy dissolves; after `REGROW_SECONDS` a copy stands
 * again in its place, dissolves in, and the buffer's run is put back under it
 * the frame the dissolve ends, so nothing pops. A town built again meanwhile
 * comes back whole, which is the same answer sooner.
 *
 * Breaking is this client's alone: nothing of it goes on the wire, and the
 * other players see the prop standing. What is breakable is one table every
 * client reads, so the world agrees on everything but who has driven through it.
 */
import * as THREE from 'three';
import { FADE_MS, createFader } from './fade.ts';
import { colourOf, copyOf, foldRange, unfoldRange } from './breakables/fold.ts';
import type { Folded } from './breakables/fold.ts';
import { BREAKABLE, MAX_JOLT, breaks } from './breakables/kinds.ts';
import { startTumble, stepTumble, tumbleFoot } from './breakables/tumble.ts';
import type { Tumble } from './breakables/tumble.ts';
import type { Solid } from './scenery/solids.ts';
import type { Breakables, BreakablesOptions, BreakablesStats, Knock, Prop, PropHost } from './breakables/types.ts';

export { BREAKABLE, BODY_JOLT, BREAK_SPEED, DRESSING_KIND, MAX_JOLT, breaks, punchOf } from './breakables/kinds.ts';
export type { KindRule, KnockBurst, KnockVoice, PropKind } from './breakables/kinds.ts';
export { KNOCK_DIZZY, KNOCK_FLY, KNOCK_LIE, KNOCK_RISE, KNOCK_TOTAL, flingOf, knockPose, newKnockPose } from './breakables/knock.ts';
export type { KnockPose } from './breakables/knock.ts';
export type { Breakables, BreakablesOptions, BreakablesStats, Knock, Prop, PropHost, PropRange } from './breakables/types.ts';

/** Seconds a knocked-over prop lies where it fell before it dissolves. */
export const LIE_SECONDS = 30;
/** Seconds after the knock a prop stands again in its place. */
export const REGROW_SECONDS = 120;
/** The most thrown copies drawn at once: past it the oldest lying one goes early. Each is a draw call, twice with the ink. */
export const MAX_THROWN = 24;
/** How far past a prop's foot a sweep counts as hitting it, over the two radii, as a share of the prop's. */
const SKIN = 0.2;

interface Host {
  host: PropHost;
  /** The mesh's world frame when registered: the towns and the tiles do not move while they stand. */
  matrix: THREE.Matrix4;
  quaternion: THREE.Quaternion;
  anchor: THREE.Vector3;
  reach: number;
  /** Every prop's foot in the world, three floats each. */
  feet: Float32Array;
  alive: boolean;
}

type Phase = 'thrown' | 'lying' | 'gone' | 'returning';

interface Broken {
  prop: Prop;
  host: Host;
  folded: Folded[];
  group: THREE.Group;
  meshes: THREE.Mesh[];
  /** Where it stood: its foot and its host's turn. */
  foot: THREE.Vector3;
  tumble: Tumble;
  phase: Phase;
  /** The clock at the knock, and at the last change of phase. */
  brokeAt: number;
  since: number;
}

export function createBreakables(options: BreakablesOptions): Breakables {
  const group = new THREE.Group();
  group.name = 'broken';
  const fader = createFader();
  const hosts = new Map<PropHost, Host>();
  const folded = new Set<Prop>();
  const broken: Broken[] = [];
  const stats: BreakablesStats = { hosts: 0, props: 0, folded: 0, thrown: 0, lying: 0, returning: 0, broken: 0 };
  let clock = 0;
  const at = new THREE.Vector3();
  const foot = new THREE.Vector3();
  const seg = new THREE.Vector3();
  const gap = new THREE.Vector3();
  const up = new THREE.Vector3();
  const facing = new THREE.Vector3();
  const knock: Knock = { point: new THREE.Vector3(), kind: 'tree', facing, speed: 0, hex: 0, height: 0 };
  const dropped: Solid[] = [];

  function register(host: PropHost): void {
    if (hosts.has(host) || host.props.length === 0) return;
    host.mesh.updateMatrixWorld(true);
    const matrix = host.mesh.matrixWorld.clone();
    const quaternion = new THREE.Quaternion().setFromRotationMatrix(matrix);
    const anchor = new THREE.Vector3().setFromMatrixPosition(matrix);
    const feet = new Float32Array(host.props.length * 3);
    let reach = 0;
    host.props.forEach((prop, i) => {
      foot.set(prop.x, prop.y, prop.z).applyMatrix4(matrix);
      feet[i * 3] = foot.x;
      feet[i * 3 + 1] = foot.y;
      feet[i * 3 + 2] = foot.z;
      reach = Math.max(reach, foot.distanceTo(anchor) + prop.radius);
    });
    hosts.set(host, { host, matrix, quaternion, anchor, reach, feet, alive: true });
  }

  function forget(host: PropHost): void {
    const entry = hosts.get(host);
    if (entry === undefined) return;
    entry.alive = false;
    hosts.delete(host);
    for (const prop of host.props) folded.delete(prop);
  }

  function dispose(b: Broken): void {
    group.remove(b.group);
    for (const mesh of b.meshes) {
      fader.cancel(mesh);
      mesh.geometry.dispose();
    }
  }

  /** Knocks one prop over: folded, its wall down, a copy thrown. */
  function knockOver(entry: Host, index: number, velocity: THREE.Vector3): void {
    const prop = entry.host.props[index]!;
    folded.add(prop);
    foot.fromArray(entry.feet, index * 3);
    const hex = colourOf(prop);
    const runs = prop.ranges.map(foldRange);
    const piece = new THREE.Group();
    const meshes: THREE.Mesh[] = [];
    at.set(prop.x, prop.y, prop.z);
    for (const run of runs) {
      const mesh = copyOf(run, at);
      piece.add(mesh);
      meshes.push(mesh);
    }
    piece.position.copy(foot);
    piece.quaternion.copy(entry.quaternion);
    group.add(piece);
    dropped.push(...prop.solids);
    broken.push({
      prop, host: entry, folded: runs, group: piece, meshes,
      foot: foot.clone(),
      tumble: startTumble(foot, entry.quaternion, prop.height, prop.radius, velocity),
      phase: 'thrown', brokeAt: clock, since: clock,
    });
    stats.broken++;
    knock.point.copy(foot);
    knock.kind = prop.kind;
    knock.speed = velocity.length();
    facing.copy(velocity).divideScalar(Math.max(1e-6, knock.speed));
    knock.hex = hex;
    knock.height = prop.height;
    options.onBreak?.(knock);
  }

  function strike(from: THREE.Vector3, to: THREE.Vector3, radius: number, velocity: THREE.Vector3, punch: number): number {
    const speed = velocity.length();
    seg.copy(to).sub(from);
    const length2 = seg.lengthSq();
    const sweep = Math.sqrt(length2) + radius;
    let jolt = 0;
    for (const entry of hosts.values()) {
      if (entry.anchor.distanceTo(from) > entry.reach + sweep) continue;
      dropped.length = 0;
      const props = entry.host.props;
      for (let i = 0; i < props.length; i++) {
        const prop = props[i]!;
        if (folded.has(prop) || !breaks(prop.kind, punch, speed)) continue;
        foot.fromArray(entry.feet, i * 3);
        if (foot.distanceToSquared(from) > (sweep + prop.radius) ** 2) continue;
        // The nearest point of the sweep to the foot, then the gap along the ground and up.
        const t = length2 < 1e-9 ? 0 : Math.min(1, Math.max(0, gap.copy(foot).sub(from).dot(seg) / length2));
        at.copy(from).addScaledVector(seg, t);
        up.copy(foot).normalize();
        gap.copy(at).sub(foot);
        const rise = gap.dot(up);
        if (rise > prop.height + 1.5 || rise < -1.5) continue;
        gap.addScaledVector(up, -rise);
        const reach = radius + prop.radius * (1 - SKIN);
        if (gap.lengthSq() > reach * reach) continue;
        knockOver(entry, i, velocity);
        jolt += BREAKABLE[prop.kind].jolt;
      }
      if (dropped.length > 0) entry.host.dropSolids(dropped);
    }
    return Math.min(MAX_JOLT, jolt);
  }

  /** The copy back where the prop stood, dissolving in; the buffer's run follows when the dissolve ends. */
  function startReturn(b: Broken): void {
    b.phase = 'returning';
    b.since = clock;
    b.group.position.copy(b.foot);
    b.group.quaternion.copy(b.host.quaternion);
    if (b.group.parent === null) group.add(b.group);
    for (const mesh of b.meshes) fader.in(mesh);
  }

  function finishReturn(b: Broken): void {
    for (const run of b.folded) unfoldRange(run);
    folded.delete(b.prop);
    dispose(b);
  }

  function update(dt: number): void {
    clock += dt;
    // The fades first, so a copy that has dissolved is seen gone this frame.
    fader.update();
    let thrown = 0;
    let lying = 0;
    let returning = 0;
    for (let i = broken.length - 1; i >= 0; i--) {
      const b = broken[i]!;
      if (b.phase === 'thrown') {
        if (stepTumble(b.tumble, dt, options.floorAt)) {
          options.onLand?.(tumbleFoot(b.tumble, at), b.prop.kind, Math.min(1, Math.max(0.2, b.prop.height / 8)));
        }
        tumbleFoot(b.tumble, b.group.position);
        b.group.quaternion.copy(b.tumble.q);
        if (b.tumble.rest) {
          b.phase = 'lying';
          b.since = clock;
        }
      }
      if (b.phase === 'thrown' || b.phase === 'lying') thrown++;
      if (b.phase === 'lying') lying++;
      if (b.phase === 'lying' && (clock - b.since > LIE_SECONDS || thrown > MAX_THROWN)) {
        b.phase = 'gone';
        b.since = clock;
        thrown--;
        for (const mesh of b.meshes) fader.out(mesh, () => { mesh.visible = false; });
      }
      if (b.phase === 'gone' && b.group.parent !== null && b.meshes.every((mesh) => !mesh.visible)) group.remove(b.group);
      // A prop whose host is gone is only its debris: nothing to put back.
      if (b.phase === 'gone' && !b.host.alive) {
        dispose(b);
        broken.splice(i, 1);
        continue;
      }
      if (b.phase === 'gone' && clock - b.brokeAt >= REGROW_SECONDS) {
        for (const mesh of b.meshes) mesh.visible = true;
        startReturn(b);
      }
      if (b.phase === 'returning') {
        returning++;
        if (clock - b.since > FADE_MS / 1000 + 0.05) {
          finishReturn(b);
          broken.splice(i, 1);
        }
      }
    }
    stats.hosts = hosts.size;
    let props = 0;
    for (const entry of hosts.values()) props += entry.host.props.length;
    stats.props = props;
    stats.folded = folded.size;
    stats.thrown = thrown;
    stats.lying = lying;
    stats.returning = returning;
  }

  return {
    group,
    stats,
    register,
    forget,
    strike,
    update,
    clear() {
      for (const b of broken) {
        if (b.host.alive) for (const run of b.folded) unfoldRange(run);
        dispose(b);
      }
      broken.length = 0;
      folded.clear();
    },
  };
}
