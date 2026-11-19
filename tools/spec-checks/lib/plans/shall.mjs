/**
 * The decisions of the shall check, on text only, so they are tested without a
 * checkout. A SHALL sentence is a rule, and a rule no scenario shows is a rule no
 * test checks.
 */
import { nameAtBase } from '../specs/renames.mjs';
import { readRequirements, SEPARATOR, shallSentences } from '../specs/requirements.mjs';

export const NOT_YET_FILE = 'openspec/shall-not-yet.txt';

/**
 * Every requirement of one spec with its SHALL sentences and how many scenarios
 * it has. `excess` is how many more sentences than scenarios it has, at least 0.
 */
export const requirementsOf = (capability, spec) =>
  readRequirements(capability, spec).map((requirement) => {
    const sentences = shallSentences(requirement);
    const scenarios = requirement.scenarios.length;
    return {
      key: requirement.key,
      sentences,
      scenarios,
      excess: Math.max(0, sentences.length - scenarios),
    };
  });

/** A gap's line on the list: `<capability> › <requirement> › <excess>`. */
export const listLine = (requirement) => `${requirement.key}${SEPARATOR}${requirement.excess}`;

/** A list line's key and excess, or null where it has no count at its end. */
function parseLine(line) {
  const at = line.lastIndexOf(SEPARATOR);
  const count = line.slice(at + SEPARATOR.length);
  if (at < 0 || !/^[1-9]\d*$/.test(count)) return null;
  return { key: line.slice(0, at), excess: Number(count) };
}

/** A list's lines as key → excess, and a problem for each line it cannot read. */
function readList(lines, problems, listFile = NOT_YET_FILE) {
  const list = new Map();
  for (const line of lines) {
    const parsed = parseLine(line);
    if (!parsed) {
      problems.push(`${listFile}: "${line}" is not <capability> › <requirement> › <count>`);
    } else if (list.has(parsed.key)) {
      problems.push(`${listFile}: ${parsed.key} is listed twice`);
    } else list.set(parsed.key, parsed.excess);
  }
  return list;
}

/** A requirement's counts and its SHALL sentences, one per line, for a person to judge. */
const described = (requirement) =>
  [
    `${requirement.sentences.length} SHALL sentences and ${requirement.scenarios} scenarios:`,
    ...requirement.sentences.map((sentence) => `    - ${sentence}`),
  ].join('\n');

const REWRITE = 'Run spec-checks shall --write';

/**
 * Every way the requirements and the list disagree, as one problem each, or none.
 *
 * - `requirements`: every requirement in the main specs, as `requirementsOf` reads it.
 * - `notYet`, `baseNotYet`: the list's lines now, and at the branch's base or null.
 * - `renames`: the branch's renames, as `renamesSince` reads them. A renamed
 *   requirement's line is held to the line its old name had at the base.
 */
export function checkShall({ requirements, notYet, baseNotYet, renames = [], listFile = NOT_YET_FILE }) {
  const problems = [];
  const list = readList(notYet, problems, listFile);
  const known = new Map(requirements.map((requirement) => [requirement.key, requirement]));

  for (const requirement of requirements) {
    const listed = list.get(requirement.key) ?? 0;
    if (requirement.excess > listed) {
      problems.push(
        `${requirement.key}: ${described(requirement)}\n` +
          `  Add a scenario for each rule no scenario shows, or judge a sentence no rule and reword it. ` +
          `Do not merge two SHALL sentences or turn a rule into prose to meet the count.`,
      );
    } else if (requirement.excess < listed) {
      problems.push(
        `${listFile}: ${requirement.key} is listed at ${listed}, and is now ${requirement.excess}. ${REWRITE}`,
      );
    }
  }

  for (const key of list.keys()) {
    if (!known.has(key)) problems.push(`${listFile}: ${key} is in no spec. ${REWRITE}`);
  }

  if (baseNotYet) {
    const before = readList(baseNotYet, []);
    for (const [key, excess] of list) {
      const was = nameAtBase(key, renames, (name) => before.has(name));
      const allowed = before.get(was) ?? 0;
      if (known.has(key) && excess > allowed) {
        const named = was === key ? '' : ` as ${was}`;
        problems.push(
          `${listFile}: ${key} is listed at ${excess}, and was at ${allowed}${named} at the base. ` +
            `The list only shrinks: add scenarios instead\n  ${described(known.get(key))}`,
        );
      }
    }
  }
  return problems;
}

/** Every requirement with more SHALL sentences than scenarios, under its spec, with its sentences. */
export function report(requirements) {
  const lines = [];
  let capability = null;
  for (const requirement of requirements.filter((candidate) => candidate.excess > 0)) {
    const [spec, name] = requirement.key.split(SEPARATOR);
    if (spec !== capability) {
      if (capability !== null) lines.push('');
      lines.push(`${spec}:`);
      capability = spec;
    }
    lines.push(`  ${name}: ${described(requirement)}`);
  }
  return lines;
}
