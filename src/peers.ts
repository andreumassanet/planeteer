/**
 * Other people: the players connected to the same relay, drawn where they are.
 *
 * Nothing about the world is sent, because every client builds the same one
 * from the same data. A player is nine numbers — where, which way, what they
 * ride, how fast, whether in the air — sent ten times a second to the relay in
 * `server/`, which passes them on to everyone else. The wire is described
 * there, and `State` below is its client half.
 *
 * A peer is drawn a little in the past, `DELAY_MS` behind the newest state, so
 * there are nearly always two states to interpolate between: at ten a second
 * and a network's jitter, drawing the newest one would be a figure stepping.
 *
 * Near, a peer is a cast character playing the hero's own walk and run, or the
 * boat or the plane it is in; past `DRAW_REACH` it is only a mark on the
 * minimap. A peer is a moving mesh and therefore its own, never merged.
 */
import * as THREE from 'three';
import type { Folk } from './folk.ts';
import type { Person } from './cast.ts';
import { AVATAR_HEIGHT, RUN_SPEED, WALK_SPEED, WALK_STRIDE } from './avatar.ts';
import { buildBoat, buildPlane } from './vehicles.ts';
import type { Player, Vehicle } from './player.ts';

/** `[x, y, z, fx, fy, fz, vehicle, speed, airborne]`; see `server/src/index.ts`. */
type State = [number, number, number, number, number, number, number, number, number];

const VEHICLES: readonly Vehicle[] = ['foot', 'boat', 'plane'];
/** How often our own state goes out. The relay drops anything under 60 ms apart. */
const SEND_MS = 100;
/** How far behind the newest state a peer is drawn: a state and a half of jitter. */
const DELAY_MS = 150;
/** A peer silent this long is dropped, in case the relay's goodbye was lost. */
const SILENT_MS = 10_000;
/** Beyond this a peer is not drawn, only marked on the minimap. */
const DRAW_REACH = 2_500;
/** Reconnection backoff, doubling from the first to the last. */
const RETRY_MS = [1_000, 30_000] as const;
/** The run's stride, from its cadence of 1.5 Hz as `avatar.ts` states it. */
const RUN_STRIDE = RUN_SPEED / 1.5;
const NAME_KEY = 'atlas.peers.name';

interface Snapshot {
  at: number;
  position: THREE.Vector3;
  forward: THREE.Vector3;
  vehicle: Vehicle;
  speed: number;
  airborne: boolean;
}

interface Body {
  person: Person;
  idle: THREE.AnimationAction;
  walk: THREE.AnimationAction;
  run: THREE.AnimationAction;
  phase: number;
}

interface Peer {
  id: string;
  name: string;
  snapshots: Snapshot[];
  heard: number;
  holder: THREE.Group;
  body: Body | null;
  craft: THREE.Object3D | null;
  craftOf: Vehicle;
  label: THREE.Sprite;
  /** Where it is drawn this frame, for the minimap. */
  shown: THREE.Vector3;
}

export interface PeerMark {
  id: string;
  name: string;
  /** A point on the unit sphere. */
  x: number;
  y: number;
  z: number;
}

export interface PeersStats {
  state: 'off' | 'connecting' | 'open' | 'closed';
  id: string | null;
  name: string;
  peers: number;
  drawn: number;
  sent: number;
  received: number;
}

export interface Peers {
  group: THREE.Group;
  update(dt: number, player: Player): void;
  /** Every peer's drawn position, on the unit sphere. Rewritten by `update`. */
  readonly marks: readonly PeerMark[];
  /** The nearest drawn peer that is moving, in world units, for the shadow's cadence. */
  readonly nearestMoving: number;
  readonly stats: PeersStats;
  /** How many others are connected, or `null` while we are not. */
  readonly online: number | null;
  /** Where a peer is drawn, in world units, or `null` if it has gone. */
  positionOf(id: string): THREE.Vector3 | null;
  /** Our name as we chose it, `''` for none. */
  readonly name: string;
  /**
   * Change our name; it is sent on the next connection, which this makes now.
   * Returns the name as it was kept.
   */
  rename(name: string): string;
}

function storedName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

function labelOf(name: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d')!;
  const font = '600 28px system-ui, sans-serif';
  context.font = font;
  const width = Math.ceil(context.measureText(name).width) + 24;
  canvas.width = width;
  canvas.height = 40;
  context.font = font;
  context.fillStyle = 'rgba(20, 16, 12, 0.72)';
  context.beginPath();
  context.roundRect(0, 0, width, 40, 20);
  context.fill();
  context.fillStyle = '#fff6e0';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(name, width / 2, 21);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({ map: texture, sizeAttenuation: false, depthWrite: false });
  // A sprite has no hull; the outline pass would draw it a second time.
  material.userData.outlineParameters = { visible: false };
  const sprite = new THREE.Sprite(material);
  const tall = 0.035;
  sprite.scale.set((tall * width) / 40, tall, 1);
  sprite.center.set(0.5, 0);
  sprite.renderOrder = 10;
  return sprite;
}

export function createPeers(url: string, folk: Folk): Peers {
  const group = new THREE.Group();
  group.name = 'peers';
  const peers = new Map<string, Peer>();
  const marks: PeerMark[] = [];
  const stats: PeersStats = { state: 'off', id: null, name: storedName(), peers: 0, drawn: 0, sent: 0, received: 0 };
  let socket: WebSocket | null = null;
  let retry: number = RETRY_MS[0];
  let sentAt = 0;
  let nearestMoving = Infinity;

  const basis = new THREE.Matrix4();
  const up = new THREE.Vector3();
  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();

  function connect(): void {
    stats.state = 'connecting';
    const address = new URL(url);
    if (stats.name !== '') address.searchParams.set('name', stats.name);
    let open: WebSocket;
    try {
      open = new WebSocket(address);
    } catch (error) {
      console.warn('peers: no relay at', url, error);
      stats.state = 'closed';
      return;
    }
    socket = open;
    open.onopen = () => {
      stats.state = 'open';
      retry = RETRY_MS[0];
    };
    open.onmessage = (event) => {
      if (typeof event.data !== 'string') return;
      stats.received++;
      receive(event.data);
    };
    open.onclose = () => {
      if (socket !== open) return;
      socket = null;
      stats.state = 'closed';
      stats.id = null;
      for (const id of [...peers.keys()]) drop(id);
      setTimeout(connect, retry);
      retry = Math.min(RETRY_MS[1], Math.max(RETRY_MS[0], retry * 2));
    };
  }

  function receive(text: string): void {
    let message: { t?: string; id?: string; name?: string; s?: State; peers?: unknown[][] };
    try {
      message = JSON.parse(text);
    } catch {
      return;
    }
    const now = performance.now();
    if (message.t === 'hi' && typeof message.id === 'string') {
      stats.id = message.id;
      for (const row of message.peers ?? []) {
        const [id, name, ...state] = row as [string, string, ...State];
        heard(id, name, state, now);
      }
    } else if (message.t === 'in' && typeof message.id === 'string') {
      peerOf(message.id, message.name ?? '');
    } else if (message.t === 'at' && typeof message.id === 'string' && Array.isArray(message.s)) {
      heard(message.id, null, message.s, now);
    } else if (message.t === 'bye' && typeof message.id === 'string') {
      drop(message.id);
    }
  }

  function peerOf(id: string, name: string): Peer {
    let peer = peers.get(id);
    if (peer !== undefined) return peer;
    const holder = new THREE.Group();
    holder.name = `peer:${id}`;
    holder.visible = false;
    const label = labelOf(name || 'Traveller');
    label.position.y = AVATAR_HEIGHT * 1.15;
    holder.add(label);
    group.add(holder);
    peer = {
      id, name, snapshots: [], heard: performance.now(), holder, body: null, craft: null, craftOf: 'foot', label,
      shown: new THREE.Vector3(),
    };
    peers.set(id, peer);
    return peer;
  }

  function heard(id: string, name: string | null, state: State, now: number): void {
    if (state.length !== 9) return;
    const peer = peerOf(id, name ?? '');
    const [x, y, z, fx, fy, fz, vehicle, speed, airborne] = state;
    peer.snapshots.push({
      at: now,
      position: new THREE.Vector3(x, y, z),
      forward: new THREE.Vector3(fx, fy, fz),
      vehicle: VEHICLES[vehicle] ?? 'foot',
      speed,
      airborne: airborne === 1,
    });
    // Two states either side of the drawn instant is all interpolation needs.
    if (peer.snapshots.length > 8) peer.snapshots.shift();
    peer.heard = now;
  }

  function drop(id: string): void {
    const peer = peers.get(id);
    if (peer === undefined) return;
    group.remove(peer.holder);
    if (peer.body !== null) folk.release(peer.body.person);
    peer.label.material.map?.dispose();
    peer.label.material.dispose();
    peers.delete(id);
  }

  function send(player: Player): void {
    if (socket === null || socket.readyState !== WebSocket.OPEN) return;
    const { position: p, forward: f } = player;
    const state: State = [
      p.x, p.y, p.z, f.x, f.y, f.z,
      VEHICLES.indexOf(player.vehicle), player.velocity, player.airborne ? 1 : 0,
    ];
    socket.send(JSON.stringify(state.map((n, i) => (i < 3 ? +n.toFixed(2) : i < 6 ? +n.toFixed(3) : +n.toFixed(1)))));
    stats.sent++;
  }

  /** The state `DELAY_MS` ago, blended between the two either side of it; `null` before the first. */
  const drawn = { position: new THREE.Vector3(), forward: new THREE.Vector3(), speed: 0, vehicle: 'foot' as Vehicle };
  function sample(peer: Peer, now: number): typeof drawn | null {
    const list = peer.snapshots;
    const newest = list[list.length - 1];
    if (newest === undefined) return null;
    const at = now - DELAY_MS;
    let i = list.length - 1;
    while (i > 0 && list[i - 1]!.at > at) i--;
    const b = list[i]!;
    const a = list[i - 1];
    if (a === undefined || at >= newest.at) {
      drawn.position.copy(newest.position);
      drawn.forward.copy(newest.forward);
      drawn.speed = at - newest.at > 500 ? 0 : newest.speed;
      drawn.vehicle = newest.vehicle;
      return drawn;
    }
    const t = THREE.MathUtils.clamp((at - a.at) / Math.max(1, b.at - a.at), 0, 1);
    drawn.position.lerpVectors(a.position, b.position, t);
    drawn.forward.lerpVectors(a.forward, b.forward, t);
    drawn.speed = a.speed + (b.speed - a.speed) * t;
    drawn.vehicle = t < 0.5 ? a.vehicle : b.vehicle;
    return drawn;
  }

  function dressed(peer: Peer): Body | null {
    if (peer.body !== null) return peer.body;
    const person = folk.dress(`peer:${peer.id}`, 'atlantic-europe');
    if (person === null) return null;
    const action = (name: 'Idle_Neutral' | 'Walk' | 'Run') => {
      const found = person.actions.get(name)!;
      found.play();
      found.setEffectiveWeight(0);
      found.timeScale = 0;
      return found;
    };
    person.root.traverse((object) => {
      if ((object as THREE.Mesh).isMesh) object.castShadow = true;
    });
    peer.holder.add(person.root);
    peer.body = { person, idle: action('Idle_Neutral'), walk: action('Walk'), run: action('Run'), phase: 0 };
    peer.body.idle.timeScale = 1;
    return peer.body;
  }

  /** The hero's own blend: idle under a crawl, walk blending to run between the two speeds, each clip at the stride's phase. */
  function stride(body: Body, dt: number, speed: number): void {
    const running = THREE.MathUtils.smoothstep(speed, WALK_SPEED, RUN_SPEED);
    const moving = THREE.MathUtils.smoothstep(speed, 0.2, 1.5);
    const length = WALK_STRIDE + (RUN_STRIDE - WALK_STRIDE) * running;
    body.phase = (body.phase + (speed * dt) / length) % 1;
    body.idle.setEffectiveWeight(1 - moving);
    body.walk.setEffectiveWeight(moving * (1 - running));
    body.run.setEffectiveWeight(moving * running);
    body.walk.time = body.phase * body.walk.getClip().duration;
    body.run.time = body.phase * body.run.getClip().duration;
    body.person.mixer.update(dt);
  }

  function ride(peer: Peer, vehicle: Vehicle): void {
    if (peer.craftOf === vehicle) return;
    if (peer.craft !== null) peer.holder.remove(peer.craft);
    peer.craft = vehicle === 'boat' ? buildBoat() : vehicle === 'plane' ? buildPlane().group : null;
    if (peer.craft !== null) peer.holder.add(peer.craft);
    peer.craftOf = vehicle;
  }

  const peersApi: Peers = {
    group,
    update(dt, player) {
      if (socket === null && stats.state === 'off') connect();
      const now = performance.now();
      if (now - sentAt >= SEND_MS) {
        sentAt = now;
        send(player);
      }

      marks.length = 0;
      nearestMoving = Infinity;
      stats.drawn = 0;
      for (const peer of [...peers.values()]) {
        if (now - peer.heard > SILENT_MS) {
          drop(peer.id);
          continue;
        }
        const state = sample(peer, now);
        if (state === null) continue;
        peer.shown.copy(state.position);
        marks.push({ id: peer.id, name: peer.name || 'Traveller', x: 0, y: 0, z: 0 });
        const mark = marks[marks.length - 1]!;
        up.copy(state.position).normalize();
        mark.x = up.x;
        mark.y = up.y;
        mark.z = up.z;

        const away = state.position.distanceTo(player.position);
        const near = away < DRAW_REACH;
        peer.holder.visible = near;
        if (!near) continue;
        stats.drawn++;
        if (state.speed > 0) nearestMoving = Math.min(nearestMoving, away);

        // The one basis every placed thing uses: X is `up x forward`, so the
        // determinant is +1 and the ink stays a line.
        forward.copy(state.forward).projectOnPlane(up);
        if (forward.lengthSq() < 1e-8) forward.set(0, 1, 0).projectOnPlane(up);
        forward.normalize();
        right.crossVectors(up, forward).normalize();
        basis.makeBasis(right, up, forward);
        peer.holder.position.copy(state.position);
        peer.holder.quaternion.setFromRotationMatrix(basis);

        ride(peer, state.vehicle);
        const body = dressed(peer);
        if (body !== null) {
          body.person.root.visible = state.vehicle === 'foot';
          if (state.vehicle === 'foot') stride(body, dt, state.speed);
        }
      }
      stats.peers = peers.size;
    },
    get marks() {
      return marks;
    },
    get nearestMoving() {
      return nearestMoving;
    },
    get stats() {
      return { ...stats };
    },
    get online() {
      return stats.state === 'open' ? peers.size : null;
    },
    positionOf(id) {
      const peer = peers.get(id);
      return peer === undefined || peer.snapshots.length === 0 ? null : peer.shown;
    },
    get name() {
      return stats.name;
    },
    rename(name) {
      const kept = name.replace(/[\p{C}<>]/gu, '').trim().slice(0, 20);
      if (kept === stats.name) return kept;
      stats.name = kept;
      try {
        localStorage.setItem(NAME_KEY, kept);
      } catch {
        // Private mode; the name lasts this visit.
      }
      // The relay learns a name only as a socket opens, so a rename is a
      // reconnection, straight away rather than after the backoff.
      retry = 0;
      socket?.close();
      return kept;
    },
  };
  return peersApi;
}
