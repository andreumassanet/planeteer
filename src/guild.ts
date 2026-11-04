/**
 * The Explorers' Guild as it is met: in the square a big city keeps for it
 * (`settlements`, `guild/sites.ts`), six people stand by its hall — the
 * guide, the dispatcher, the course marshal, the outfitter, the archivist and
 * the cartographer (`guild/roles.ts`) — in their role's uniform, with their
 * name over their head and a mark over that when they have something for
 * you: a gold `!` for a quest to take, a gold `?` for one to hand in, a blue
 * `!` while today's commissions are open (`guild/markers.ts`).
 *
 * `E` beside one opens a conversation (`guild/dialogue.ts`, the words in
 * `guild/conversations.ts`): they greet you, hand out and take back the
 * quests of the Explorer's Path, and do what their role is for, through the
 * game's own systems (`guild/services.ts`). The square's two boards answer
 * `E` too: the noticeboard is the dispatcher's list, the Hall of Fame the
 * leaderboards.
 */
import * as THREE from 'three';
import { AVATAR_HEIGHT } from './stature.ts';
import type { Folk } from './folk.ts';
import { root, markOf } from './guild/conversations.ts';
import { createDialogue } from './guild/dialogue.ts';
import type { Dialogue, DialogueOptions } from './guild/dialogue.ts';
import { createMarks } from './guild/markers.ts';
import type { MarkKind } from './guild/markers.ts';
import { createGuildPeople, guildKey } from './guild/people.ts';
import type { GuildPeople, GuildSquareLike } from './guild/people.ts';
import { GUILD_ROLES, ROLE_INFO } from './guild/roles.ts';
import type { GuildRole } from './guild/roles.ts';
import type { GuildServices } from './guild/services.ts';
import { createGuildTags } from './guild/tags.ts';
import { uniformOf } from './guild/uniforms.ts';
import type { GuildTag } from './guild/tags.ts';
import { voiceOf } from './voice.ts';

export type { GuildRole } from './guild/roles.ts';
export type { GuildServices } from './guild/services.ts';
export { GUILD_ROLES, ROLE_INFO } from './guild/roles.ts';

/** How near a guild person you have to be to talk to them, units. */
export const GUILD_TALK_REACH = AVATAR_HEIGHT * 1.35;
/** How near a board, units, for `E` to read it. */
const BOARD_REACH = AVATAR_HEIGHT * 1.6;
/** How far from a square's middle still counts as standing in it, units. */
const IN_SQUARE = 40;
/** How often the marks are asked again, s: the quests behind them change only on an event. */
const MARKS_EVERY = 0.5;

/** A square as the guild reads it: its people's spots, its boards and its middle. */
export interface GuildSquareView extends GuildSquareLike {
  centre: THREE.Vector3;
  boards: readonly { kind: 'jobs' | 'fame'; at: THREE.Vector3; normal: THREE.Vector3 }[];
}

export interface GuildOffer {
  kind: 'person' | 'board';
  /** A person's key or a board's kind. */
  key: string;
  label: string;
  /** Where the prompt's tag hangs. */
  at: THREE.Vector3;
  /** How far, units, against the other offers. */
  gap: number;
}

export interface GuildOptions {
  folk: Folk;
  services: GuildServices;
  /** The guild squares raised near the player now. */
  squares(): readonly GuildSquareView[];
  /** The noticeboard and the Hall of Fame, read with `E`. */
  readBoard(kind: 'jobs' | 'fame', square: number): void;
  parent: HTMLElement;
  dialogue?: DialogueOptions;
}

export interface GuildFrame {
  now: number;
  dt: number;
  /** The player's feet, and whether they are on foot. */
  position: THREE.Vector3;
  afoot: boolean;
  camera: THREE.Camera;
  width: number;
  height: number;
}

export interface Guild {
  readonly group: THREE.Group;
  readonly people: GuildPeople;
  readonly dialogue: Dialogue;
  /** What `E` would do here, or null: talk to a guild person, or read a board. */
  readonly offer: GuildOffer | null;
  /** Set by the prompts each frame: whether `E` is the guild's. */
  prompted: boolean;
  /** Whether a conversation is up. */
  readonly talking: boolean;
  frame(frame: GuildFrame): void;
  use(): void;
  /** Talks to a guild person of a role: the one of `square` when given and standing, else the first standing (the debug console's). */
  talkTo(role: GuildRole, square?: number): boolean;
  /** Which squares have been stood in this session. */
  readonly visited: ReadonlySet<number>;
  readonly stats: { squares: number; people: number; marks: number };
  dispose(): void;
}

export function createGuild(options: GuildOptions): Guild {
  const { services } = options;
  const group = new THREE.Group();
  group.name = 'guild';
  const people = createGuildPeople(options.folk);
  const marks = createMarks();
  group.add(people.group, marks.group);
  const tags = createGuildTags(options.parent);
  const dialogue = createDialogue({
    ...options.dialogue,
    onClose: () => {
      speaking = null;
      options.dialogue?.onClose?.();
    },
  });
  let offer: GuildOffer | null = null;
  let speaking: string | null = null;
  let marksFor = 0;
  const markByRole = new Map<GuildRole, MarkKind | null>();
  const wantedMarks: { key: string; kind: MarkKind; crown: THREE.Vector3 }[] = [];
  const tagList: GuildTag[] = [];
  const visited = new Set<number>();
  const stats = { squares: 0, people: 0, marks: 0 };
  const offerAt = new THREE.Vector3();
  let squares: readonly GuildSquareView[] = [];

  function talk(key: string, role: GuildRole, square: number): void {
    const first = !services.known(role);
    services.met(role);
    speaking = key;
    const info = ROLE_INFO[role];
    const woman = uniformOf(role, key).body === 'woman';
    dialogue.start(
      {
        name: services.nameOf(key),
        role: info.title,
        icon: info.icon,
        where: `Explorers’ Guild · ${services.city(square)}`,
        voice: voiceOf(key, 'adult', woman, 'chatty'),
      },
      root({ services, role, key, square, first }, true),
    );
    marksFor = 0;
  }

  /** The nearest thing `E` would reach: a guild person, else a board. */
  function nearestOffer(position: THREE.Vector3): GuildOffer | null {
    const near = people.nearest(position, GUILD_TALK_REACH);
    if (near !== null) {
      offerAt.copy(near.crown);
      return { kind: 'person', key: near.key, label: `Talk to ${services.nameOf(near.key)}`, at: offerAt, gap: near.distance };
    }
    let best: GuildOffer | null = null;
    for (const square of squares) {
      for (const board of square.boards) {
        const gap = board.at.distanceTo(position);
        if (gap > BOARD_REACH || (best !== null && gap > best.gap)) continue;
        offerAt.copy(board.at);
        best = { kind: 'board', key: `${board.kind}:${square.index}`, label: board.kind === 'jobs' ? 'Read the job board' : 'See the Hall of Fame', at: offerAt, gap };
      }
    }
    return best;
  }

  return {
    group,
    people,
    dialogue,
    get offer() {
      return offer;
    },
    prompted: false,
    get talking() {
      return dialogue.open;
    },
    visited,
    stats,
    frame(frame) {
      squares = options.squares();
      people.update(frame.dt, squares, frame.position, speaking);
      for (const square of squares) {
        if (visited.has(square.index) || square.centre.distanceTo(frame.position) > IN_SQUARE) continue;
        visited.add(square.index);
        services.visited(square.index);
      }
      // The marks: one answer a role, asked twice a second and whenever a conversation ends.
      marksFor -= frame.dt;
      if (marksFor <= 0) {
        marksFor = MARKS_EVERY;
        for (const role of GUILD_ROLES) markByRole.set(role, markOf(services, role));
      }
      wantedMarks.length = 0;
      tagList.length = 0;
      for (const person of people.standing) {
        const kind = markByRole.get(person.role) ?? null;
        if (kind !== null && person.key !== speaking) wantedMarks.push({ key: person.key, kind, crown: person.crown });
        tagList.push({ role: person.role, name: services.nameOf(person.key), crown: person.crown });
      }
      marks.update(frame.now, wantedMarks, frame.camera.position);
      tags.update(tagList, frame.camera, frame.width, frame.height, speaking === null ? null : services.nameOf(speaking));
      offer = frame.afoot && !dialogue.open ? nearestOffer(frame.position) : null;
      dialogue.update();
      stats.squares = people.stats.squares;
      stats.people = people.stats.people;
      stats.marks = wantedMarks.length;
    },
    use() {
      if (offer === null) return;
      if (offer.kind === 'person') {
        const person = people.standing.find((candidate) => candidate.key === offer!.key);
        if (person !== undefined) talk(person.key, person.role, person.square);
        return;
      }
      const [kind, square] = offer.key.split(':') as ['jobs' | 'fame', string];
      options.readBoard(kind, Number(square));
    },
    talkTo(role, square) {
      const person =
        people.standing.find((candidate) => candidate.role === role && candidate.square === square) ??
        (square === undefined ? people.standing.find((candidate) => candidate.role === role) : undefined);
      if (person === undefined) return false;
      talk(person.key, role, person.square);
      return true;
    },
    dispose() {
      dialogue.dispose();
      tags.dispose();
      marks.dispose();
      people.dispose();
      group.removeFromParent();
    },
  };
}

export { guildKey };
