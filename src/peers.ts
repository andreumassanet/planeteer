/**
 * Other people: the players connected to the same relay, drawn where they are.
 *
 * Nothing about the world is sent, because every client builds the same one
 * from the same data. A player is nine numbers — where, which way, what they
 * are doing (`PLAYER_STATES`), how fast, whether in the air — sent ten times a
 * second to the relay in `server/`, which passes them on to everyone else. The
 * wire is described there, and `State` below is its client half. The same
 * socket carries the vehicles' typed messages; this file only passes them to
 * whoever subscribes (`fleet-sync.ts`), and never reads them itself.
 *
 * A peer is drawn a little in the past, `DELAY_MS` behind the newest state, so
 * there are nearly always two states to interpolate between: at ten a second
 * and a network's jitter, drawing the newest one would be a figure stepping.
 *
 * Near, a peer is a cast character playing the hero's own walk and run, chest
 * deep and slow when swimming, or held in its seat when it sits in a vehicle —
 * the vehicle itself is the fleet's, drawn once for everybody; past
 * `DRAW_REACH` it is only a mark on the minimap. A peer is a moving mesh and
 * therefore its own, never merged.
 */
import * as THREE from 'three';
import type { Folk } from './folk.ts';
import { foldLegs, limbsOf } from './cast.ts';
import type { Limbs, Person } from './cast.ts';
import { AVATAR_HEIGHT, RUN_SPEED, RUN_STRIDE, SEAT_SHIN, SEAT_THIGH, WALK_SPEED, WALK_STRIDE } from './avatar.ts';
import type { Player } from './player.ts';
import { PLAYER_STATES } from './craft/contract.ts';
import type { FleetSeats, PlayerState } from './craft/contract.ts';

/** `[x, y, z, fx, fy, fz, state, speed, airborne]`; see `server/src/index.ts`. */
type State = [number, number, number, number, number, number, number, number, number];

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
/** How far a swimmer's feet are under the surface their pose is on: chest deep. */
const SWIM_DEPTH = AVATAR_HEIGHT * 0.72;
/** A swimmer's stroke, as the walk clip played this many times a second. */
const SWIM_CADENCE = 0.6;
const NAME_KEY = 'atlas.peers.name';

/**
 * This page's secret on the relay, the same across every reconnection and
 * sent to nobody but the relay: a player who drops out of a seat and comes
 * back on a new socket is known by it, and given the seat back from wherever
 * the vehicle has got to (`sit` in `server/src/index.ts`). Made per page, not
 * stored: two tabs are two players.
 */
function pageKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  let key = '';
  for (let i = 0; i < 32; i++) key += Math.floor(Math.random() * 16).toString(16);
  return key;
}

interface Snapshot {
  at: number;
  position: THREE.Vector3;
  forward: THREE.Vector3;
  state: PlayerState;
  speed: number;
  airborne: boolean;
}

interface Body {
  person: Person;
  idle: THREE.AnimationAction;
  walk: THREE.AnimationAction;
  run: THREE.AnimationAction;
  limbs: Limbs;
  phase: number;
}

interface Peer {
  id: string;
  name: string;
  snapshots: Snapshot[];
  heard: number;
  holder: THREE.Group;
  body: Body | null;
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

/** Any object the relay sends; `t` says which. See `server/src/index.ts`. */
export interface RelayMessage {
  t: string;
  [field: string]: unknown;
}

/** Which seat of which vehicle a player sits in. */
export interface PeerSeat {
  vehicle: string;
  seat: number;
}

/**
 * How a seat frame from `FleetSeats.seatFrame` says what a body in it looks
 * like, by the frame's `userData`: `shown: false` inside a closed cab, where
 * the body is not drawn, and `pose: 'stand'` at a helm or in a basket, where
 * the body stands with its hip at the frame. Both optional; a frame without
 * them is a visible seat, sat in.
 */
export interface SeatFrameData {
  shown?: boolean;
  pose?: 'sit' | 'stand';
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
  /** Our id on the relay, from its `hi`; `null` until then and while disconnected. */
  readonly id: string | null;
  /** Sends one typed message. False, and nothing sent, while the socket is not open. */
  send(message: RelayMessage): boolean;
  /** Every object the relay sends, `hi` included, after this file has read it. */
  onMessage(listener: (message: RelayMessage) => void): () => void;
  /** Whenever the connection changes state; `open` comes before the relay's `hi`. */
  onState(listener: (state: PeersStats['state']) => void): () => void;
  /**
   * Where a seated peer is drawn: the fleet's seat frames, and which seat each
   * player holds (`FleetSync.seatOf`). Until this is called, or while a
   * seated peer's vehicle is not built, the peer is only its name.
   */
  useSeats(seats: FleetSeats, seatOf: (id: string) => PeerSeat | null): void;
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

/** What the player is doing, read so that a `Player` without `state` yet reads as on foot. */
function stateIndex(player: Player): number {
  const state = (player as { state?: string }).state ?? 'foot';
  return Math.max(0, PLAYER_STATES.indexOf(state as PlayerState));
}

export function createPeers(url: string, folk: Folk): Peers {
  const group = new THREE.Group();
  group.name = 'peers';
  const peers = new Map<string, Peer>();
  const marks: PeerMark[] = [];
  /** The marks' objects, rewritten each frame rather than made anew. */
  const markPool: PeerMark[] = [];
  /**
   * Every name the relay has told us, by id: a peer dropped here for silence
   * and heard again is only an `at`, which carries no name.
   */
  const names = new Map<string, string>();
  const stats: PeersStats = { state: 'off', id: null, name: storedName(), peers: 0, drawn: 0, sent: 0, received: 0 };
  const messageListeners = new Set<(message: RelayMessage) => void>();
  const stateListeners = new Set<(state: PeersStats['state']) => void>();
  let seats: FleetSeats | null = null;
  let seatOf: ((id: string) => PeerSeat | null) | null = null;
  let socket: WebSocket | null = null;
  let retry: number = RETRY_MS[0];
  let sentAt = 0;
  let nearestMoving = Infinity;
  const key = pageKey();
  /** The player `update` was last handed, so a new socket can say where we are at once. */
  let lastPlayer: Player | null = null;

  const basis = new THREE.Matrix4();
  const local = new THREE.Matrix4();
  const scale = new THREE.Vector3();
  const up = new THREE.Vector3();
  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();
  const hipAt = new THREE.Vector3();

  function setState(state: PeersStats['state']): void {
    if (stats.state === state) return;
    stats.state = state;
    for (const listener of stateListeners) listener(state);
  }

  function connect(): void {
    setState('connecting');
    let open: WebSocket;
    try {
      const address = new URL(url);
      if (stats.name !== '') address.searchParams.set('name', stats.name);
      address.searchParams.set('key', key);
      open = new WebSocket(address);
    } catch (error) {
      // Refused before it began — a blocked scheme, a page the browser will
      // not let open one — and asked again on the same backoff as a drop.
      console.warn('peers: no relay at', url, error);
      setState('closed');
      setTimeout(connect, retry);
      retry = Math.min(RETRY_MS[1], Math.max(RETRY_MS[0], retry * 2));
      return;
    }
    socket = open;
    open.onopen = () => {
      setState('open');
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
      stats.id = null;
      for (const id of [...peers.keys()]) drop(id);
      names.clear();
      setState('closed');
      setTimeout(connect, retry);
      retry = Math.min(RETRY_MS[1], Math.max(RETRY_MS[0], retry * 2));
    };
  }

  function receive(text: string): void {
    let message: { t?: unknown; id?: string; name?: string; s?: State; peers?: unknown[][] };
    try {
      message = JSON.parse(text);
    } catch {
      return;
    }
    if (typeof message !== 'object' || message === null || typeof message.t !== 'string') return;
    const now = performance.now();
    if (message.t === 'hi' && typeof message.id === 'string') {
      stats.id = message.id;
      // Where we are, before any listener answers the `hi`: a seat claimed
      // back on a new socket is judged against this socket's own position,
      // and the next state on the cadence is up to a tenth of a second off.
      if (lastPlayer !== null) {
        sentAt = performance.now();
        send(lastPlayer);
      }
      for (const row of message.peers ?? []) {
        const [id, name, ...state] = row as [string, string, ...State];
        if (typeof name === 'string') names.set(id, name);
        heard(id, name, state, now);
      }
    } else if (message.t === 'in' && typeof message.id === 'string') {
      if (typeof message.name === 'string') names.set(message.id, message.name);
      peerOf(message.id, message.name ?? '');
    } else if (message.t === 'at' && typeof message.id === 'string' && Array.isArray(message.s)) {
      heard(message.id, null, message.s, now);
    } else if (message.t === 'bye' && typeof message.id === 'string') {
      drop(message.id);
      names.delete(message.id);
    }
    for (const listener of messageListeners) {
      try {
        listener(message as RelayMessage);
      } catch (error) {
        console.warn('peers: a listener threw on', message.t, error);
      }
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
    peer = { id, name, snapshots: [], heard: performance.now(), holder, body: null, label, shown: new THREE.Vector3() };
    peers.set(id, peer);
    return peer;
  }

  function heard(id: string, name: string | null, state: State, now: number): void {
    if (state.length !== 9) return;
    const peer = peerOf(id, name ?? names.get(id) ?? '');
    const [x, y, z, fx, fy, fz, doing, speed, airborne] = state;
    peer.snapshots.push({
      at: now,
      position: new THREE.Vector3(x, y, z),
      forward: new THREE.Vector3(fx, fy, fz),
      state: PLAYER_STATES[doing] ?? 'foot',
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
    const state: State = [p.x, p.y, p.z, f.x, f.y, f.z, stateIndex(player), player.velocity, player.airborne ? 1 : 0];
    socket.send(JSON.stringify(state.map((n, i) => (i < 3 ? +n.toFixed(2) : i < 6 ? +n.toFixed(3) : +n.toFixed(1)))));
    stats.sent++;
  }

  /** The state `DELAY_MS` ago, blended between the two either side of it; `null` before the first. */
  const drawn = { position: new THREE.Vector3(), forward: new THREE.Vector3(), speed: 0, state: 'foot' as PlayerState };
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
      drawn.state = newest.state;
      return drawn;
    }
    const t = THREE.MathUtils.clamp((at - a.at) / Math.max(1, b.at - a.at), 0, 1);
    drawn.position.lerpVectors(a.position, b.position, t);
    drawn.forward.lerpVectors(a.forward, b.forward, t);
    drawn.speed = a.speed + (b.speed - a.speed) * t;
    drawn.state = t < 0.5 ? a.state : b.state;
    return drawn;
  }

  function dressed(peer: Peer): Body | null {
    if (peer.body !== null) return peer.body;
    // At the hero's own height, never a child's or a random adult's: a peer
    // walks with the hero's stride and wears its name at the hero's head.
    const person = folk.dress(`peer:${peer.id}`, 'atlantic-europe', undefined, AVATAR_HEIGHT);
    if (person === null) return null;
    // Read in the rest pose, before any clip has moved a bone.
    const limbs = limbsOf(person);
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
    peer.body = { person, idle: action('Idle_Neutral'), walk: action('Walk'), run: action('Run'), limbs, phase: 0 };
    peer.body.idle.timeScale = 1;
    return peer.body;
  }

  /** The hero's own blend: idle under a crawl, walk blending to run between the two speeds, each clip at the stride's phase. */
  function stride(body: Body, dt: number, speed: number): void {
    const running = THREE.MathUtils.smoothstep(speed, WALK_SPEED, RUN_SPEED);
    const moving = THREE.MathUtils.smoothstep(speed, 0.2, 1.5);
    const length = WALK_STRIDE + (RUN_STRIDE - WALK_STRIDE) * running;
    body.phase = (body.phase + (speed * dt) / length) % 1;
    body.person.root.position.set(0, 0, 0);
    body.idle.setEffectiveWeight(1 - moving);
    body.walk.setEffectiveWeight(moving * (1 - running));
    body.run.setEffectiveWeight(moving * running);
    body.walk.time = body.phase * body.walk.getClip().duration;
    body.run.time = body.phase * body.run.getClip().duration;
    body.person.mixer.update(dt);
  }

  /** Chest deep, the walk clip slowed to a stroke whether or not the swimmer is moving: treading water. */
  function swim(body: Body, dt: number): void {
    body.phase = (body.phase + dt * SWIM_CADENCE) % 1;
    body.person.root.position.set(0, -SWIM_DEPTH, 0);
    body.idle.setEffectiveWeight(0);
    body.walk.setEffectiveWeight(1);
    body.run.setEffectiveWeight(0);
    body.walk.time = body.phase * body.walk.getClip().duration;
    body.person.mixer.update(dt);
  }

  /**
   * In a seat, whose frame the holder has just been put on: the idle above the
   * waist, the legs folded as the hero's are (`avatar.ts`'s `sit`) unless the
   * seat is stood at, and the character's own hips moved onto the frame.
   */
  function seat(peer: Peer, body: Body, dt: number, pose: 'sit' | 'stand'): void {
    const root = body.person.root;
    root.position.set(0, 0, 0);
    body.idle.setEffectiveWeight(1);
    body.walk.setEffectiveWeight(0);
    body.run.setEffectiveWeight(0);
    body.person.mixer.update(dt);
    if (pose === 'sit') foldLegs(body.limbs, peer.holder, SEAT_THIGH, SEAT_SHIN);
    peer.holder.updateMatrixWorld(true);
    hipAt.copy(peer.holder.worldToLocal(body.limbs.hips.getWorldPosition(hipAt)));
    root.position.sub(hipAt);
  }

  /** Puts the holder on a seat frame, through whatever carries this group. False when the seat is not drawn. */
  function onSeat(peer: Peer): THREE.Object3D | null {
    const held = seatOf?.(peer.id) ?? null;
    const frame = held === null ? null : seats?.seatFrame(held.vehicle, held.seat) ?? null;
    if (frame === null) return null;
    frame.updateWorldMatrix(true, false);
    group.updateWorldMatrix(true, false);
    local.copy(group.matrixWorld).invert().multiply(frame.matrixWorld);
    local.decompose(peer.holder.position, peer.holder.quaternion, scale);
    return frame;
  }

  const peersApi: Peers = {
    group,
    update(dt, player) {
      lastPlayer = player;
      if (socket === null && stats.state === 'off') connect();
      const now = performance.now();
      if (now - sentAt >= SEND_MS) {
        sentAt = now;
        send(player);
      }

      marks.length = 0;
      nearestMoving = Infinity;
      stats.drawn = 0;
      // Deleting the entry being visited is safe in a Map's own iteration.
      for (const peer of peers.values()) {
        if (now - peer.heard > SILENT_MS) {
          drop(peer.id);
          continue;
        }
        const state = sample(peer, now);
        if (state === null) continue;
        peer.shown.copy(state.position);
        let mark = markPool[marks.length];
        if (mark === undefined) {
          mark = { id: '', name: '', x: 0, y: 0, z: 0 };
          markPool.push(mark);
        }
        mark.id = peer.id;
        mark.name = peer.name || 'Traveller';
        marks.push(mark);
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

        const body = dressed(peer);
        const frame = state.state === 'seated' ? onSeat(peer) : null;
        if (frame !== null) {
          const data = frame.userData as SeatFrameData;
          peer.label.position.y = AVATAR_HEIGHT * 0.75;
          if (body !== null) {
            body.person.root.visible = data.shown !== false;
            if (data.shown !== false) seat(peer, body, dt, data.pose ?? 'sit');
          }
          continue;
        }

        // The one basis every placed thing uses: X is `up x forward`, so the
        // determinant is +1 and the ink stays a line.
        forward.copy(state.forward).projectOnPlane(up);
        if (forward.lengthSq() < 1e-8) forward.set(0, 1, 0).projectOnPlane(up);
        forward.normalize();
        right.crossVectors(up, forward).normalize();
        basis.makeBasis(right, up, forward);
        peer.holder.position.copy(state.position);
        peer.holder.quaternion.setFromRotationMatrix(basis);
        peer.label.position.y = AVATAR_HEIGHT * (state.state === 'swim' ? 0.5 : 1.15);

        if (body === null) continue;
        // Seated in a vehicle nobody here has built: the name alone, where they are.
        body.person.root.visible = state.state !== 'seated';
        if (state.state === 'foot') stride(body, dt, state.speed);
        else if (state.state === 'swim') swim(body, dt);
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
    get id() {
      return stats.id;
    },
    send(message) {
      if (socket === null || socket.readyState !== WebSocket.OPEN) return false;
      socket.send(JSON.stringify(message));
      stats.sent++;
      return true;
    },
    onMessage(listener) {
      messageListeners.add(listener);
      return () => messageListeners.delete(listener);
    },
    onState(listener) {
      stateListeners.add(listener);
      return () => stateListeners.delete(listener);
    },
    useSeats(fleetSeats, holderOf) {
      seats = fleetSeats;
      seatOf = holderOf;
    },
  };
  return peersApi;
}
