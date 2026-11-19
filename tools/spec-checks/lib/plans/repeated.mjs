/**
 * The decisions of the repeated check, on text only, so they are tested without
 * a checkout. A fact lives in one spec: two copies of a list drift apart, and then
 * the specs disagree.
 */
import { nameAtBase } from '../specs/renames.mjs';
import { readRequirements, SEPARATOR } from '../specs/requirements.mjs';

export const NOT_YET_FILE = 'openspec/repeated-lists-not-yet.txt';

/** How many items a list, and a copy, needs before it is reported. */
export const AT_LEAST = 3;

/** Between the two requirements of a copy on the list. */
export const BETWEEN = ' ⇄ ';

/** Longer than this, an item is a clause rather than a thing, as `when the member last renewed a loan`. */
const MAX_WORDS = 4;

const LIST_ITEM = /^\s*([-*+]|\d+\.)\s+/;
const STEP = /^\*\*(GIVEN|WHEN|THEN|AND|BUT)\*\*\s*/;

/** Where a list ends inside a sentence: a colon, a semicolon, a dash, brackets, or a full stop. */
const CLAUSE_END = /[;:()—]|\s–\s|(?<=[.!?])\s+(?=[A-Z*_`])/;

/** Words before an item that name no part of it, as `its` in `its due date`. */
const DETERMINERS =
  /^(?:(?:the|a|an|its|their|his|her|each|every|any|own|one|and|or|both|that)(?:\s+|$))+/;

/**
 * An item that starts a clause or a condition rather than naming a thing, as
 * `whether renewed` or `with no card`.
 */
const OPENER =
  /^(?:whatever|whichever|however|even|also|unless|whether|which|who|whom|whose|with|without|to|by|in|on|at|for|from|as|such|if|when|where|then|than|that|so|because|while|until|after|before|of|into|not|nothing|none|no|only)\b/;

/**
 * An item as two specs would both write it: no markup, lower case, no leading
 * determiner, and no value after it, so `its due date is *Friday*`
 * and `the due date` are one item.
 */
export function normalise(item) {
  return item
    .replace(/[*_`"“”]/g, '')
    .toLowerCase()
    .replace(/\s+\b(?:is|are|was|were|has|have|set to)\b.*$/, '')
    .replace(/[.;:!?]+$/, '')
    .trim()
    .replace(DETERMINERS, '')
    .trim();
}

/** Whether a normalised item names a thing: short, no clause, no number, no bare possessive. */
const isItem = (item) =>
  item !== '' &&
  item.split(' ').length <= MAX_WORDS &&
  !OPENER.test(item) &&
  !/\d/.test(item) &&
  !/'s$/.test(item);

/**
 * One comma-separated segment as its items. An `and` or `or` parts two items only
 * where a new noun phrase follows it, so `first and last day` stays one; the last
 * segment parts at its first, as in `A, B and C`.
 */
function segmentItems(segment, last) {
  const parts = segment.split(/\s+(?:and|or)\s+(?=(?:the|a|an|its|their|each|every)\b|[A-Z*`_])/);
  if (last && parts.length === 1) {
    const joined = /^(.*?)\s+(?:and|or)\s+(.*)$/.exec(segment);
    if (joined) return [joined[1], joined[2]];
  }
  return parts.map((part) => part.replace(/^(?:and|or)\s+/, ''));
}

/** The comma-separated lists of a text: each run of items of at least `AT_LEAST` within one clause. */
export function commaLists(text) {
  const lists = [];
  for (const clause of text.split(CLAUSE_END)) {
    const segments = clause.split(/,\s+/);
    if (segments.length < 2) continue;
    let run = [];
    const close = () => {
      if (run.length >= AT_LEAST) lists.push(run);
      run = [];
    };
    for (const item of segments
      .flatMap((segment, at) => segmentItems(segment, at === segments.length - 1))
      .map(normalise)) {
      if (isItem(item)) run.push(item);
      else close();
    }
    close();
  }
  return lists;
}

/**
 * Every list in some lines of a spec, each as `{ text, items }`: a bulleted list
 * whose items are each a thing, and every comma-separated list. A WHEN step lists
 * actions, not things, so it holds none.
 */
export function readLists(lines) {
  const lists = [];
  let bullets = [];
  let paragraph = [];
  const add = (text, items) => lists.push({ text, items });
  const closeBullets = () => {
    const items = bullets.map((bullet) => normalise(bullet.split(/[,:;—(]|\.\s/)[0]));
    if (items.length >= AT_LEAST && items.every(isItem)) {
      add(bullets.map((bullet) => `- ${bullet}`).join('\n'), items);
    }
    bullets = [];
  };
  const closeParagraph = () => {
    const text = paragraph.join(' ');
    for (const items of commaLists(text)) add(text, items);
    paragraph = [];
  };
  for (const line of lines) {
    const trimmed = line.trim();
    if (LIST_ITEM.test(line)) {
      closeParagraph();
      const item = line.replace(LIST_ITEM, '').trim();
      if (STEP.test(item)) {
        closeBullets();
        if (!item.startsWith('**WHEN**')) {
          for (const items of commaLists(item.replace(STEP, ''))) add(trimmed, items);
        }
      } else {
        bullets.push(item);
        for (const items of commaLists(item)) add(trimmed, items);
      }
    } else if (trimmed === '') {
      closeParagraph();
      closeBullets();
    } else if (/^\s/.test(line) && bullets.length > 0) bullets[bullets.length - 1] += ` ${trimmed}`;
    else {
      closeBullets();
      paragraph.push(trimmed);
    }
  }
  closeParagraph();
  closeBullets();
  return lists;
}

/** Every list of one spec, each with its requirement's key: its text, and its scenarios'. */
export const listsOf = (capability, spec) =>
  readRequirements(capability, spec).flatMap((requirement) =>
    [requirement.body, ...requirement.scenarios.map((scenario) => scenario.lines)].flatMap(
      (lines) => readLists(lines).map((list) => ({ capability, key: requirement.key, ...list })),
    ),
  );

/** A copy's key: its two requirement keys, in order. */
export const copyKey = (a, b) => [a, b].sort().join(BETWEEN);

/**
 * Every copy: two requirements of different specs that hold lists sharing at
 * least `AT_LEAST` items. Each is `{ key, shared, lists }`, with the pair of lists
 * that share the most.
 */
export function findCopies(lists) {
  const copies = new Map();
  for (let i = 0; i < lists.length; i++) {
    const a = lists[i];
    const items = new Set(a.items);
    for (const b of lists.slice(i + 1)) {
      if (a.capability === b.capability) continue;
      const shared = [...new Set(b.items)].filter((item) => items.has(item));
      if (shared.length < AT_LEAST) continue;
      const key = copyKey(a.key, b.key);
      if ((copies.get(key)?.shared.length ?? 0) >= shared.length) continue;
      copies.set(key, { key, shared, lists: a.key < b.key ? [a, b] : [b, a] });
    }
  }
  return [...copies.values()].sort((a, b) => (a.key < b.key ? -1 : 1));
}

/** A copy's line on the list: `<requirement> ⇄ <requirement> › <items shared>`. */
export const listLine = (copy) => `${copy.key}${SEPARATOR}${copy.shared.length}`;

/** A list line's two requirement keys and count, or null where it is not one. */
function parseLine(line) {
  const at = line.lastIndexOf(SEPARATOR);
  const count = line.slice(at + SEPARATOR.length);
  const sides = line.slice(0, at).split(BETWEEN);
  if (at < 0 || sides.length !== 2 || !/^[1-9]\d*$/.test(count)) return null;
  return { key: copyKey(...sides), sides, shared: Number(count) };
}

/** A list's lines as key → line, and a problem for each line it cannot read. */
function readList(lines, problems, listFile = NOT_YET_FILE) {
  const list = new Map();
  for (const line of lines) {
    const parsed = parseLine(line);
    if (!parsed) {
      problems.push(
        `${listFile}: "${line}" is not <requirement>${BETWEEN}<requirement>${SEPARATOR}<count>`,
      );
    } else if (list.has(parsed.key)) {
      problems.push(`${listFile}: ${parsed.key} is listed twice`);
    } else list.set(parsed.key, parsed);
  }
  return list;
}

/** A copy's two lists and the items they share, for a person to judge. */
export const described = (copy) =>
  [
    `${copy.shared.length} items in both: ${copy.shared.join(', ')}`,
    ...copy.lists.map((list) => `    ${list.key}:\n      ${list.text.replace(/\n/g, '\n      ')}`),
  ].join('\n');

const REWRITE = 'Run spec-checks repeated --write';

/**
 * Every way the copies and the list disagree, as one problem each, or none.
 *
 * - `copies`: every copy in the main specs, as `findCopies` finds them.
 * - `notYet`, `baseNotYet`: the list's lines now, and at the branch's base or null.
 * - `renames`: the branch's renames, as `renamesSince` reads them. A copy between
 *   renamed requirements is held to the line their old names had at the base.
 */
export function checkCopies({ copies, notYet, baseNotYet, renames = [], listFile = NOT_YET_FILE }) {
  const problems = [];
  const list = readList(notYet, problems, listFile);
  const found = new Map(copies.map((copy) => [copy.key, copy]));

  for (const copy of copies) {
    const listed = list.get(copy.key)?.shared ?? 0;
    if (copy.shared.length > listed) {
      problems.push(
        `${copy.key}: ${described(copy)}\n` +
          `  A fact lives in one spec: keep the list in the spec that owns it, and refer to it from the other by name and requirement.`,
      );
    }
  }
  for (const [key, line] of list) {
    const now = found.get(key)?.shared.length ?? 0;
    if (now < line.shared) {
      problems.push(
        `${listFile}: ${key} is listed at ${line.shared}, and is now ${now === 0 ? 'no copy' : now}. ${REWRITE}`,
      );
    }
  }

  if (baseNotYet) {
    const before = readList(baseNotYet, []);
    const sidesAtBase = new Set([...before.values()].flatMap((line) => line.sides));
    for (const [key, line] of list) {
      const was = copyKey(
        ...line.sides.map((side) => nameAtBase(side, renames, (name) => sidesAtBase.has(name))),
      );
      const allowed = before.get(was)?.shared ?? 0;
      if (found.has(key) && line.shared > allowed) {
        const named = was === key ? '' : ` as ${was}`;
        problems.push(
          `${listFile}: ${key} is listed at ${line.shared}, and was at ${allowed}${named} at the base. ` +
            `The list only shrinks: refer to the owning spec instead\n  ${described(found.get(key))}`,
        );
      }
    }
  }
  return problems;
}

/** Every copy with its two lists, for a person to judge. */
export const report = (copies) => copies.map((copy) => `${copy.key}\n  ${described(copy)}`);
