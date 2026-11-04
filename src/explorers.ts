/**
 * The progression, the Explorers' Guild, the Field Guide, the banner and what
 * follows a traveller, run in a world's game: Earth's (`app/guild.ts`) and
 * every other world's (`worlds/shell/explorers.ts`) build the same runtime
 * over their own systems (`ExplorersHost`), so a world is a different place
 * and never a different game. Reached by dynamic import only.
 *
 * There is one progression a page (`createProgress` over the device's
 * store): the first runtime makes it, and a runtime made while another
 * stands takes it over, its records and its notices, until it is disposed
 * and hands it back. The level and the quests carry from world to world.
 *
 * - `explorers/services.ts`: the views the conversations and the Field Guide read.
 * - `explorers/followers.ts`: the trails and the companions.
 * - `explorers/fame-boards.ts`: the Hall of Fame painted in the squares near.
 */
import { encodeAppearance } from './appearance.ts';
import type { Cosmetic } from './cosmetics/catalogue.ts';
import { setKnownXp } from './explorer-level.ts';
import { labelOf } from './controls.ts';
import type { MinimapSpot } from './minimap/types.ts';
import type { Progress, ProgressNotice, ProgressRecords } from './progress.ts';
import { ROLE_INFO } from './guild/roles.ts';
import { isTouch } from './touch.ts';
import { createFameBoards } from './explorers/fame-boards.ts';
import { createFollowers } from './explorers/followers.ts';
import { createServices, guildFinder, wearableName } from './explorers/services.ts';
import type { Explorers, ExplorersHost } from './explorers/types.ts';

export type { ExplorerCourses, ExplorerJobs, ExplorerLandmark, ExplorerPeers, ExplorerTraveller, Explorers, ExplorersHost } from './explorers/types.ts';

/** How far a guild is still marked on the minimap's rim and the compass, as a share of the radius. */
const GUILD_RIM_REACH = 1.25;
/** Nearer than this, units, a guild is not marked on the rim: you are in it. */
const GUILD_RIM_NEAR = 120;
/** How often the spots are worked out again, s. */
const SPOTS_EVERY = 1;

/** The page's one progression, the records it reads now and the runtime that holds it. */
interface Holder {
  progress: Progress;
  records: () => ProgressRecords;
  owner: object;
}
let held: Holder | null = null;

/** The page's progression for `owner`, made on the first ask; the previous holder, to hand it back to. */
function take(owner: object, records: () => ProgressRecords, module: typeof import('./progress.ts')): { progress: Progress; previous: Omit<Holder, 'progress'> | null } {
  if (held !== null) {
    const previous = { records: held.records, owner: held.owner };
    held.records = records;
    held.owner = owner;
    held.progress.refresh(true);
    return { progress: held.progress, previous };
  }
  const holder: Holder = { progress: null as unknown as Progress, records, owner };
  holder.progress = module.createProgress({ records: () => holder.records(), storage: module.deviceCareerStore() });
  holder.progress.refresh(true);
  if (typeof addEventListener === 'function') addEventListener('pagehide', () => holder.progress.flush());
  held = holder;
  return { progress: holder.progress, previous: null };
}

export async function createExplorers(host: ExplorersHost): Promise<Explorers> {
  const [progressModule, guildModule, fieldModule, lore, bannerModule, cosmetics, leaderboard, chimeModule, { distanceText }] = await Promise.all([
    import('./progress.ts'),
    import('./guild.ts'),
    import('./field-guide.ts'),
    import('./guild/lore.ts'),
    import('./progress-banner.ts'),
    import('./cosmetics.ts'),
    import('./leaderboard.ts'),
    import('./rings/chime.ts'),
    import('./jobs.ts'),
  ]);
  const self = {};
  const { progress, previous } = take(self, host.records, progressModule);
  const active = (): boolean => held?.owner === self;
  setKnownXp(progress.level().xp);
  const emit: Progress['emit'] = (event) => progress.emit(event);
  const chime = chimeModule.createChime(() => (host.sound()?.node as GainNode | undefined) ?? null);

  // What can be worn, and what earns it.
  const wear = {
    unlocked: cosmetics.unlockedOf(progress.summary()) as ReadonlySet<string>,
    fresh: new Set<string>(),
    relearn(): ReadonlySet<string> {
      wear.unlocked = cosmetics.unlockedOf(progress.summary());
      return wear.unlocked;
    },
  };
  const hall = leaderboard.createHallOfFame({
    ...(host.account === undefined ? {} : { signIn: () => host.account!.signIn(), openAccount: () => host.account!.openAccount() }),
    lockTarget: host.lockTarget,
  });

  const { services, field } = createServices({ host, progress, cosmetics, lore, leaderboard, distanceText, emit, wear, hall, fieldGuide: () => fieldGuide });
  const fieldGuide = fieldModule.createFieldGuide({ services: field, lockTarget: host.lockTarget, onOpen: () => host.cue('book-open'), onClose: () => host.cue('book-close') });
  const guild = guildModule.createGuild({
    folk: host.folk,
    services,
    squares: () => host.squares(),
    readBoard(kind, square) {
      if (kind === 'fame') {
        hall.show();
        return;
      }
      // The noticeboard is the dispatcher's list, read by that square's dispatcher, or without one.
      if (!guild.talkTo('dispatcher', square)) host.jobs?.cycle();
    },
    parent: host.hudRoot,
    dialogue: { voice: () => host.sound(), lockTarget: host.lockTarget, cue: (name) => host.cue(name) },
  });
  host.scene.add(guild.group);

  // The moments: the big ones to the banner, the small ones to the toast.
  const banner = bannerModule.createBanner(host.hudRoot, (moment) => {
    if (moment.kind === 'level' || moment.kind === 'quest' || moment.kind === 'daily') chime.fanfare();
    else host.cue('ui-confirm');
  });
  function unlocksNow(): string[] {
    const before = wear.unlocked;
    const after = wear.relearn();
    const gained: Cosmetic[] = cosmetics.COSMETICS.filter((item) => after.has(item.id) && !before.has(item.id));
    for (const item of gained) wear.fresh.add(item.id);
    return gained.map(wearableName);
  }
  const journalKey = (): string => (isTouch() ? 'the book' : labelOf('journal'));
  function told(notice: ProgressNotice): void {
    if (notice.t === 'change') setKnownXp(progress.level().xp);
    if (!active()) return;
    switch (notice.t) {
      case 'level':
        banner.show({ kind: 'level', title: `Level ${notice.level}`, detail: 'Your Field Guide shows what comes next', value: notice.level, unlocks: unlocksNow() });
        break;
      case 'milestone': {
        const word = ['', 'Bronze', 'Silver', 'Gold'][notice.tier] ?? '';
        banner.show({ kind: 'milestone', title: `${notice.title} · ${word}`, detail: `+${[0, 100, 250, 600][notice.tier] ?? 0} XP`, value: notice.tier, unlocks: unlocksNow() });
        break;
      }
      case 'quest-ready': {
        const quest = progressModule.questById(notice.id);
        if (quest !== undefined && quest.objectives.length > 0) host.announce(`${quest.title}: done! Hand it in to the ${ROLE_INFO[quest.giver].title.toLowerCase()} at a guild`, 'scroll');
        break;
      }
      case 'quest-done': {
        const quest = progressModule.questById(notice.id);
        banner.show({ kind: 'quest', title: quest?.title ?? 'Quest complete', detail: `+${notice.xp} XP`, unlocks: unlocksNow() });
        break;
      }
      case 'commission':
        host.announce(`Commission done: ${notice.commission.title} · +${notice.commission.xp} XP`, 'calendar');
        break;
      case 'commissions':
        banner.show({ kind: 'daily', title: 'All three commissions', detail: `+${notice.bonus} XP${notice.streak > 1 ? ` · ${notice.streak}-day streak` : ''}`, unlocks: unlocksNow() });
        break;
      case 'day':
        host.announce(`Three new commissions today · ${journalKey()} for the Field Guide`, 'calendar');
        break;
      case 'change':
        changed();
        break;
      default:
        break;
    }
  }
  /**
   * A change redraws the Field Guide and the conversation once, after the
   * notices of the event that made it: a redraw that reads the progress
   * never sets off another inside itself.
   */
  let redraw = false;
  let redrawing = false;
  function changed(): void {
    if (redraw || redrawing) return;
    redraw = true;
    queueMicrotask(() => {
      redraw = false;
      if (disposed) return;
      redrawing = true;
      try {
        // What is earned may have moved without a notice of its own: an account folded in.
        wear.relearn();
        fieldGuide.refresh();
        guild.dialogue.refresh();
      } finally {
        redrawing = false;
      }
    });
  }
  const unlisten = progress.on(told);

  // The minimap's spots: the jobs near, and every guild within reach.
  const guilds = guildFinder(host);
  const spots: MinimapSpot[] = [];
  let spotsIn = 0;
  function updateSpots(dt: number): void {
    spotsIn -= dt;
    if (spotsIn > 0) return;
    spotsIn = SPOTS_EVERY;
    spots.length = 0;
    const here = host.traveller().position;
    host.jobs?.spots(spots);
    const near = guilds.nearest(here);
    const rim = GUILD_RIM_REACH * host.radius;
    guilds.directions.forEach((direction, i) => {
      const units = direction.angleTo(here) * host.radius;
      if (units > rim * 2) return;
      spots.push({ x: direction.x, y: direction.y, z: direction.z, kind: 'guild', rim: near !== null && host.guildPlaces[i] === near.index && units < rim && units > GUILD_RIM_NEAR });
    });
    host.setSpots(spots);
  }

  const boards = createFameBoards(host.scene, leaderboard);
  const followers = createFollowers(host, cosmetics);

  // What is worn and not earned comes off, now the progression can say.
  if (host.dress !== undefined) {
    const look = host.appearance();
    const stripped = cosmetics.withoutLocked(look, wear.unlocked);
    if (encodeAppearance(stripped) !== encodeAppearance(look)) host.dress(stripped);
  }

  let disposed = false;
  return {
    progress,
    guild,
    fieldGuide,
    emit,
    unlocked: () => wear.unlocked,
    frame(now, dt, width, height) {
      const traveller = host.traveller();
      guild.frame({ now, dt, position: traveller.position, afoot: traveller.afoot, camera: host.camera(), width, height });
      updateSpots(dt);
      boards.update(dt, host.squares(), traveller.position);
      followers.update(dt);
    },
    debug: () => ({ progress, guild, fieldGuide, hall, banner, spots, unlocked: () => wear.unlocked, trails: followers.trails.stats, companions: followers.companions.stats }),
    dispose() {
      if (disposed) return;
      disposed = true;
      unlisten();
      progress.flush();
      guild.dispose();
      fieldGuide.dispose();
      banner.dispose();
      hall.dispose();
      boards.dispose();
      followers.dispose();
      host.setSpots([]);
      // The progression goes back to whoever held it before, reading their records again.
      if (held !== null && held.owner === self && previous !== null) {
        held.records = previous.records;
        held.owner = previous.owner;
        progress.refresh(true);
      }
    },
  };
}
