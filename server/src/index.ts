/**
 * The peers relay.
 *
 * The world is a function of the data and a seed, so nothing about it is sent:
 * a player is a position, a heading, what they ride, how fast and whether they
 * are in the air, and this passes that on to everyone else and nothing more.
 *
 * One room for the whole planet. At the rates below a room of 100 is 1,000
 * messages a second in and 99,000 out, which one Durable Object carries; past
 * that the planet splits into rooms by cell, and `src/peers.ts` is the side
 * that would choose one.
 *
 * The wire is JSON and it is `src/peers.ts`'s too — see `State` there:
 *
 * - client -> server: `[x, y, z, fx, fy, fz, vehicle, speed, airborne]`
 * - server -> client:
 *   `{ t: 'hi', id, peers: [[id, name, ...state]] }` once, on joining;
 *   `{ t: 'in', id, name }` when someone joins;
 *   `{ t: 'at', id, s: state }` whenever someone moves;
 *   `{ t: 'bye', id }` when someone leaves.
 */
import { DurableObject } from 'cloudflare:workers';

/** How many sockets one room accepts; the next is refused with 1013. */
const MAX_PLAYERS = 100;
/** A state closer to the last than this, in milliseconds, is dropped. The client sends every 100. */
const MIN_INTERVAL_MS = 60;
/** Longer than any valid state, which is nine short numbers. */
const MAX_MESSAGE = 256;
/**
 * A radius nobody can be at: under the lowest sea floor or over the plane's
 * ceiling. `PLANET_RADIUS` is 16,000 and the ceiling 1.45 of it (23,200),
 * with room either side; restated here because the relay imports nothing from
 * the game.
 */
const MIN_RADIUS = 15_000;
const MAX_RADIUS = 25_000;
/** Faster than the plane's 3,400 at the ceiling times its boost. */
const MAX_SPEED = 6_000;
const MAX_NAME = 20;

type State = [number, number, number, number, number, number, number, number, number];

interface Attachment {
  id: string;
  name: string;
  state: State | null;
}

function parseState(text: string): State | null {
  if (text.length > MAX_MESSAGE) return null;
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (!Array.isArray(value) || value.length !== 9) return null;
  if (!value.every((n) => typeof n === 'number' && Number.isFinite(n))) return null;
  const [x, y, z, fx, fy, fz, vehicle, speed, airborne] = value as number[] as State;
  const radius = Math.hypot(x, y, z);
  if (radius < MIN_RADIUS || radius > MAX_RADIUS) return null;
  const heading = Math.hypot(fx, fy, fz);
  if (heading < 0.5 || heading > 1.5) return null;
  if (vehicle !== 0 && vehicle !== 1 && vehicle !== 2) return null;
  if (speed < 0 || speed > MAX_SPEED) return null;
  if (airborne !== 0 && airborne !== 1) return null;
  const round = (n: number, places: number) => Math.round(n * 10 ** places) / 10 ** places;
  return [
    round(x, 2), round(y, 2), round(z, 2),
    round(fx, 3), round(fy, 3), round(fz, 3),
    vehicle, round(speed, 1), airborne,
  ];
}

/** Printable, single-line, short; a blank one becomes a traveller with a number. */
function cleanName(raw: string | null): string {
  const name = (raw ?? '').replace(/[\p{C}<>]/gu, '').trim().slice(0, MAX_NAME);
  return name === '' ? `Traveller ${Math.floor(Math.random() * 900 + 100)}` : name;
}

export class Room extends DurableObject<Env> {
  /** When each socket's last state was accepted. Lost on hibernation, which only forgives one message. */
  private readonly last = new Map<WebSocket, number>();

  override async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('Expected a WebSocket', { status: 426 });
    const sockets = this.ctx.getWebSockets();
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    this.ctx.acceptWebSocket(server);
    if (sockets.length >= MAX_PLAYERS) {
      server.close(1013, 'The room is full');
      return new Response(null, { status: 101, webSocket: client });
    }

    const id = crypto.randomUUID().slice(0, 8);
    const name = cleanName(new URL(request.url).searchParams.get('name'));
    server.serializeAttachment({ id, name, state: null } satisfies Attachment);

    const peers: unknown[] = [];
    for (const socket of sockets) {
      const other = socket.deserializeAttachment() as Attachment | null;
      if (other?.state) peers.push([other.id, other.name, ...other.state]);
    }
    server.send(JSON.stringify({ t: 'hi', id, peers }));
    this.broadcast(JSON.stringify({ t: 'in', id, name }), server);
    return new Response(null, { status: 101, webSocket: client });
  }

  override async webSocketMessage(socket: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== 'string') return;
    const now = Date.now();
    if (now - (this.last.get(socket) ?? 0) < MIN_INTERVAL_MS) return;
    const state = parseState(message);
    if (state === null) return;
    this.last.set(socket, now);
    const self = socket.deserializeAttachment() as Attachment | null;
    if (self === null) return;
    self.state = state;
    socket.serializeAttachment(self);
    this.broadcast(JSON.stringify({ t: 'at', id: self.id, s: state }), socket);
  }

  override async webSocketClose(socket: WebSocket, code: number): Promise<void> {
    this.leave(socket);
    try {
      socket.close(code === 1005 ? 1000 : code, 'Bye');
    } catch {
      // Already closed from the other side.
    }
  }

  override async webSocketError(socket: WebSocket): Promise<void> {
    this.leave(socket);
  }

  private leave(socket: WebSocket): void {
    this.last.delete(socket);
    const self = socket.deserializeAttachment() as Attachment | null;
    if (self !== null) this.broadcast(JSON.stringify({ t: 'bye', id: self.id }), socket);
  }

  private broadcast(text: string, except: WebSocket): void {
    for (const socket of this.ctx.getWebSockets()) {
      if (socket === except) continue;
      try {
        socket.send(text);
      } catch {
        // A socket that is closing; its own close event cleans it up.
      }
    }
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/ws') return env.ROOM.get(env.ROOM.idFromName('earth')).fetch(request);
    return new Response('atlas peers\n', { headers: { 'content-type': 'text/plain' } });
  },
} satisfies ExportedHandler<Env>;
