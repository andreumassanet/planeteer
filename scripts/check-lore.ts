/**
 * The handbook headless: every key a line names is a real action, every topic
 * has a unique id, a real icon and a role, every page fits its card, and every
 * role has topics, greetings and the right number of them; the names and the
 * tips are unique, and the words are British and plain.
 *
 *   node scripts/check-lore.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { DEFAULT_BINDINGS } from '../src/controls.ts';
import { GREETINGS, NAMES, TIPS, TOPICS } from '../src/guild/lore.ts';
import { GUILD_ROLES } from '../src/guild/roles.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** The most words a page may hold, its touch version too: what a card shows without scrolling. */
const MAX_WORDS = 72;
const MIN_PAGES = 2;
const MAX_PAGES = 6;
const MAX_TITLE = 40;
const MAX_HEADING = 36;
const MAX_SUMMARY = 110;
/** A tip is one line on a loading screen. */
const MAX_TIP_WORDS = 24;

const ACTIONS = new Set(Object.keys(DEFAULT_BINDINGS));

/** The icon names `ui.ts` draws, read off its table, since `IconName` is only a string to the compiler. */
function iconNames(): Set<string> {
  const source = readFileSync(resolve(root, 'src/ui.ts'), 'utf8');
  const start = source.indexOf('const ICONS');
  const end = source.indexOf('\n};', start);
  assert.ok(start >= 0 && end > start, 'the icon table is found in ui.ts');
  return new Set([...source.slice(start, end).matchAll(/^ {2}([a-zA-Z]+):/gm)].map((match) => match[1]!));
}

const words = (text: string): number => text.split(/\s+/).filter((word) => word !== '').length;

/** American spellings and literal keys, which a line must not carry. */
const AMERICAN = /\b(colors?|colored|coloring|traveler\w*|center(s|ed)?|favorite\w*|gray|meters?|kilometers?|theaters?|neighbor\w*|honor\w*|harbors?|armor\w*|customiz\w*|organiz\w*|realiz\w*|recogniz\w*|apologiz\w*|catalog|program)\b/i;
const NAMED_KEY = /\b(Space|Shift|Ctrl|Control|Alt|Tab|Enter|Esc|Escape|WASD|Numpad\w*|spacebar)\b/;
const LETTER_KEY = /\b(?:[Pp]ress|[Hh]old|[Hh]it|[Kk]ey)\s+(?:the\s+)?[A-Z](?![\w’'])/;

/** What is wrong with one line of text, by the rules every line keeps. */
function lineProblems(where: string, text: string): string[] {
  const problems: string[] = [];
  if (text.trim() !== text) problems.push(`${where}: leading or trailing space`);
  if (text.replace(/\n\n/g, '\u0000').includes('\n')) problems.push(`${where}: a line break that is not a paragraph break`);
  if (/[ \t]\n|\n[ \t]/.test(text)) problems.push(`${where}: a space beside a paragraph break`);
  if (/[<>*`_#]/.test(text)) problems.push(`${where}: markup in plain text`);
  if (/ {2}/.test(text)) problems.push(`${where}: a double space`);
  for (const match of text.matchAll(/\{([^{}]*)\}/g)) {
    if (!ACTIONS.has(match[1]!)) problems.push(`${where}: {${match[1]}} is no action`);
  }
  if (/[{}]/.test(text.replace(/\{[^{}]*\}/g, ''))) problems.push(`${where}: an unpaired brace`);
  const bare = text.replace(/\{[^{}]*\}/g, '');
  const named = NAMED_KEY.exec(bare);
  if (named !== null) problems.push(`${where}: names the key ${named[0]}; write {action}`);
  const letter = LETTER_KEY.exec(bare);
  if (letter !== null) problems.push(`${where}: a literal key in “${letter[0]}”; write {action}`);
  const american = AMERICAN.exec(text);
  if (american !== null) problems.push(`${where}: “${american[0]}” is not British spelling`);
  return problems;
}

function report(problems: readonly string[]): void {
  assert.equal(problems.length, 0, `\n  ${problems.join('\n  ')}`);
}

test('topics: ids, roles, icons and lengths', () => {
  const icons = iconNames();
  const roles = new Set<string>(GUILD_ROLES);
  const ids = new Set<string>();
  const titles = new Set<string>();
  const problems: string[] = [];
  for (const topic of TOPICS) {
    const where = `topic ${topic.id}`;
    if (!/^[a-z]+(-[a-z]+)*$/.test(topic.id)) problems.push(`${where}: the id is not kebab-case`);
    if (ids.has(topic.id)) problems.push(`${where}: the id is used twice`);
    ids.add(topic.id);
    if (titles.has(topic.title)) problems.push(`${where}: the title “${topic.title}” is used twice`);
    titles.add(topic.title);
    if (!roles.has(topic.role)) problems.push(`${where}: no role “${topic.role}”`);
    if (!icons.has(topic.icon)) problems.push(`${where}: no icon “${topic.icon}” in ui.ts`);
    if (topic.title.length === 0 || topic.title.length > MAX_TITLE) problems.push(`${where}: the title is ${topic.title.length} characters`);
    if (topic.summary.length === 0 || topic.summary.length > MAX_SUMMARY) problems.push(`${where}: the summary is ${topic.summary.length} characters`);
    problems.push(...lineProblems(`${where} title`, topic.title), ...lineProblems(`${where} summary`, topic.summary));
    if (topic.pages.length < MIN_PAGES || topic.pages.length > MAX_PAGES) problems.push(`${where}: ${topic.pages.length} pages`);
    const headings = new Set<string>();
    topic.pages.forEach((page, n) => {
      const at = `${where} page ${n + 1}`;
      if (page.heading.length === 0 || page.heading.length > MAX_HEADING) problems.push(`${at}: the heading is ${page.heading.length} characters`);
      if (headings.has(page.heading)) problems.push(`${at}: the heading “${page.heading}” is used twice`);
      headings.add(page.heading);
      problems.push(...lineProblems(`${at} heading`, page.heading), ...lineProblems(at, page.text));
      if (words(page.text) > MAX_WORDS) problems.push(`${at}: ${words(page.text)} words`);
      if (page.touch !== undefined) {
        problems.push(...lineProblems(`${at} touch`, page.touch));
        if (words(page.touch) > MAX_WORDS) problems.push(`${at} touch: ${words(page.touch)} words`);
        if (page.touch === page.text) problems.push(`${at}: the touch page is the same as the page`);
      }
    });
  }
  report(problems);
});

test('roles: every one has topics and greetings', () => {
  const problems: string[] = [];
  for (const role of GUILD_ROLES) {
    const topics = TOPICS.filter((topic) => topic.role === role);
    if (topics.length === 0) problems.push(`${role}: no topics`);
    const greetings = GREETINGS[role];
    if (greetings === undefined) {
      problems.push(`${role}: no greetings`);
      continue;
    }
    const { first, again, farewell } = greetings;
    if (first.length < 4 || first.length > 6) problems.push(`${role}: ${first.length} first greetings`);
    if (again.length < 6 || again.length > 8) problems.push(`${role}: ${again.length} greetings again`);
    if (farewell.length !== 4) problems.push(`${role}: ${farewell.length} farewells`);
    const all = [...first, ...again, ...farewell];
    if (new Set(all).size !== all.length) problems.push(`${role}: a greeting said twice`);
    all.forEach((line, n) => {
      problems.push(...lineProblems(`${role} greeting ${n + 1}`, line));
      if (words(line) > MAX_WORDS / 2) problems.push(`${role} greeting ${n + 1}: ${words(line)} words`);
    });
  }
  report(problems);
});

test('names and tips', () => {
  const problems: string[] = [];
  if (NAMES.length < 50 || NAMES.length > 80) problems.push(`${NAMES.length} names`);
  if (new Set(NAMES).size !== NAMES.length) problems.push('a name given twice');
  for (const name of NAMES) if (!/^\p{Lu}[\p{L}’'-]+$/u.test(name)) problems.push(`“${name}” is not one given name`);
  if (TIPS.length < 30 || TIPS.length > 60) problems.push(`${TIPS.length} tips`);
  if (new Set(TIPS).size !== TIPS.length) problems.push('a tip given twice');
  TIPS.forEach((tip, n) => {
    problems.push(...lineProblems(`tip ${n + 1}`, tip));
    if (tip.includes('\n')) problems.push(`tip ${n + 1}: more than one line`);
    if (words(tip) > MAX_TIP_WORDS) problems.push(`tip ${n + 1}: ${words(tip)} words`);
  });
  report(problems);
});

test('the tally', () => {
  const pages = TOPICS.reduce((sum, topic) => sum + topic.pages.length, 0);
  const longest = Math.max(...TOPICS.flatMap((topic) => topic.pages.flatMap((page) => [words(page.text), words(page.touch ?? '')])));
  for (const role of GUILD_ROLES) console.log(`  ${role.padEnd(13)} ${TOPICS.filter((topic) => topic.role === role).map((topic) => topic.id).join(', ')}`);
  console.log(`  ${TOPICS.length} topics, ${pages} pages, the longest ${longest} words; ${NAMES.length} names, ${TIPS.length} tips`);
  assert.ok(TOPICS.length > 0);
});
