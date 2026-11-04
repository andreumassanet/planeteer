/**
 * The progression headless: the career's merge is idempotent, commutative,
 * associative and loses nothing; a hostile or damaged record reads as what
 * it can vouch for, inside every cap; the level only grows with XP and a
 * newcomer's first hour and a dedicated traveller's weeks land where they
 * should; every milestone's tiers; the whole Explorer's Path and every
 * guild contract walked by events the game emits; the day's commissions
 * the same for everybody, never two of a kind, inside their minutes; the day's turn and the streaks; the summary
 * and the scores of a fixture; and a profile carrying a career through the
 * account's round trip.
 *
 *   node scripts/check-progress.ts
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { emptyProfile, localSignature, mergeProfiles, profileFromRow, profileKey, progressOf, readLocalProfile, writeLocalProfile } from '../src/account/profile.ts';
import type { Profile } from '../src/account/profile.ts';
import { levelOf } from '../src/explorer-level.ts';
import type { JobRecord } from '../src/jobs/store.ts';
import { pointsFor } from '../src/jobs/score.ts';
import type { PassportData, Stamp } from '../src/passport.ts';
import type { RingRecord } from '../src/rings/store.ts';
import { GUILD_ROLES } from '../src/guild/roles.ts';
import {
  ACHIEVEMENTS, ACHIEVEMENT_IDS, CAREER_KEY, DAILY_BONUS, DAILY_COUNT, DAY_MINUTES, DAY_MS, LEVEL_XP, MAX_COUNTS,
  CONTRACTS, MAX_DAYS, MAX_HISTORY, MAX_QUESTS, MAX_SETS, MAX_SET_ITEMS, MOVE_MODES, PATH, PATH_IDS, QUESTS, QUEST_IDS, SCORE_KEYS, TEMPLATES,
  TIER_XP, achievementsOf, applyEvent, careerDocument, careerOf, careerSignature, commissionsOf, createProgress,
  emptyCareer, levelInfo, mergeCareers, parseCareer, questById, scoresOf, serialiseCareer, summaryOf, tierOf,
  xpForLevel,
} from '../src/progress.ts';
import type { CareerRecord, Commission, MoveMode, ProgressEvent, ProgressNotice, ProgressRecords, Tally } from '../src/progress.ts';

/** A store in memory, optionally refusing. */
function memory(initial: Record<string, string> = {}, refuse = false) {
  const items: Record<string, string> = { ...initial };
  return {
    items,
    getItem: (key: string) => {
      if (refuse) throw new Error('denied');
      return key in items ? items[key]! : null;
    },
    setItem: (key: string, value: string) => {
      if (refuse) throw new Error('denied');
      items[key] = String(value);
    },
  };
}

let seed = 1;
const random = (): number => (seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 4294967296;
const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)]!;

const DAY = 20_396;
const at = (day: number, hour = 12): number => day * DAY_MS + hour * 3_600_000;

/** Events a traveller might send, of every type. */
function anyEvent(): ProgressEvent {
  const kinds = ['car', 'plane', 'boat', 'bicycle', 'horse', 'rover'];
  return pick<() => ProgressEvent>([
    () => ({ t: 'move', mode: pick(MOVE_MODES), metres: random() * 400 }),
    () => ({ t: 'jump' }),
    () => ({ t: 'talk', key: `person-${Math.floor(random() * 30)}` }),
    () => ({ t: 'board', kind: pick(kinds) }),
    () => ({ t: 'course', id: 'a:x', kind: 'air', medal: 1 + Math.floor(random() * 3), ms: 60_000 }),
    () => ({ t: 'job', kind: pick(['errand', 'taxi', 'cargo', 'rescue'] as const), medal: 2, points: 9, iso: 'ESP' }),
    () => ({ t: 'depth', metres: random() * 60 }),
    () => ({ t: 'altitude', metres: random() * 2500 }),
    () => ({ t: 'speed', kmh: random() * 300 }),
    () => ({ t: 'world', id: pick(['mars', 'moon', 'venus']) }),
    () => ({ t: 'emote', e: pick(['wave', 'dance', 'sit']) }),
    () => ({ t: 'npc', role: pick(['guide', 'dispatcher', 'marshal'] as const) }),
    () => ({ t: 'topic', id: pick(['jobs', 'rings', 'flight']) }),
    () => ({ t: 'guild', place: pick(['Madrid', 'São Paulo', 'Tokyo']) }),
    () => ({ t: 'photo' }),
  ])();
}

/** A record some play made, on some days. */
function played(events: number): CareerRecord {
  const record = emptyCareer();
  for (let i = 0; i < events; i++) applyEvent(record.stats, anyEvent(), DAY - Math.floor(random() * 5));
  for (const id of QUEST_IDS) if (random() < 0.3) record.quests.done.add(id);
  for (const id of QUEST_IDS) if (!record.quests.done.has(id) && random() < 0.3) record.quests.active.set(id, [Math.floor(random() * 300), Math.floor(random() * 3)]);
  record.daily = { day: DAY - Math.floor(random() * 2), progress: [Math.floor(random() * 3000), 1, 0], history: new Set([DAY - 3, DAY - 2 - Math.floor(random() * 4)]), longest: Math.floor(random() * 3) };
  return careerOf(careerDocument(record));
}

const text = (record: CareerRecord): string => serialiseCareer(record);

test('the merge is idempotent, commutative and associative, and never loses', () => {
  const records = [emptyCareer(), ...Array.from({ length: 7 }, () => played(60))];
  for (const x of records) {
    assert.equal(text(mergeCareers(x, x)), text(x), 'idempotent');
    assert.equal(text(careerOf(JSON.parse(text(x)))), text(x), 'what is written reads back the same');
    for (const y of records) {
      const m = mergeCareers(x, y);
      assert.equal(text(m), text(mergeCareers(y, x)), 'commutative');
      for (const z of records.slice(0, 4)) assert.equal(text(mergeCareers(m, z)), text(mergeCareers(x, mergeCareers(y, z))), 'associative');
      for (const side of [x, y]) {
        for (const [key, value] of side.stats.counts) assert.ok(m.stats.counts.get(key)! >= value, `counter ${key}`);
        for (const [name, set] of side.stats.sets) for (const item of set) assert.ok(m.stats.sets.get(name)!.has(item));
        for (const day of side.stats.days) assert.ok(m.stats.days.has(day));
        for (const id of side.quests.done) assert.ok(m.quests.done.has(id));
        for (const [id, cells] of side.quests.active) {
          if (m.quests.done.has(id)) continue;
          cells.forEach((cell, i) => assert.ok(m.quests.active.get(id)![i]! >= cell));
        }
        for (const id of m.quests.active.keys()) assert.ok(!m.quests.done.has(id), 'done wins over taken');
        assert.ok(m.daily.day >= side.daily.day);
        if (m.daily.day === side.daily.day) side.daily.progress.forEach((cell, i) => assert.ok(m.daily.progress[i]! >= cell));
        for (const day of side.daily.history) assert.ok(m.daily.history.has(day));
        assert.ok(m.daily.longest >= side.daily.longest);
      }
    }
  }
});

test('a hostile or damaged record reads as what it can vouch for, inside every cap', () => {
  for (const stored of [null, '', '{', '[]', '"x"', '42', 'null', '{"stats":7,"quests":"x","daily":[]}']) {
    assert.equal(text(parseCareer(stored)), text(emptyCareer()));
  }
  const hostile = {
    stats: {
      counts: { walk: -5, run: 'far', jumps: 1e40, Bad: 3, '9x': 4, ok: 12.9, ['k'.repeat(40)]: 1 },
      sets: { kinds: ['car', 5, null, 'bad item', 'x'.repeat(41), 'car'], worlds: 'mars' },
      days: [1.5, -3, 0, 'x', 5, 5, 2e6, ...Array.from({ length: 3000 }, (_, i) => 10 + i)],
    },
    quests: { done: ['welcome', 'BAD', 7], active: { welcome: [9], 'first-steps': [1e20, 'x', -1, 4, 5, 6, 7, 8, 9, 10], odd: 'x' } },
    daily: { day: 2.5, progress: [1, 'x', -4, 1e12], history: [3, 3, 'x'], longest: -2 },
  };
  const record = careerOf(JSON.parse(JSON.stringify(hostile)));
  assert.deepEqual([...record.stats.sets.keys()], ['kinds']);
  assert.deepEqual([...record.stats.sets.get('kinds')!], ['car']);
  assert.equal(record.stats.counts.get('walk'), 0, 'a negative count is clamped');
  assert.equal(record.stats.counts.get('jumps'), 1e12, 'an overflowing one is capped');
  assert.equal(record.stats.counts.get('ok'), 12, 'and a fraction floored');
  assert.equal(record.stats.counts.has('run'), false);
  assert.equal(record.stats.counts.has('Bad'), false);
  assert.ok(record.stats.days.size <= MAX_DAYS);
  assert.ok([...record.stats.days].every((d) => Number.isInteger(d) && d >= 1 && d <= 1e6));
  assert.ok(record.stats.days.has(3009), 'the newest days are kept');
  assert.deepEqual([...record.quests.done], ['welcome']);
  assert.equal(record.quests.active.has('welcome'), false, 'a quest done is not also taken');
  assert.deepEqual(record.quests.active.get('first-steps'), [1e9, 0, 0, 4, 5, 6, 7, 8]);
  assert.equal(record.quests.active.has('odd'), false);
  assert.equal(record.daily.day, 0);
  assert.deepEqual(record.daily.progress, [1, 0, 0, 1e9]);
  assert.deepEqual([...record.daily.history], [3]);
  assert.equal(record.daily.longest, 0);
  // Past every cap: the first keys in code-unit order kept, the newest days.
  const huge = careerOf({
    stats: {
      counts: Object.fromEntries(Array.from({ length: 300 }, (_, i) => [`c${i}`, i])),
      sets: Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`s${i}`, Array.from({ length: 900 }, (_, j) => `i${j}`)])),
    },
    quests: { done: Array.from({ length: 300 }, (_, i) => `q${i}`), active: Object.fromEntries(Array.from({ length: 300 }, (_, i) => [`t${i}`, [i]])) },
    daily: { history: Array.from({ length: 3000 }, (_, i) => 1 + i) },
  });
  assert.equal(huge.quests.done.size, MAX_QUESTS);
  assert.equal(huge.quests.active.size, MAX_QUESTS);
  assert.equal(huge.daily.history.size, MAX_HISTORY);
  assert.ok(huge.daily.history.has(3000) && !huge.daily.history.has(1));
  assert.equal(huge.stats.counts.size, MAX_COUNTS);
  assert.equal(huge.stats.sets.size, MAX_SETS);
  for (const set of huge.stats.sets.values()) assert.equal(set.size, MAX_SET_ITEMS);
  assert.ok(text(huge).length < 120_000, `a capped record is small: ${text(huge).length} bytes`);
  // An honest one is far smaller: a year of play.
  const year = played(4000);
  for (let d = 0; d < 365; d++) year.stats.days.add(DAY - d);
  assert.ok(text(year).length < 12_000, `a year's record is ${text(year).length} bytes`);
  // Events that cannot be vouched for count for nothing.
  const stats = emptyCareer().stats;
  for (const event of [
    { t: 'move', mode: 'teleport', metres: 5 }, { t: 'move', mode: 'walk', metres: -4 }, { t: 'move', mode: 'walk', metres: Infinity },
    { t: 'board' }, { t: 'world', id: 'earth' }, { t: 'emote', e: 'bad emote!' }, { t: 'depth', metres: Number.NaN }, { t: 'nothing' },
  ] as unknown as ProgressEvent[]) applyEvent(stats, event);
  assert.equal(stats.counts.get('walk') ?? 0, 0);
  assert.equal(stats.sets.get('kinds')?.size ?? 0, 0);
  assert.equal(stats.sets.get('worlds')?.size ?? 0, 0);
  assert.equal(stats.counts.get('depth') ?? 0, 0);
  applyEvent(stats, { t: 'move', mode: 'walk', metres: 1e9 });
  assert.equal(stats.counts.get('walk'), 50_000, 'one event is never more than a step');
});

/** A tally with every measure at `n`. */
const flat = (n: number): Tally => ({
  countries: n, towns: n, landmarks: n, courses: n, golds: n, silvers: 0, bronzes: 0, jobs: n, rescues: n, reputation: n,
  footKm: n, driveKm: n, flyKm: n, sailKm: n, swimKm: n, deepest: n, highest: n, fastest: n, kinds: n, people: n, worlds: n,
  rockets: n, photos: n, postcards: n, days: n,
});

test('the milestones: eighteen, three rising tiers each, reached at their thresholds', () => {
  assert.deepEqual([...ACHIEVEMENT_IDS].sort(), [
    'astronaut', 'aviator', 'collector', 'courier', 'diver', 'driver', 'globetrotter', 'hiker', 'photographer', 'postcards', 'racer',
    'regular', 'rescuer', 'sailor', 'sightseer', 'socialite', 'voyager', 'wanderer',
  ]);
  for (const a of ACHIEVEMENTS) {
    const [b, s, g] = a.tiers;
    assert.ok(b > 0 && b < s && s < g, `${a.id}'s tiers rise`);
    assert.ok(a.title !== '' && a.description.endsWith('.') && a.unit !== '');
    for (const [value, tier] of [[0, 0], [b - 0.01, 0], [b, 1], [s - 0.01, 1], [s, 2], [g - 0.01, 2], [g, 3], [g * 10, 3]] as const) {
      assert.equal(tierOf(value, a.tiers), tier, `${a.id} at ${value}`);
    }
    for (const threshold of a.tiers) {
      const reached = achievementsOf(flat(threshold)).find((m) => m.id === a.id)!;
      assert.ok(reached.tier >= 1 && reached.value >= threshold);
      assert.ok(reached.next === null || reached.next > threshold);
    }
  }
  const none = achievementsOf(flat(0));
  assert.ok(none.every((m) => m.tier === 0 && m.next === m.tiers[0] && m.from === 0));
  const all = achievementsOf(flat(1e9));
  assert.ok(all.every((m) => m.tier === 3 && m.next === null));
});

test('the level: one curve, only rising, and the old passport level unchanged', () => {
  let previous = levelInfo(0);
  assert.equal(previous.level, 1);
  for (let xp = 1; xp < 200_000; xp += 37) {
    const info = levelInfo(xp);
    assert.ok(info.level >= previous.level);
    assert.ok(info.xp >= info.from && info.xp < info.to && info.progress >= 0 && info.progress < 1);
    previous = info;
  }
  for (let level = 1; level < 80; level++) {
    assert.equal(levelInfo(xpForLevel(level)).level, level);
    assert.equal(levelInfo(xpForLevel(level + 1) - 1).level, level);
  }
  assert.equal(levelInfo(LEVEL_XP).level, 2);
  assert.equal(levelInfo(-5).level, 1);
  assert.equal(levelInfo(Number.NaN).level, 1);
  for (const [stamps, towns] of [[0, 0], [1, 3], [5, 40], [30, 900]] as const) {
    const points = towns * 10 + stamps * 60;
    assert.equal(levelOf(stamps, towns).level, Math.floor(Math.sqrt(points / 40)) + 1);
  }
});

const stamp = (i: number): Stamp => ({ iso: `C${String(i).padStart(2, '0')}`.slice(0, 4), name: 'C', date: '2026-11-01', town: 'T', mode: 'foot', lat: 0, lon: 0 });

function records(stamps: number, towns: number, landmarks: number, medals: number[], jobs: [string, number][]): ProgressRecords {
  const passport: PassportData = { version: 1, stamps: Array.from({ length: stamps }, (_, i) => stamp(i)), towns: Array.from({ length: towns }, (_, i) => `ESP:T${i}`) };
  const rings: RingRecord = { landmarks: new Set(Array.from({ length: landmarks }, (_, i) => `l${i}`)), courses: new Map(medals.map((medal, i) => [`a:c${i}`, { ms: 60_000, medal, title: 'C', kind: 'air' as const }])) };
  const done = new Map(jobs.map(([letter, medal], i) => [`${letter}:${i}:k${i}:${DAY}`, { kind: ({ e: 'errand', t: 'taxi', c: 'cargo', r: 'rescue' } as const)[letter as 'e']!, iso: 'ESP', title: 'J', ms: 9000, medal }]));
  return { passport, rings, jobs: { done } as JobRecord };
}

test('XP: what a first hour and a few weeks are worth', () => {
  // A newcomer's first hour: the Guide's first quests and two others, a stamp or two, a few towns, a job.
  const hour = emptyCareer();
  hour.quests.done = new Set(['welcome', 'first-steps', 'say-hello', 'take-the-wheel', 'new-look', 'odd-job']);
  const firstHour: ProgressEvent[] = [
    ...Array.from({ length: 30 }, (): ProgressEvent => ({ t: 'move', mode: 'walk', metres: 100 })),
    ...Array.from({ length: 30 }, (): ProgressEvent => ({ t: 'move', mode: 'run', metres: 100 })),
    ...Array.from({ length: 80 }, (): ProgressEvent => ({ t: 'move', mode: 'drive', metres: 100 })),
    ...Array.from({ length: 6 }, (_, i): ProgressEvent => ({ t: 'talk', key: `p${i}` })),
    { t: 'board', kind: 'car' }, { t: 'board', kind: 'bicycle' }, { t: 'photo' },
  ];
  for (const event of firstHour) applyEvent(hour.stats, event, DAY);
  hour.stats.counts.set('daily-xp', 150);
  const newcomer = summaryOf({ ...records(2, 8, 1, [], [['e', 1], ['e', 2]]), career: hour });
  const hourTiers = newcomer.milestones.reduce((n, m) => n + m.tier, 0);
  console.log(`  a first hour: ${newcomer.xp} XP, level ${newcomer.level}, ${hourTiers} milestone tiers`, newcomer.xpParts);
  assert.ok(newcomer.level >= 4 && newcomer.level <= 8, 'a newcomer levels a few times in the first hour');
  assert.ok(hourTiers >= 1 && hourTiers <= 4);

  // A dedicated traveller over some weeks.
  const weeks = emptyCareer();
  weeks.quests.done = new Set(QUEST_IDS);
  const km = { walk: 60, run: 60, drive: 350, ride: 50, fly: 15_000, sail: 150, swim: 8 } as const;
  for (const [mode, n] of Object.entries(km)) weeks.stats.counts.set(mode, n * 1000);
  weeks.stats.counts.set('depth', 45);
  weeks.stats.counts.set('rockets', 6);
  weeks.stats.counts.set('photos', 80);
  weeks.stats.counts.set('daily-xp', 20 * (240 + DAILY_BONUS));
  weeks.stats.sets.set('kinds', new Set(['car', 'van', 'boat', 'plane', 'balloon', 'bicycle', 'motorbike', 'bus', 'jeep', 'horse', 'jetski', 'helicopter']));
  weeks.stats.sets.set('people', new Set(Array.from({ length: 120 }, (_, i) => `p${i}`)));
  weeks.stats.sets.set('worlds', new Set(['mars', 'moon', 'venus', 'mercury']));
  for (let d = 0; d < 25; d++) weeks.stats.days.add(DAY - d);
  const medals = [...Array(20).fill(3), ...Array(12).fill(2), ...Array(8).fill(1)];
  const jobs: [string, number][] = Array.from({ length: 250 }, (_, i) => [pick(['e', 't', 'c', 'r']), 1 + (i % 3)]);
  const dedicated = summaryOf({ ...records(110, 900, 70, medals, jobs), career: weeks });
  const weekTiers = dedicated.milestones.reduce((n, m) => n + m.tier, 0);
  console.log(`  some weeks: ${dedicated.xp} XP, level ${dedicated.level}, ${weekTiers} milestone tiers`, dedicated.xpParts);
  assert.ok(dedicated.level >= 30 && dedicated.level <= 50, 'a dedicated traveller reaches 30 to 50 over weeks');
  assert.equal(dedicated.xpParts.quests, QUESTS.reduce((n, q) => n + q.xp, 0));
  assert.equal(dedicated.xpParts.milestones, dedicated.milestones.reduce((n, m) => n + TIER_XP.slice(0, m.tier).reduce((a, b) => a + b, 0), 0));
});

/** Events that finish a commission. */
function finishing(c: Commission): ProgressEvent[] {
  const chunks = (mode: MoveMode, metres: number): ProgressEvent[] =>
    Array.from({ length: Math.ceil(metres / 1000) }, () => ({ t: 'move', mode, metres: 1000 }));
  const times = (n: number, event: ProgressEvent): ProgressEvent[] => Array.from({ length: n }, () => event);
  const n = c.target;
  const by: Record<string, () => ProgressEvent[]> = {
    foot: () => chunks('run', n), jumps: () => times(n, { t: 'jump' }), drive: () => chunks('drive', n), speed: () => [{ t: 'speed', kmh: n }],
    fly: () => chunks('fly', n), altitude: () => [{ t: 'altitude', metres: n }], parachute: () => [{ t: 'parachute' }], rocket: () => [{ t: 'rocket' }],
    sail: () => chunks('sail', n), swim: () => chunks('swim', n), dive: () => [{ t: 'depth', metres: n }], course: () => [{ t: 'course', id: 'a:x', kind: 'air', medal: 2, ms: 1 }],
    jobs: () => times(n, { t: 'job', kind: 'errand', medal: 1, points: 6, iso: 'ESP' }), errand: () => [{ t: 'job', kind: 'errand', medal: 1, points: 6, iso: 'ESP' }],
    fare: () => [{ t: 'job', kind: 'taxi', medal: 1, points: 8, iso: 'ESP' }], cargo: () => [{ t: 'job', kind: 'cargo', medal: 1, points: 12, iso: 'ESP' }],
    rescue: () => [{ t: 'job', kind: 'rescue', medal: 1, points: 15, iso: 'ESP' }], talk: () => Array.from({ length: n }, (_, i) => ({ t: 'talk', key: `k${i}` })),
    wave: () => [{ t: 'emote', e: 'wave' }], towns: () => times(n, { t: 'town', key: 'ESP:T' }), landmark: () => [{ t: 'visit', landmark: 'x' }],
    guild: () => [{ t: 'guild', place: 'Madrid' }], photo: () => times(n, { t: 'photo' }), board: () => times(n, { t: 'board', kind: 'car' }),
  };
  return by[c.template]!();
}

test('the day\'s commissions: the same for everybody, three kinds, inside their minutes, all finishable', () => {
  const seen = new Set<string>();
  const used = new Map<string, number>();
  let outside = 0;
  for (let day = DAY; day < DAY + 1100; day++) {
    const list = commissionsOf(day);
    assert.equal(list.length, DAILY_COUNT);
    assert.equal(new Set(list.map((c) => c.kind)).size, DAILY_COUNT, 'never two of one kind');
    const minutes = list.reduce((n, c) => n + c.minutes, 0);
    if (minutes < DAY_MINUTES[0] || minutes > DAY_MINUTES[1]) outside++;
    seen.add(list.map((c) => `${c.template}:${c.target}`).join(' '));
    for (const c of list) used.set(c.template, (used.get(c.template) ?? 0) + 1);
  }
  assert.equal(outside, 0, 'every day\'s three take 18 to 40 minutes');
  const ranked = [...used].sort((a, b) => b[1] - a[1]).map(([id, n]) => `${id} ${n}`);
  console.log(`  1,100 days: ${seen.size} different, drawn most to least: ${ranked.join(', ')}`);
  assert.ok(seen.size > 200, `${seen.size} different days in 1,100`);
  for (const template of TEMPLATES) assert.ok((used.get(template.id) ?? 0) > 0, `${template.id} is drawn`);
  // Drawn again from nothing, the same three.
  const first = JSON.stringify(commissionsOf(DAY));
  for (let day = DAY + 2000; day < DAY + 2020; day++) commissionsOf(day);
  assert.equal(JSON.stringify(commissionsOf(DAY)), first);
  for (const template of TEMPLATES) {
    for (const [target] of template.sizes) {
      const c: Commission = { id: 'x', index: 0, template: template.id, kind: template.kind, title: template.title(target), target, mode: template.mode, minutes: 1, xp: 1 };
      const total = finishing(c).reduce((sum, e) => (template.mode === 'sum' ? sum + template.amount(e) : Math.max(sum, template.amount(e))), 0);
      assert.ok(total >= target, `${template.id} ${target} can be finished`);
    }
  }
});

/** A traveller in memory, on a clock the check moves. */
function traveller(day = DAY, store = memory(), recordsOf: () => ProgressRecords = () => records(0, 0, 0, [], [])) {
  let clock = at(day);
  const notices: ProgressNotice[] = [];
  const progress = createProgress({ records: recordsOf, storage: store, now: () => clock, writeDelayMs: 0 });
  progress.on((n) => {
    if (n.t !== 'change') notices.push(n);
  });
  return { progress, notices, store, set: (ms: number) => (clock = ms), send: (events: ProgressEvent[]) => events.forEach((e) => progress.emit(e)) };
}

test('the Explorer\'s Path, walked by events from the first word to the last', () => {
  const { progress, notices, send, store } = traveller();
  const q = progress.quests;
  assert.equal(q.marker('guide'), 'offer', 'the Guide waits for a new face');
  assert.equal(q.marker('dispatcher'), null);
  assert.deepEqual(q.active().map((e) => e.quest.id), ['welcome']);
  send([{ t: 'jump' }, { t: 'npc', role: 'dispatcher' }]);
  assert.equal(q.ready().length, 0);
  send([{ t: 'npc', role: 'guide' }]);
  assert.ok(notices.some((n) => n.t === 'quest-ready' && n.id === 'welcome'));
  assert.equal(q.marker('guide'), 'ready');
  assert.equal(q.turnIn('first-steps'), null, 'nothing to hand in that is not ready');
  const welcome = q.turnIn('welcome')!;
  assert.equal(welcome.xp, 50);
  assert.equal(welcome.levelUp, 2, 'the first word is the first level');
  assert.ok(notices.some((n) => n.t === 'level' && n.level === 2));
  assert.deepEqual(q.available().map((x) => x.id), ['first-steps', 'odd-job', 'new-look', 'stamped', 'far-horizons']);
  assert.deepEqual(q.available('marshal'), [], 'the Marshal waits for a vehicle');
  assert.equal(q.accept('say-hello'), false, 'not before its turn');

  /** Takes a quest, checks what does not count, finishes it and hands it in. */
  const walk = (id: string, events: ProgressEvent[]) => {
    const before = progress.summary().xp;
    send(events);
    assert.notEqual(q.list().find((e) => e.quest.id === id)!.status, 'ready', `${id}: nothing counts before it is taken`);
    assert.ok(q.accept(id), `${id} is taken`);
    assert.equal(q.accept(id), false, `${id} is taken once`);
    const last = events.at(-1)!;
    send(events.slice(0, -1));
    if (events.length > 1) assert.ok(!q.ready().some((x) => x.id === id), `${id}: not ready one short`);
    send([last]);
    assert.ok(q.ready().some((x) => x.id === id), `${id} is ready`);
    assert.ok(notices.some((n) => n.t === 'quest-ready' && n.id === id));
    const handed = q.turnIn(id)!;
    assert.equal(handed.xp, questById(id)!.xp);
    assert.ok(progress.summary().xp >= before + handed.xp, `${id} gave its XP`);
    assert.equal(q.list().find((e) => e.quest.id === id)!.status, 'done');
    assert.ok(q.list().find((e) => e.quest.id === id)!.objectives.every((o) => o.done === o.count));
  };
  walk('first-steps', [{ t: 'move', mode: 'run', metres: 150 }, { t: 'move', mode: 'walk', metres: 500 }, { t: 'jump' }, { t: 'jump' }, { t: 'move', mode: 'run', metres: 60 }, { t: 'jump' }]);
  walk('say-hello', [{ t: 'talk', key: 'a' }, { t: 'emote', e: 'dance' }, { t: 'talk', key: 'b' }, { t: 'emote', e: 'wave' }]);
  walk('take-the-wheel', [{ t: 'board', kind: 'car' }, { t: 'move', mode: 'drive', metres: 600 }, { t: 'move', mode: 'passenger', metres: 900 }, { t: 'move', mode: 'sail', metres: 400 }]);
  assert.deepEqual(q.available('marshal').map((x) => x.id), ['on-course']);
  walk('odd-job', [{ t: 'job', kind: 'rescue', medal: 3, points: 30, iso: 'ESP' }]);
  walk('on-course', [{ t: 'course', id: 'a:x', kind: 'air', medal: 1, ms: 9 }]);
  walk('ring-bearer', [{ t: 'ring', landmark: 'eiffel-tower' }]);
  walk('new-look', [{ t: 'look' }]);
  walk('stamped', [{ t: 'town', key: 'a' }, { t: 'stamp', iso: 'FRA' }, { t: 'town', key: 'b' }]);
  walk('far-horizons', [{ t: 'map' }, { t: 'destination', landmark: 'x' }, { t: 'arrive', landmark: 'x' }]);
  assert.deepEqual(q.available().filter((x) => x.contract !== true).map((x) => x.id), ['path-complete'], 'the last waits for all the rest');
  assert.equal(q.marker('guide'), 'offer');
  assert.ok(q.accept('path-complete'));
  assert.ok(q.ready().some((x) => x.id === 'path-complete'), 'and asks nothing more');
  assert.equal(q.turnIn('path-complete')!.xp, 500);
  assert.equal(progress.summary().quests.size, PATH.length);
  assert.equal(progress.summary().xpParts.quests, PATH.reduce((n, x) => n + x.xp, 0));
  for (const role of GUILD_ROLES) assert.equal(q.marker(role), 'offer', `${role} has a contract once the path is walked`);
  // Written as it went, and read back whole.
  const again = createProgress({ records: () => records(1, 0, 0, [], []), storage: store, now: () => at(DAY), writeDelayMs: 0 });
  assert.equal(again.summary().quests.size, PATH.length);
  assert.ok(again.known('guide') && again.known('marshal') === false);
});

/**
 * Every event type the game emits, by where: `progress/traveller.ts` reads
 * the moves, jumps, boardings, canopies, the map, benches, towns, the bests
 * and rockets off the traveller; the rest are emitted where they happen.
 */
const EMITTED: ReadonlySet<ProgressEvent['t']> = new Set<ProgressEvent['t']>([
  'move', 'jump', 'board', 'parachute', 'map', 'sit', 'town', 'depth', 'altitude', 'speed', 'rocket', // progress/traveller.ts
  'talk', 'ring', 'course', 'job', 'stamp', 'visit', 'world', 'photo', 'postcard', 'emote', 'honk', 'chat', // app/, worlds/shell/, chat/
  'guild', 'npc', 'topic', 'destination', 'look', 'arrive', // explorers/services.ts, app/world-map.ts, app/front-door.ts
]);

test('the guild contracts: every role\'s chain, its order, and every contract walked by events', () => {
  // The chains' shape.
  assert.equal(QUESTS.length, PATH.length + CONTRACTS.length);
  assert.ok(QUESTS.length <= MAX_QUESTS, 'every quest fits the record');
  assert.ok(CONTRACTS.length >= 20 && CONTRACTS.length <= 32, `${CONTRACTS.length} contracts`);
  assert.equal(new Set(QUEST_IDS).size, QUEST_IDS.length, 'every id once');
  assert.equal(new Set(QUESTS.map((x) => x.title)).size, QUESTS.length, 'every title once');
  for (const id of QUEST_IDS) assert.match(id, /^[a-z][a-z0-9-]{0,31}$/, `${id} is a key the merge keeps`);
  for (const role of GUILD_ROLES) {
    const mine = CONTRACTS.filter((x) => x.giver === role);
    assert.ok(mine.length >= 4 && mine.length <= 5, `${role} has ${mine.length} contracts`);
    const opens = mine[0]!.after;
    assert.equal(opens.length, 1);
    assert.ok((PATH_IDS as readonly string[]).includes(opens[0]!), `${role}'s chain opens off the path`);
    mine.forEach((x, i) => {
      assert.equal(x.contract, true);
      if (i > 0) {
        assert.deepEqual(x.after, [mine[i - 1]!.id], `${x.id} follows the one before it`);
        assert.ok(x.xp > mine[i - 1]!.xp, `${x.id} pays more than the one before it`);
      }
      assert.ok(x.objectives.length >= 1 && x.offer.length > 0 && x.thanks.length > 0 && x.brief.length > 0);
      for (const o of x.objectives) assert.ok(o.target >= 1 && Number.isInteger(o.target), `${x.id}: ${o.label}`);
    });
  }

  // A traveller who has walked the path, with records the check moves.
  const held = { stamps: 1, towns: 2, landmarks: 1, medals: [1] as number[], jobs: [['e', 1]] as [string, number][] };
  const recordsNow = () => records(held.stamps, held.towns, held.landmarks, held.medals, held.jobs);
  const { progress, notices, send, set } = traveller(DAY, memory(), recordsNow);
  const q = progress.quests;
  const walked = emptyCareer();
  walked.quests.done = new Set(PATH_IDS);
  progress.absorb(walked);
  const tallyNow = () => summaryOf({ ...recordsNow(), career: progress.career }).tally;
  const medalsNow = () => summaryOf({ ...recordsNow(), career: progress.career }).milestones.reduce((n, m) => n + m.tier, 0);
  const many = (n: number, event: (i: number) => ProgressEvent): ProgressEvent[] => Array.from({ length: n }, (_, i) => event(i));
  const job = (kind: 'errand' | 'taxi' | 'cargo' | 'rescue', medal = 1, site?: 'sea' | 'hill'): ProgressEvent => ({ t: 'job', kind, medal, points: 6, iso: 'ESP', ...(site === undefined ? {} : { site }) });
  const counts = progress.career.stats.counts;

  /** Per contract: the events that finish it (the last one finishing it) and what moves where the traveller stands. */
  const scripts: Record<string, { events: ProgressEvent[]; stand?: () => void }> = {
    'know-the-guild': { events: [...many(6, (i) => ({ t: 'topic', id: `t${i}` })), { t: 'sit' }, { t: 'postcard', landmark: 'eiffel-tower' }] },
    'guild-hopper': { events: [...many(3, (i) => ({ t: 'guild', place: `G${i}` })), { t: 'emote', e: 'wave' }, { t: 'emote', e: 'dance' }, { t: 'emote', e: 'cheer' }, ...many(5, (i) => ({ t: 'talk', key: `k${i}` }))] },
    'long-way-round': { events: [...many(3, () => ({ t: 'stamp', iso: 'FRA' })), ...many(10, () => ({ t: 'move', mode: 'walk', metres: 1000 }))] },
    'old-hand': { events: [...many(3, (i) => ({ t: 'guild', place: `G${i + 3}` })), ...many(14, (i) => ({ t: 'topic', id: `t${i + 6}` }))] },
    'regular-round': { events: [job('errand'), job('taxi'), job('cargo')] },
    'lifeguard-duty': { events: [job('rescue', 1, 'hill'), job('errand'), job('rescue', 1, 'sea')] },
    'gold-standard': { events: [...many(4, () => job('errand')), job('taxi', 3)] },
    'good-name': {
      events: many(10, () => job('errand')),
      stand: () => {
        while (tallyNow().reputation < 200) held.jobs.push(['e', 1]);
      },
    },
    'local-hero': {
      events: [job('rescue'), job('errand', 3), job('errand', 3), job('rescue', 3)],
      stand: () => {
        while (tallyNow().reputation < 500) held.jobs.push(['r', 3]);
      },
    },
    'silver-lining': { events: [{ t: 'course', id: 'a:x', kind: 'air', medal: 1, ms: 9 }, { t: 'course', id: 'a:x', kind: 'air', medal: 2, ms: 8 }] },
    'three-ways': { events: (['air', 'land', 'sea'] as const).map((kind) => ({ t: 'course', id: `${kind}:x`, kind, medal: 1, ms: 9 })) },
    'ring-collector': { events: [], stand: () => void (held.landmarks = 10) },
    'golden-hour': { events: [{ t: 'course', id: 'a:x', kind: 'air', medal: 3, ms: 1 }, { t: 'course', id: 'l:x', kind: 'land', medal: 2, ms: 1 }, { t: 'course', id: 'l:x', kind: 'land', medal: 3, ms: 1 }, { t: 'course', id: 's:x', kind: 'sea', medal: 3, ms: 1 }] },
    'podium-regular': { events: [], stand: () => Object.assign(held, { medals: Array(10).fill(3), landmarks: 30 }) },
    'dressing-up': { events: many(3, () => ({ t: 'look' })) },
    'rising-star': { events: many(3, () => ({ t: 'photo' })) },
    'best-dressed': { events: [{ t: 'look' }, { t: 'postcard', landmark: 'big-ben' }] },
    'style-icon': { events: [{ t: 'look' }], stand: () => void (held.towns = 3000) },
    'something-to-show': { events: [] },
    'ink-and-paper': { events: [...many(3, () => ({ t: 'stamp', iso: 'ITA' })), ...many(5, (i) => ({ t: 'town', key: `n${i}` }))] },
    'familiar-face': {
      events: [],
      stand: () => {
        for (let d = 1; d <= 5; d++) {
          set(at(DAY + d));
          progress.emit({ t: 'jump' });
        }
      },
    },
    'living-record': {
      events: [],
      stand: () => {
        held.stamps = 15;
        for (const [key, value] of [['walk', 250_000], ['drive', 1e6], ['fly', 4e7], ['sail', 500_000], ['depth', 80]] as const) counts.set(key, value);
        assert.ok(medalsNow() >= 25, `${medalsNow()} medals`);
      },
    },
    'postcards-home': { events: [{ t: 'arrive', landmark: 'x' }, ...many(3, (i) => ({ t: 'postcard', landmark: `p${i}` })), { t: 'arrive', landmark: 'y' }] },
    'lift-off': { events: [{ t: 'rocket' }] },
    'another-sky': { events: [{ t: 'world', id: 'earth' }, { t: 'world', id: 'mars' }] },
    'edge-of-the-map': {
      events: [...many(5, () => ({ t: 'arrive', landmark: 'z' })), ...many(10, (i) => ({ t: 'postcard', landmark: `q${i}` })), ...many(20, () => ({ t: 'move', mode: 'sail', metres: 1000 })), ...many(10, () => ({ t: 'move', mode: 'fly', metres: 50_000 }))],
    },
  };
  assert.deepEqual(Object.keys(scripts).sort(), CONTRACTS.map((x) => x.id).sort(), 'every contract has a script');

  for (const contract of CONTRACTS) {
    const id = contract.id;
    const script = scripts[id]!;
    const status = () => q.list().find((e) => e.quest.id === id)!.status;
    for (const event of script.events) assert.ok(EMITTED.has(event.t), `${id}: the game emits no '${event.t}'`);
    // Every counted objective is moved by an event the game emits.
    for (const objective of contract.objectives) {
      if (objective.reach !== undefined) continue;
      assert.ok(script.events.some((event) => objective.amount(event) > 0), `${id}: nothing emitted counts for “${objective.label}”`);
    }
    assert.equal(status(), 'offered', `${id} is on offer once the one before it is handed in`);
    const next = CONTRACTS.find((x) => x.after.includes(id));
    if (next !== undefined) assert.equal(q.list().find((e) => e.quest.id === next.id)!.status, 'locked', `${next.id} waits for ${id}`);
    assert.equal(q.marker(contract.giver) === 'offer' || q.marker(contract.giver) === 'ready', true, `${contract.giver} shows a mark`);
    assert.ok(q.accept(id), `${id} is taken`);
    script.stand?.();
    progress.refresh();
    if (script.events.length > 0) {
      send(script.events.slice(0, -1));
      assert.notEqual(status(), 'ready', `${id}: not ready one event short`);
      send(script.events.slice(-1));
    }
    assert.equal(status(), 'ready', `${id} is ready`);
    assert.ok(notices.some((n) => n.t === 'quest-ready' && n.id === id), `${id} said it was ready`);
    const before = progress.summary().quests.size;
    assert.equal(q.turnIn(id)!.xp, contract.xp);
    assert.equal(progress.summary().quests.size, before + 1);
    assert.ok(q.list().find((e) => e.quest.id === id)!.objectives.every((o) => o.done === o.count));
  }
  assert.equal(progress.summary().quests.size, QUESTS.length, 'every quest handed in');
  for (const role of GUILD_ROLES) assert.equal(q.marker(role), null, `${role} has nothing left`);

  // A standing objective is kept as progress, so the merge's laws hold for it, and never goes down.
  const taken = emptyCareer();
  taken.quests.done = new Set(PATH_IDS);
  const fresh = traveller(DAY, memory(), () => records(0, 0, 0, [], []));
  fresh.progress.absorb(taken);
  assert.ok(fresh.progress.quests.accept('something-to-show'));
  assert.deepEqual(fresh.progress.career.quests.active.get('something-to-show'), [0]);
});

test('the day turns, the commissions follow it, and the streaks count', () => {
  const { progress, notices, send, set } = traveller(DAY);
  const finish = (day: number) => {
    set(at(day, 9));
    const today = progress.today();
    assert.equal(today.day, day);
    for (const entry of today.commissions) send(finishing(entry.commission));
    return progress.today();
  };
  const first = finish(DAY);
  assert.ok(first.allDone);
  assert.equal(notices.filter((n) => n.t === 'commission').length, 3);
  assert.equal(notices.filter((n) => n.t === 'commissions').length, 1);
  assert.equal(first.streak, 1);
  const xp = commissionsOf(DAY).reduce((n, c) => n + c.xp, 0) + DAILY_BONUS;
  assert.equal(progress.career.stats.counts.get('daily-xp'), xp, 'each commission\'s XP and the bonus, once');
  // Done again the same day: nothing more.
  for (const entry of first.commissions) send(finishing(entry.commission));
  assert.equal(progress.career.stats.counts.get('daily-xp'), xp);
  assert.equal(finish(DAY + 1).streak, 2);
  assert.ok(notices.some((n) => n.t === 'day' && n.day === DAY + 1));
  assert.equal(finish(DAY + 2).streak, 3);
  set(at(DAY + 3, 23));
  assert.equal(progress.today().streak, 3, 'a streak holds while today is still open');
  assert.ok(!progress.today().allDone);
  assert.equal(progress.today().resetsInMs, 3_600_000);
  const late = finish(DAY + 5);
  assert.equal(late.streak, 1);
  assert.equal(late.longest, 3);
  assert.equal(progress.summary().streak, 3, 'the summary\'s streak is the longest');
  // A clock gone back does not count against another day.
  set(at(DAY + 1));
  const before = JSON.stringify(progress.career.daily.progress);
  send([{ t: 'jump' }, { t: 'move', mode: 'run', metres: 3000 }]);
  assert.equal(JSON.stringify(progress.career.daily.progress), before);
  assert.ok(progress.career.daily.history.size === 4 && progress.career.daily.history.size <= MAX_HISTORY);
});

test('the runtime: quiet when it absorbs, safe with a broken store, a reset from nothing', () => {
  const growing = { towns: 0 };
  const { progress, notices } = traveller(DAY, memory(), () => records(0, growing.towns, 0, [], []));
  growing.towns = 30;
  progress.emit({ t: 'town', key: 'x' });
  assert.ok(notices.some((n) => n.t === 'level'), 'a town that lifts the level says so');
  assert.ok(notices.some((n) => n.t === 'milestone' && n.id === 'wanderer' && n.tier === 1));
  const other = emptyCareer();
  other.quests.done = new Set(QUEST_IDS);
  const count = notices.length;
  progress.absorb(other);
  assert.equal(notices.length, count, 'what another device reached arrives without a fanfare');
  assert.equal(progress.summary().quests.size, QUEST_IDS.length);
  progress.reset();
  assert.equal(progress.summary().quests.size, 0);
  assert.deepEqual(progress.quests.active().map((e) => e.quest.id), ['welcome']);

  const broken = createProgress({ records: () => { throw new Error('not yet'); }, storage: memory({}, true), now: () => at(DAY), writeDelayMs: 0 });
  broken.emit({ t: 'jump' });
  broken.emit(null as unknown as ProgressEvent);
  broken.flush();
  assert.equal(broken.summary().level, 1);
  assert.equal(broken.career.stats.counts.get('jumps'), 1);
  assert.equal((broken.debug() as { refused: number }).refused > 0, true);
});

function fixture(): Profile {
  const p = emptyProfile();
  const r = records(3, 12, 2, [3, 2, 1, 3], [['e', 3], ['r', 1]]);
  Object.assign(p, { name: 'Andreu', nameAt: 5, ...r });
  p.career.quests.done = new Set(['welcome', 'first-steps']);
  applyEvent(p.career.stats, { t: 'move', mode: 'walk', metres: 6000 }, DAY);
  p.career.stats.counts.set('daily-xp', 330);
  return p;
}

test('the summary and the scores of a fixture', () => {
  const p = fixture();
  const s = summaryOf(p);
  assert.deepEqual(s.xpParts, {
    towns: 120, stamps: 180, rings: 80, courses: 100 + 50 + 25 + 100, jobs: (pointsFor('errand', 3) + pointsFor('rescue', 1)) * 3,
    milestones: 4 * TIER_XP[0], quests: 150, commissions: 330,
  });
  assert.equal(s.achievements.get('hiker'), 1);
  assert.equal(s.achievements.get('wanderer'), 1);
  assert.equal(s.achievements.get('racer'), 1);
  assert.equal(s.achievements.get('rescuer'), 1);
  assert.equal(s.xp, Object.values(s.xpParts).reduce((a, b) => a + b, 0));
  assert.equal(s.level, levelInfo(s.xp).level);
  const scores = scoresOf(p);
  assert.deepEqual(Object.keys(scores), [...SCORE_KEYS]);
  assert.deepEqual(scores, { xp: s.xp, level: s.level, countries: 3, landmarks: 2, golds: 2, reputation: pointsFor('errand', 3) + pointsFor('rescue', 1), towns: 12 });
  // It has the shape the unlocks read.
  const unlock: { level: number; achievements: ReadonlyMap<string, number>; quests: ReadonlySet<string>; streak: number } = s;
  assert.ok(unlock.quests.has('welcome'));
});

test('a profile carries its career through the account and back', () => {
  const p = fixture();
  const doc = progressOf(p);
  assert.deepEqual(doc.scores, scoresOf(p));
  const row = profileFromRow({ name: p.name, progress: JSON.parse(JSON.stringify(doc)) });
  assert.equal(profileKey(row), profileKey(p));
  assert.equal(text(row.career), text(p.career));
  const other = emptyProfile();
  applyEvent(other.career.stats, { t: 'move', mode: 'walk', metres: 9000 }, DAY + 1);
  other.career.quests.done = new Set(['say-hello']);
  const merged = mergeProfiles(p, other);
  assert.equal(merged.career.stats.counts.get('walk'), 9000);
  assert.equal(merged.career.quests.done.size, 3);
  assert.equal(profileKey(mergeProfiles(merged, p)), profileKey(merged));

  const store = memory();
  const written = writeLocalProfile(store, merged);
  assert.equal(written.career, true);
  assert.equal(text(parseCareer(store.items[CAREER_KEY])), text(merged.career));
  assert.equal(text(readLocalProfile(store, 1).career), text(merged.career));
  assert.equal(writeLocalProfile(store, merged).career, false, 'written once');
  // The signature moves for what is worth sending, not for every step.
  const signature = localSignature(store);
  const walked = parseCareer(store.items[CAREER_KEY]);
  walked.stats.counts.set('walk', 9000 + 40);
  store.items[CAREER_KEY] = serialiseCareer(walked);
  assert.equal(localSignature(store), signature, 'forty metres more is not worth a sync');
  walked.quests.done.add('new-look');
  store.items[CAREER_KEY] = serialiseCareer(walked);
  assert.notEqual(localSignature(store), signature, 'a quest handed in is');
  assert.notEqual(careerSignature(store.items[CAREER_KEY]), careerSignature(serialiseCareer(merged.career)));
});
