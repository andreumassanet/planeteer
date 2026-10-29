/**
 * The small things a vehicle knocks over: trees, lamps, benches, signs, bins,
 * bollards, stalls, café tables, the wood's boulders and the rest of what a
 * town and a wood merge into their buffers. A blast (`blast`: a wrecked
 * aircraft) knocks all of them down and brings a town's buildings down too,
 * each sinking into its plot as it dissolves (`COLLAPSE_SECONDS`), its wall
 * dropped, and standing again after `BUILDING_REGROW_SECONDS`, dissolving in.
 * Monuments are not here and stay standing.
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
import { colourOf, copyOf, copyOfRuns, foldRange, unfoldRange } from './breakables/fold.ts';
import type { Folded } from './breakables/fold.ts';
import { BREAKABLE, MAX_JOLT, blown, breaks } from './breakables/kinds.ts';
import { startTumble, stepTumble, tumbleFoot } from './breakables/tumble.ts';
import type { Tumble } from './breakables/tumble.ts';
import type { Solid } from './scenery/solids.ts';
import type { Breakables, BreakablesOptions, BreakablesStats, Knock, Prop, PropHost, PropRange } from './breakables/types.ts';

export { BREAKABLE, BODY_JOLT, BREAK_SPEED, BUILDING_REACH, DRESSING_KIND, MAX_JOLT, blown, breaks, punchOf } from './breakables/kinds.ts';
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
/** Seconds a building takes to come down, and how much of its height it sinks meanwhile. */
export const COLLAPSE_SECONDS = 1.6;
const COLLAPSE_SINK = 0.7;
/** Seconds after the blast a building stands again. */
export const BUILDING_REGROW_SECONDS = 90;
/** How hard a full blast throws what it knocks down beside it, units a second; less further out. */
const BLAST_FLING = 60;

interface Host {
  host: PropHost;
  /** The mesh's world frame when registered: the towns and the tiles do not move while they stand. */
  matrix: THREE.Matrix4;
  quaternion: THREE.Quaternion;
  anchor: THREE.Vector3;
  reach: number;
  /** Every prop's foot in the world, three floats each. */
  feet: Float32Array;
  /** How far out each prop is met: its own reach, or its walls' if they reach further, so nothing a wall stops is missed. */
  reaches: Float32Array;
  alive: boolean;
  /** The first vertices of the clinging runs folded with a building, so two never fold one. */
  clung: Set<number>;
}

type Phase = 'thrown' | 'lying' | 'collapsing' | 'gone' | 'returning';

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
  /** The clinging runs' first vertices it holds in its host's `clung`. */
  clung: number[];
  /** A collapsing building's dissolve has begun. */
  fading: boolean;
}

export function createBreakables(options: BreakablesOptions): Breakables {
  const group = new THREE.Group();
  group.name = 'broken';
  const fader = createFader();
  const hosts = new Map<PropHost, Host>();
  const folded = new Set<Prop>();
  const broken: Broken[] = [];
  const stats: BreakablesStats = { hosts: 0, props: 0, folded: 0, thrown: 0, lying: 0, returning: 0, collapsed: 0, broken: 0 };
  let clock = 0;
  const at = new THREE.Vector3();
  const foot = new THREE.Vector3();
  const seg = new THREE.Vector3();
  const gap = new THREE.Vector3();
  const up = new THREE.Vector3();
  const facing = new THREE.Vector3();
  const knock: Knock = { point: new THREE.Vector3(), kind: 'tree', facing, speed: 0, hex: 0, height: 0, blasted: false };
  const outward = new THREE.Vector3();
  const dropped: Solid[] = [];

  function register(host: PropHost): void {
    if (hosts.has(host) || host.props.length === 0) return;
    host.mesh.updateMatrixWorld(true);
    const matrix = host.mesh.matrixWorld.clone();
    const quaternion = new THREE.Quaternion().setFromRotationMatrix(matrix);
    const anchor = new THREE.Vector3().setFromMatrixPosition(matrix);
    const feet = new Float32Array(host.props.length * 3);
    const reaches = new Float32Array(host.props.length);
    let reach = 0;
    host.props.forEach((prop, i) => {
      let walls = 0;
      for (const solid of prop.solids) walls = Math.max(walls, solid.round ? solid.hx : Math.hypot(solid.hx, solid.hz));
      reaches[i] = Math.max(prop.radius * (1 - SKIN), walls);
      foot.set(prop.x, prop.y, prop.z).applyMatrix4(matrix);
      feet[i * 3] = foot.x;
      feet[i * 3 + 1] = foot.y;
      feet[i * 3 + 2] = foot.z;
      reach = Math.max(reach, foot.distanceTo(anchor) + prop.radius);
    });
    hosts.set(host, { host, matrix, quaternion, anchor, reach, feet, reaches, alive: true, clung: new Set() });
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

  /** What clings to a building and is not yet folded with another, claimed for it. */
  function clingsOf(entry: Host, prop: Prop): PropRange[] {
    const list = prop.clings?.() ?? [];
    const free = list.filter((range) => !entry.clung.has(range.start));
    for (const range of free) entry.clung.add(range.start);
    return free;
  }

  /**
   * Knocks one prop over: folded, its wall down, a copy thrown; a building
   * sinks into its plot instead, dissolving, with what clings to its fronts.
   */
  function knockOver(entry: Host, index: number, velocity: THREE.Vector3, blasted = false): void {
    const prop = entry.host.props[index]!;
    folded.add(prop);
    foot.fromArray(entry.feet, index * 3);
    const hex = colourOf(prop);
    const building = prop.kind === 'building';
    const runs = prop.ranges.map(foldRange);
    const clinging = building ? clingsOf(entry, prop).map(foldRange) : [];
    const piece = new THREE.Group();
    const meshes: THREE.Mesh[] = [];
    at.set(prop.x, prop.y, prop.z);
    runs.forEach((run, i) => {
      const mesh = i === 0 && clinging.length > 0 ? copyOfRuns([run, ...clinging], at) : copyOf(run, at);
      piece.add(mesh);
      meshes.push(mesh);
    });
    piece.position.copy(foot);
    piece.quaternion.copy(entry.quaternion);
    group.add(piece);
    dropped.push(...prop.solids);
    broken.push({
      prop, host: entry, folded: [...runs, ...clinging], group: piece, meshes,
      foot: foot.clone(),
      tumble: startTumble(foot, entry.quaternion, prop.height, prop.radius, velocity),
      phase: building ? 'collapsing' : 'thrown', brokeAt: clock, since: clock,
      clung: clinging.map((run) => run.range.start),
      fading: false,
    });
    stats.broken++;
    knock.point.copy(foot);
    knock.kind = prop.kind;
    knock.speed = velocity.length();
    facing.copy(velocity).divideScalar(Math.max(1e-6, knock.speed));
    knock.hex = hex;
    knock.height = prop.height;
    knock.blasted = blasted;
    options.onBreak?.(knock);
  }

  function blast(point: THREE.Vector3, radius: number, power: number): number {
    if (!(radius > 0) || !(power > 0)) return 0;
    let count = 0;
    up.copy(point).normalize();
    for (const entry of hosts.values()) {
      if (entry.anchor.distanceTo(point) > entry.reach + radius) continue;
      dropped.length = 0;
      const props = entry.host.props;
      for (let i = 0; i < props.length; i++) {
        const prop = props[i]!;
        if (folded.has(prop)) continue;
        foot.fromArray(entry.feet, i * 3);
        outward.copy(foot).sub(point);
        const share = Math.max(0, outward.length() - prop.radius) / radius;
        if (!blown(prop.kind, power, share)) continue;
        // Outwards along the ground, the harder the nearer.
        outward.projectOnPlane(up);
        if (outward.lengthSq() < 1e-6) outward.set(1, 0, 0).projectOnPlane(up);
        outward.normalize().multiplyScalar(BLAST_FLING * power * (1 - 0.6 * share));
        knockOver(entry, i, outward, true);
        count++;
      }
      if (dropped.length > 0) entry.host.dropSolids(dropped);
    }
    return count;
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
        if (foot.distanceToSquared(from) > (sweep + Math.max(prop.radius, entry.reaches[i]!)) ** 2) continue;
        // The nearest point of the sweep to the foot, then the gap along the ground and up.
        const t = length2 < 1e-9 ? 0 : Math.min(1, Math.max(0, gap.copy(foot).sub(from).dot(seg) / length2));
        at.copy(from).addScaledVector(seg, t);
        up.copy(foot).normalize();
        gap.copy(at).sub(foot);
        const rise = gap.dot(up);
        // Anywhere up its height, with the body's own reach: what its wall stops, a sweep meets.
        if (rise > prop.height + 1.5 + radius || rise < -1.5 - radius) continue;
        gap.addScaledVector(up, -rise);
        const reach = radius + entry.reaches[i]!;
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
    for (const start of b.clung) b.host.clung.delete(start);
    if (b.host.alive && b.prop.solids.length > 0) b.host.host.restoreSolids?.(b.prop.solids);
    dispose(b);
  }

  /** Seconds after its knock a prop stands again. */
  const regrowOf = (b: Broken): number => (b.prop.kind === 'building' ? BUILDING_REGROW_SECONDS : REGROW_SECONDS);

  function update(dt: number): void {
    clock += dt;
    // The fades first, so a copy that has dissolved is seen gone this frame.
    fader.update();
    let thrown = 0;
    let lying = 0;
    let returning = 0;
    let collapsed = 0;
    for (let i = broken.length - 1; i >= 0; i--) {
      const b = broken[i]!;
      if (b.prop.kind === 'building' && b.phase !== 'returning') collapsed++;
      if (b.phase === 'collapsing') {
        // Down into its plot, faster as it goes, while it dissolves.
        const t = Math.min(1, (clock - b.since) / COLLAPSE_SECONDS);
        // The dissolve ends as it does: begun a fade before the end.
        if (!b.fading && clock - b.since >= COLLAPSE_SECONDS - FADE_MS / 1000) {
          b.fading = true;
          for (const mesh of b.meshes) fader.out(mesh, () => { mesh.visible = false; });
        }
        up.copy(b.foot).normalize();
        b.group.position.copy(b.foot).addScaledVector(up, -b.prop.height * COLLAPSE_SINK * t * t);
        if (t >= 1 && b.meshes.every((mesh) => !mesh.visible)) {
          b.phase = 'gone';
          b.since = clock;
        }
      }
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
      if (b.phase === 'gone' && clock - b.brokeAt >= regrowOf(b)) {
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
    stats.collapsed = collapsed;
  }

  return {
    group,
    stats,
    register,
    forget,
    strike,
    blast,
    update,
    clear() {
      for (const b of broken) {
        if (b.host.alive) {
          for (const run of b.folded) unfoldRange(run);
          for (const start of b.clung) b.host.clung.delete(start);
          if (b.prop.solids.length > 0) b.host.host.restoreSolids?.(b.prop.solids);
        }
        dispose(b);
      }
      broken.length = 0;
      folded.clear();
    },
  };
}
