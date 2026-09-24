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
 * Near, a peer is a cast character dressed as that player chose to look — the
 * appearance their card sends as a short code (`appearance.ts`), which the
 * relay passes on beside the name; a peer that sent none, from an older
 * client or through an older relay, is dressed as the crowd is — played by
 * the hero's own motion (`createMotion` in `avatar.ts`) from the speed and the
 * state on the wire: the walk and the run, the jump and its landing, the
 * crawl and treading water, or held in its seat when it sits in a vehicle —
 * the vehicle itself is the fleet's, drawn once for everybody; past
 * `DRAW_REACH` it is only a mark on the minimap. A peer is a moving mesh and
 * therefore its own, never merged.
 */
import * as THREE from 'three';
import type { Folk } from './folk.ts';
import { decodeAppearance } from './appearance.ts';
import { foldLegs, limbsOf } from './cast.ts';
import type { Limbs, Person } from './cast.ts';
import { AVATAR_HEIGHT, SEAT_SHIN, SEAT_THIGH, createMotion } from './avatar.ts';
import type { Motion } from './avatar.ts';
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
const NAME_KEY = 'atlas.peers.name';
/**
 * The least time between two looks sent, a little over the relay's own
 * (`LOOK_INTERVAL_MS` in `server/src/index.ts`), which drops one sooner: a
 * run of clicks on the card sends the first at once and the last after this.
 */
const LOOK_SEND_MS = 1100;

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
  /** The hero's own: `createMotion` in `avatar.ts`. */
  motion: Motion;
  limbs: Limbs;
  /** Last frame's facing and whether it was off the ground, for a turn and a landing. */
  facing: THREE.Vector3;
  airborne: boolean;
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
  /**
   * How we look, as `encodeAppearance` writes it: sent with every connection
   * and, while one is open, to everyone at once.
   */
  setLook(code: string): void;
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

/** The name kept on this device, which the next connection sends. */
export function storedName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

/**
 * A name as the relay will take it: printable, one line, twenty characters.
 * The relay cleans it again (`cleanName` in `server/src/index.ts`); this is
 * so that what the field shows is what the others will see.
 */
export const cleanName = (name: string): string => name.replace(/[\p{C}<>]/gu, '').trim().slice(0, 20);

/**
 * Keeps a name for the next connection without a connection of its own: the
 * traveller's card on the front door, before there are any peers to rename.
 */
export function storeName(name: string): string {
  const kept = cleanName(name);
  try {
    localStorage.setItem(NAME_KEY, kept);
  } catch {
    // Private mode; the name lasts this visit.
  }
  return kept;
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
  /** Every look the relay has told us, by id, kept past a drop for silence like the names. */
  const looks = new Map<string, string>();
  /** Ours, and when it last went out on the open socket. */
  let look = '';
  let lookSentAt = 0;
  /** The look the socket being opened carries in its address. */
  let lookInAddress = '';
  let lookTimer = 0;
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
  const cross = new THREE.Vector3();
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
      if (look !== '') address.searchParams.set('look', look);
      lookInAddress = look;
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
      // Changed while this socket was still connecting: its address has the old one.
      if (look !== lookInAddress) {
        lookSentAt = performance.now();
        open.send(JSON.stringify({ t: 'look', l: look }));
        stats.sent++;
      }
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
      looks.clear();
      setState('closed');
      setTimeout(connect, retry);
      retry = Math.min(RETRY_MS[1], Math.max(RETRY_MS[0], retry * 2));
    };
  }

  function receive(text: string): void {
    let message: { t?: unknown; id?: string; name?: string; s?: State; peers?: unknown[][]; looks?: unknown; look?: unknown; l?: unknown };
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
      // Before the rows: a peer is dressed on the frame it is first drawn, and
      // the look has to be known by then.
      if (typeof message.looks === 'object' && message.looks !== null) {
        for (const [id, code] of Object.entries(message.looks as Record<string, unknown>)) {
          if (typeof code === 'string') looks.set(id, code);
        }
      }
      for (const row of message.peers ?? []) {
        const [id, name, ...state] = row as [string, string, ...State];
        if (typeof name === 'string') names.set(id, name);
        heard(id, name, state, now);
      }
    } else if (message.t === 'in' && typeof message.id === 'string') {
      if (typeof message.name === 'string') names.set(message.id, message.name);
      if (typeof message.look === 'string') looks.set(message.id, message.look);
      peerOf(message.id, message.name ?? '');
    } else if (message.t === 'at' && typeof message.id === 'string' && Array.isArray(message.s)) {
      heard(message.id, null, message.s, now);
    } else if (message.t === 'look' && typeof message.id === 'string' && typeof message.l === 'string') {
      looks.set(message.id, message.l);
      // Undressed, and dressed again in the new clothes on the next frame it is drawn.
      const peer = peers.get(message.id);
      if (peer !== undefined) undress(peer);
    } else if (message.t === 'bye' && typeof message.id === 'string') {
      drop(message.id);
      names.delete(message.id);
      looks.delete(message.id);
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

  function undress(peer: Peer): void {
    if (peer.body === null) return;
    peer.holder.remove(peer.body.person.root);
    peer.body.motion.unlay();
    folk.release(peer.body.person);
    peer.body = null;
  }

  function drop(id: string): void {
    const peer = peers.get(id);
    if (peer === undefined) return;
    group.remove(peer.holder);
    undress(peer);
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
  const drawn = { position: new THREE.Vector3(), forward: new THREE.Vector3(), speed: 0, state: 'foot' as PlayerState, airborne: false };
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
      drawn.airborne = newest.airborne;
      return drawn;
    }
    const t = THREE.MathUtils.clamp((at - a.at) / Math.max(1, b.at - a.at), 0, 1);
    drawn.position.lerpVectors(a.position, b.position, t);
    drawn.forward.lerpVectors(a.forward, b.forward, t);
    drawn.speed = a.speed + (b.speed - a.speed) * t;
    drawn.state = t < 0.5 ? a.state : b.state;
    drawn.airborne = t < 0.5 ? a.airborne : b.airborne;
    return drawn;
  }

  function dressed(peer: Peer): Body | null {
    if (peer.body !== null) return peer.body;
    // At the hero's own height, never a child's or a random adult's: a peer
    // walks with the hero's stride and wears its name at the hero's head.
    // As they chose to look, or, with no look or one this build cannot read,
    // as the crowd.
    const appearance = decodeAppearance(looks.get(peer.id));
    const person =
      appearance !== null
        ? folk.wear(appearance, AVATAR_HEIGHT)
        : folk.dress(`peer:${peer.id}`, 'atlantic-europe', undefined, AVATAR_HEIGHT);
    if (person === null) return null;
    // Read in the rest pose, before any clip has moved a bone.
    const limbs = limbsOf(person);
    person.root.traverse((object) => {
      if ((object as THREE.Mesh).isMesh) object.castShadow = true;
    });
    peer.holder.add(person.root);
    peer.body = { person, motion: createMotion(person), limbs, facing: new THREE.Vector3(), airborne: false };
    return peer.body;
  }

  /**
   * On foot, played exactly as the hero is: the walk and the run blended by
   * speed, the turn on the spot, the jump and the knees giving at its landing.
   * How hard a peer landed is not on the wire, so every landing is an
   * ordinary jump's.
   */
  function stride(body: Body, dt: number, speed: number, airborne: boolean): void {
    let turn = 0;
    if (dt > 0 && body.facing.lengthSq() > 0) {
      cross.crossVectors(body.facing, forward);
      turn = Math.atan2(cross.dot(up), body.facing.dot(forward)) / dt;
    }
    body.facing.copy(forward);
    if (body.airborne && !airborne) body.motion.land(0);
    body.airborne = airborne;
    body.motion.foot(dt, speed, airborne, { turn });
  }

  /**
   * In a seat, whose frame the holder has just been put on: the idle above the
   * waist, the legs folded as the hero's are (`avatar.ts`'s `sit`) unless the
   * seat is stood at, and the character's own hips moved onto the frame.
   */
  function seat(peer: Peer, body: Body, dt: number, pose: 'sit' | 'stand'): void {
    const root = body.person.root;
    body.motion.still(dt);
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
        // A swimmer's position is the water's surface, which is where the
        // swimming clips are drawn from.
        if (state.state === 'foot') stride(body, dt, state.speed, state.airborne);
        else if (state.state === 'swim') body.motion.swim(dt, state.speed);
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
      const kept = cleanName(name);
      if (kept === stats.name) return kept;
      stats.name = storeName(kept);
      // The relay learns a name only as a socket opens, so a rename is a
      // reconnection, straight away rather than after the backoff.
      retry = 0;
      socket?.close();
      return kept;
    },
    setLook(code) {
      if (code === look) return;
      look = code;
      // The next connection carries it in its address; the open one is told
      // now, or as soon as the relay would take another.
      window.clearTimeout(lookTimer);
      const sendLook = (): void => {
        if (socket === null || socket.readyState !== WebSocket.OPEN) return;
        lookSentAt = performance.now();
        socket.send(JSON.stringify({ t: 'look', l: look }));
        stats.sent++;
      };
      const wait = LOOK_SEND_MS - (performance.now() - lookSentAt);
      if (wait <= 0) sendLook();
      else lookTimer = window.setTimeout(sendLook, wait);
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
