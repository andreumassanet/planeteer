/**
 * The views the guild's conversations and the Field Guide read
 * (`guild/services.ts`, `field-guide/types.ts`), made over the progression
 * and whatever world's game hosts them (`ExplorersHost`): a world without
 * jobs or courses answers with none, and the conversations say so.
 */
import * as THREE from 'three';
import type { Cosmetic } from '../cosmetics/catalogue.ts';
import type { FieldGuide } from '../field-guide.ts';
import type { FieldGuideServices, RewardItem } from '../field-guide/types.ts';
import type { GuildRole } from '../guild/roles.ts';
import type { GuildServices, LoreTopicView, QuestView, Suggestion } from '../guild/services.ts';
import type { Progress } from '../progress.ts';
import { lapText } from '../rings/store.ts';
import { unitAt } from '../sphere.ts';
import { isTouch } from '../touch.ts';
import type { ExplorersHost } from './types.ts';

type Cosmetics = typeof import('../cosmetics.ts');
type Lore = typeof import('../guild/lore.ts');
type Leaderboard = typeof import('../leaderboard.ts');

/** How near a landmark the cartographer suggests it, as a share of the radius. */
const SUGGEST_REACH = 1.875;
/** A guild nearer than this, units, is the one you are in: the cartographer suggests the next. */
const GUILD_HERE = 400;

const SLOT_WORD: Readonly<Record<string, string>> = { hat: 'Hat', back: 'Back', trail: 'Trail', title: 'Title', canopy: 'Canopy', pet: 'Companion' };

/** A seeded pick, the same for the same seed. */
function pick<T>(list: readonly T[], seed: string): T {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) hash = Math.imul(hash ^ seed.charCodeAt(i), 16777619);
  return list[(hash >>> 0) % list.length]!;
}

export function wearableName(item: Cosmetic): string {
  return `${item.name} (${SLOT_WORD[item.slot] ?? item.slot})`;
}

export interface ServiceDeps {
  host: ExplorersHost;
  progress: Progress;
  cosmetics: Cosmetics;
  lore: Lore;
  leaderboard: Leaderboard;
  distanceText(units: number): string;
  emit: Progress['emit'];
  /** What is earned to wear, kept by the runtime; `relearn` works it out again. */
  wear: { unlocked: ReadonlySet<string>; fresh: Set<string>; relearn(): ReadonlySet<string> };
  hall: { show(): void };
  fieldGuide(): FieldGuide;
}

/** The guilds' towns as directions, and the nearest of them to a point. */
export function guildFinder(host: ExplorersHost): {
  directions: readonly THREE.Vector3[];
  /** The nearest guild to `from` that is at least `beyond` units off. */
  nearest(from: THREE.Vector3, beyond?: number): { index: number; units: number } | null;
} {
  const directions = host.guildPlaces.map((index) => unitAt(host.places[index]!.lat, host.places[index]!.lon, new THREE.Vector3()));
  return {
    directions,
    nearest(from, beyond = 0) {
      let best: { index: number; units: number } | null = null;
      for (let i = 0; i < directions.length; i++) {
        const units = directions[i]!.angleTo(from) * host.radius;
        if (units < beyond || (best !== null && units >= best.units)) continue;
        best = { index: host.guildPlaces[i]!, units };
      }
      return best;
    },
  };
}

export function createServices(deps: ServiceDeps): { services: GuildServices; field: FieldGuideServices } {
  const { host, progress, cosmetics, lore, leaderboard, distanceText, emit, wear, hall } = deps;
  const { places, radius } = host;
  const guilds = guildFinder(host);
  const scratch = new THREE.Vector3();
  const unitsTo = (lat: number, lon: number, from: THREE.Vector3): number => unitAt(lat, lon, scratch).angleTo(from) * radius;

  const bearingWords = (index: number): string => {
    const place = places[index]!;
    return `${place.name} · ${distanceText(unitsTo(place.lat, place.lon, host.traveller().position))}`;
  };

  const questView = (entry: ReturnType<Progress['quests']['list']>[number]): QuestView => ({
    id: entry.quest.id,
    giver: entry.quest.giver,
    title: entry.quest.title,
    offer: entry.quest.offer,
    thanks: entry.quest.thanks,
    objectives: entry.objectives,
    xp: entry.quest.xp,
    unlocks: cosmetics.COSMETICS.filter((item) => item.unlock.kind === 'quest' && item.unlock.id === entry.quest.id).map((item) => item.name),
    // A quest waiting for its giver from the start is one to go and see.
    state: entry.status === 'active' && entry.quest.auto === true ? 'offered' : entry.status,
  });

  const topicView = (topic: (typeof lore.TOPICS)[number]): LoreTopicView => ({
    id: topic.id,
    title: topic.title,
    icon: topic.icon,
    role: topic.role,
    summary: topic.summary,
    pages: topic.pages.map((page) => ({ heading: page.heading, text: isTouch() && page.touch !== undefined ? page.touch : page.text })),
  });

  const commissions = (): ReturnType<GuildServices['commissions']> => {
    const today = progress.today();
    return {
      list: today.commissions.map((entry) => ({
        id: entry.commission.id,
        title: entry.commission.title,
        done: entry.done,
        count: entry.commission.target,
        complete: entry.complete,
        xp: entry.commission.xp,
      })),
      bonus: today.bonus,
      streak: today.streak,
    };
  };

  const milestones = (): ReturnType<GuildServices['milestones']> =>
    progress.milestones().map((m) => ({ id: m.id, title: m.title, description: m.description, icon: m.icon, tier: m.tier, value: m.value, next: m.next ?? null, unit: m.unit }));

  const level = (): ReturnType<GuildServices['level']> => {
    const info = progress.level();
    return { level: info.level, xp: info.xp, from: info.from, to: info.to };
  };

  /** A topic read for the first time; read again, nothing to tell. */
  function readTopic(topic: string): void {
    if (!progress.isRead(topic)) emit({ t: 'topic', id: topic });
  }

  function suggestions(): Suggestion[] {
    const out: Suggestion[] = [];
    const here = host.traveller().position;
    const landmarks = host.landmarks()
      .map((landmark) => ({ landmark, units: unitsTo(landmark.lat, landmark.lon, here) }))
      .filter((entry) => entry.units < SUGGEST_REACH * radius)
      .sort((a, b) => a.units - b.units)
      .slice(0, 3);
    for (const { landmark, units } of landmarks) {
      out.push({ id: `l:${landmark.id}`, name: landmark.name, kind: 'landmark', detail: `${host.countryName(landmark.iso)} · ${distanceText(units)}` });
    }
    // The nearest towns in nations not stamped yet.
    const stamped = host.stamped();
    const towns = new Map<string, { index: number; units: number }>();
    for (let i = 0; i < places.length; i++) {
      const place = places[i]!;
      if (place.iso === '' || stamped.has(place.iso) || place.pop < host.suggestPopulation) continue;
      const units = unitsTo(place.lat, place.lon, here);
      const known = towns.get(place.iso);
      if (known === undefined || units < known.units) towns.set(place.iso, { index: i, units });
    }
    for (const { index, units } of [...towns.values()].sort((a, b) => a.units - b.units).slice(0, 2)) {
      const place = places[index]!;
      out.push({ id: `t:${index}`, name: `${place.name}, ${host.countryName(place.iso)}`, kind: 'country', detail: `a new stamp · ${distanceText(units)}` });
    }
    const guild = guilds.nearest(here, GUILD_HERE);
    if (guild !== null) out.push({ id: `g:${guild.index}`, name: `The guild in ${places[guild.index]!.name}`, kind: 'guild', detail: bearingWords(guild.index) });
    return out;
  }

  const services: GuildServices = {
    city: (square) => places[square]?.name ?? 'the city',
    nameOf: (key) => pick(lore.NAMES, key),
    greeting: (role, first, seed) => pick(first ? lore.GREETINGS[role].first : lore.GREETINGS[role].again, `${seed}:${Math.floor(Date.now() / 600000)}`),
    farewell: (role, seed) => pick(lore.GREETINGS[role].farewell, `${seed}:${Date.now() >> 16}`),
    topics: (role) => lore.TOPICS.filter((topic) => role === null || topic.role === role).map(topicView),
    quests: (role) => progress.quests.list(role ?? undefined).filter((entry) => entry.status !== 'locked').map(questView),
    accept: (id) => void progress.quests.accept(id),
    turnIn(id) {
      // Before the hand-in: the banner's notice relearns what is worn as it is told.
      const before = wear.unlocked;
      const handed = progress.quests.turnIn(id);
      if (handed === null) return null;
      const after = wear.relearn();
      const gained = cosmetics.COSMETICS.filter((item) => after.has(item.id) && !before.has(item.id)).map(wearableName);
      return { xp: handed.xp, unlocks: gained, levelUp: handed.levelUp };
    },
    commissions,
    level,
    milestones,
    jobs: () => host.jobs?.briefs() ?? [],
    track: (id) => host.jobs?.track(id) ?? false,
    courses() {
      return (host.courses?.near() ?? []).map((course) => ({
        id: course.id,
        name: course.name,
        kind: course.kind,
        distance: distanceText(course.units),
        best: course.best === null ? null : { time: lapText(course.best.ms), medal: course.best.medal },
      }));
    },
    lead: (id) => host.courses?.lead(id),
    courseBoard(id) {
      if (host.courses === undefined || !leaderboard.leaderboardsAvailable()) return null;
      return leaderboard.courseBoardElement(id, host.courses.best(id));
    },
    wardrobe() {
      const unlocked = wear.relearn();
      const locked = cosmetics.COSMETICS.filter((item) => !unlocked.has(item.id));
      // The nearest few: by level first, the rest after.
      locked.sort((a, b) => (a.unlock.kind === 'level' ? a.unlock.level : 99) - (b.unlock.kind === 'level' ? b.unlock.level : 99));
      return {
        unlocked: unlocked.size,
        total: cosmetics.COSMETICS.length,
        fresh: cosmetics.COSMETICS.filter((item) => wear.fresh.has(item.id)).map(wearableName),
        next: locked.slice(0, 4).map((item) => ({ name: wearableName(item), condition: cosmetics.conditionText(item) })),
      };
    },
    openWardrobe: () => {
      wear.fresh.clear();
      host.openWardrobe();
    },
    hallOfFame: () => hall.show(),
    account() {
      const account = host.account;
      const name = account?.signedIn() ?? null;
      return { available: account?.available() ?? false, signedIn: name !== null, name };
    },
    signIn: () => host.account?.signIn(),
    openPassport: () => host.openPassport(),
    openJournal: (tab) => deps.fieldGuide().show(tab),
    suggestions,
    head(id) {
      const [kind, rest] = [id.slice(0, 1), id.slice(2)];
      if (kind === 'l') {
        const landmark = host.landmarks().find((one) => one.id === rest);
        if (landmark !== undefined) {
          host.mark(landmark.lat, landmark.lon, landmark.name, true);
          emit({ t: 'destination', landmark: landmark.id });
        }
        return;
      }
      const place = places[Number(rest)];
      if (place === undefined) return;
      host.mark(place.lat, place.lon, kind === 'g' ? `Explorers’ Guild · ${place.name}` : place.name, false);
    },
    openMap: () => host.openMap(),
    known: (role) => progress.known(role),
    met: (role) => emit({ t: 'npc', role }),
    read: (topic) => readTopic(topic),
    visited: (square) => emit({ t: 'guild', place: places[square]?.name ?? String(square) }),
    mark(role: GuildRole) {
      const marker = progress.quests.marker(role);
      if (marker === 'ready') return 'ready';
      if (marker === 'offer') return 'quest';
      return role === 'dispatcher' && !progress.today().allDone ? 'daily' : null;
    },
  };

  const field: FieldGuideServices = {
    name: () => host.name(),
    level,
    quests: () => progress.quests.list().map(questView),
    commissions,
    milestones,
    topics: () => services.topics(null),
    isRead: (topic) => progress.isRead(topic),
    read: (topic) => readTopic(topic),
    rewards() {
      const unlocked = wear.relearn();
      const byLevel = new Map<number, RewardItem[]>();
      for (const item of cosmetics.COSMETICS) {
        if (item.unlock.kind !== 'level') continue;
        const list = byLevel.get(item.unlock.level) ?? [];
        list.push({ name: item.name, slot: SLOT_WORD[item.slot] ?? item.slot, unlocked: unlocked.has(item.id) });
        byLevel.set(item.unlock.level, list);
      }
      return [...byLevel].sort((a, b) => a[0] - b[0]).map(([at, items]) => ({ level: at, items }));
    },
    others() {
      const unlocked = wear.unlocked;
      return cosmetics.COSMETICS.filter((item) => item.unlock.kind !== 'level' && item.unlock.kind !== 'free').map((item) => ({
        name: item.name,
        slot: SLOT_WORD[item.slot] ?? item.slot,
        unlocked: unlocked.has(item.id),
        condition: cosmetics.conditionText(item),
      }));
    },
    openWardrobe: () => {
      deps.fieldGuide().hide();
      services.openWardrobe();
    },
    nearestGuild() {
      const near = guilds.nearest(host.traveller().position);
      return near === null ? null : bearingWords(near.index);
    },
    headToGuild() {
      const near = guilds.nearest(host.traveller().position);
      if (near === null) return;
      const place = places[near.index]!;
      host.mark(place.lat, place.lon, `Explorers’ Guild · ${place.name}`, false);
      deps.fieldGuide().hide();
      host.announce(`Heading for the Explorers’ Guild in ${place.name}`, 'star');
    },
  };

  return { services, field };
}
