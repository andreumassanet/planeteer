/**
 * The link's shared state. The relay connection, the roster of peers and the
 * drawing of each are built over one `PeersCore`.
 */
import * as THREE from 'three';
import type { Folk } from '../folk.ts';
import type { FleetSeats } from '../craft/contract.ts';
import { PLANET_RADIUS } from '../globe.ts';
import { WATERLINE } from '../vehicles.ts';
import { RETRY_MS } from './constants.ts';
import { pageKey, storedName } from './names.ts';
import type { Peer, PeerMark, PeerSeat, PeerSelf, PeersOptions, PeersStats, RelayMessage } from './types.ts';

export interface PeersFields {
  /** Ours as the relay last heard them, and when they went. */
  flagsSent: number;
  flagsSentAt: number;
  /** Our look, and when it last went out on the open socket. */
  look: string;
  lookSentAt: number;
  /** The look the socket being opened carries in its address. */
  lookInAddress: string;
  lookTimer: number;
  seats: FleetSeats | null;
  seatOf: ((id: string) => PeerSeat | null) | null;
  socket: WebSocket | null;
  retry: number;
  sentAt: number;
  nearestMoving: number;
  /** The player `update` was last handed, so a new socket can say where we are at once. */
  lastPlayer: PeerSelf | null;
  /** Set by `dispose`: no socket opens again. */
  disposed: boolean;
  retryTimer: number;
  /** One canopy built once and cloned for every peer under one: the clones share its buffers. */
  canopyShape: THREE.Object3D | null;
}

export interface PeersCore {
  readonly url: string;
  readonly folk: Folk;
  readonly bodyId: string;
  readonly onEarth: boolean;
  readonly waterline: number;
  readonly fields: PeersFields;
  readonly group: THREE.Group;
  readonly peers: Map<string, Peer>;
  readonly marks: PeerMark[];
  /** The marks' objects, rewritten each frame rather than made anew. */
  readonly markPool: PeerMark[];
  /**
   * Every name, look and set of flags the relay has told us, by id: a peer
   * dropped for silence and heard again is only an `at`, which carries none.
   */
  readonly names: Map<string, string>;
  readonly looks: Map<string, string>;
  readonly flagsById: Map<string, number>;
  readonly stats: PeersStats;
  readonly messageListeners: Set<(message: RelayMessage) => void>;
  readonly stateListeners: Set<(state: PeersStats['state']) => void>;
  readonly key: string;
  readonly basis: THREE.Matrix4;
  readonly local: THREE.Matrix4;
  readonly scale: THREE.Vector3;
  readonly up: THREE.Vector3;
  readonly forward: THREE.Vector3;
  readonly right: THREE.Vector3;
  readonly cross: THREE.Vector3;
  readonly hipAt: THREE.Vector3;
}

export function createPeersCore(url: string, folk: Folk, options: PeersOptions): PeersCore {
  const bodyId = options.body ?? 'earth';
  const group = new THREE.Group();
  group.name = 'peers';
  return {
    url,
    folk,
    bodyId,
    onEarth: bodyId === 'earth',
    waterline: (options.radius ?? PLANET_RADIUS) + WATERLINE,
    fields: {
      flagsSent: 0,
      flagsSentAt: 0,
      look: '',
      lookSentAt: 0,
      lookInAddress: '',
      lookTimer: 0,
      seats: null,
      seatOf: null,
      socket: null,
      retry: RETRY_MS[0],
      sentAt: 0,
      nearestMoving: Infinity,
      lastPlayer: null,
      disposed: false,
      retryTimer: 0,
      canopyShape: null,
    },
    group,
    peers: new Map(),
    marks: [],
    markPool: [],
    names: new Map(),
    looks: new Map(),
    flagsById: new Map(),
    stats: { state: 'off', id: null, name: storedName(), peers: 0, drawn: 0, sent: 0, received: 0 },
    messageListeners: new Set(),
    stateListeners: new Set(),
    key: pageKey(),
    basis: new THREE.Matrix4(),
    local: new THREE.Matrix4(),
    scale: new THREE.Vector3(),
    up: new THREE.Vector3(),
    forward: new THREE.Vector3(),
    right: new THREE.Vector3(),
    cross: new THREE.Vector3(),
    hipAt: new THREE.Vector3(),
  };
}
