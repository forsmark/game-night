/**
 * The decisions of the validate check, on data only, so they are tested without
 * a checkout or OpenSpec. OpenSpec fails a requirement whose text above its first
 * scenario is over 500 characters. The list holds the ones a project had before it
 * adopted the check.
 */
import { SEPARATOR } from '../specs/requirements.mjs';

export const NOT_YET_FILE = 'openspec/long-requirements-not-yet.txt';

const LONG = /^Requirement text is very long\b/;
const INDEX = /^requirements\[(\d+)\]/;

/**
 * Every issue of `openspec validate --specs --strict --json`, each with the key of
 * the requirement it names, or null where its path names none. `namesOf(capability)`
 * gives the spec's requirement names in order: OpenSpec names a requirement only by
 * its index, which shifts when one is added.
 */
export function readIssues(report, namesOf) {
  return report.items.flatMap((item) =>
    (item.issues ?? []).map((issue) => {
      const index = INDEX.exec(issue.path ?? '')?.[1];
      const name = index === undefined ? undefined : namesOf(item.id)[Number(index)];
      return {
        capability: item.id,
        path: issue.path ?? '',
        level: issue.level,
        message: issue.message,
        long: LONG.test(issue.message ?? ''),
        key: name === undefined ? null : [item.id, name].join(SEPARATOR),
      };
    }),
  );
}

/** The keys of the requirements OpenSpec finds too long. */
export const longKeys = (issues) =>
  issues.filter((issue) => issue.long && issue.key).map((issue) => issue.key);

const REWRITE = 'Run spec-checks validate --write';

/**
 * Every way the specs and the list disagree, as one problem each, or none.
 *
 * - `issues`: every issue OpenSpec reports, as `readIssues` reads them.
 * - `keys`: the key of every requirement in the specs.
 * - `notYet`, `baseNotYet`: the list's lines now, and at the branch's base or null.
 */
export function checkLong({ issues, keys, notYet, baseNotYet, listFile = NOT_YET_FILE }) {
  const problems = [];
  const list = new Set();
  for (const line of notYet) {
    if (list.has(line)) problems.push(`${listFile}: ${line} is listed twice`);
    list.add(line);
  }
  const known = new Set(keys);

  for (const issue of issues) {
    const where = issue.key ?? `${issue.capability} ${issue.path}`.trim();
    if (!issue.long || !issue.key) {
      problems.push(`${where}: [${issue.level}] ${issue.message}`);
    } else if (!list.has(issue.key)) {
      problems.push(
        `${issue.key}: its text above the first scenario is over 500 characters. ` +
          `Move examples and edge cases into scenarios, or split it.`,
      );
    }
  }

  const long = new Set(longKeys(issues));
  for (const key of list) {
    if (!known.has(key)) problems.push(`${listFile}: ${key} is in no spec. ${REWRITE}`);
    else if (!long.has(key)) problems.push(`${listFile}: ${key} is no longer long. ${REWRITE}`);
  }

  if (baseNotYet) {
    const before = new Set(baseNotYet);
    for (const key of list) {
      if (known.has(key) && !before.has(key)) {
        problems.push(
          `${listFile}: ${key} was not on the list at the base. ` +
            `The list only shrinks: shorten the requirement instead`,
        );
      }
    }
  }
  return problems;
}
