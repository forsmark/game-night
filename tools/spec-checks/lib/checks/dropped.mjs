/**
 * `spec-checks dropped`: no requirement left a main spec since the branch's base
 * without a delta that retires it. `openspec validate --strict` checks that a spec
 * parses, not that it still says what it said. A merge that drops a requirement
 * cleanly validates green.
 *
 * A delta retires a requirement when the branch added or changed the delta and it
 * names the requirement under `## REMOVED Requirements`, or as the old name of a rename.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { changedFiles, showAt } from '../git.mjs';
import { readRenames } from '../specs/renames.mjs';
import { readRequirements, SEPARATOR } from '../specs/requirements.mjs';
import { baseOf } from './common.mjs';

const MAIN = /^openspec\/specs\/([^/]+)\/spec\.md$/;
const DELTA = /^openspec\/changes\/.+\/specs\/([^/]+)\/spec\.md$/;

/** The requirement keys one delta retires: those it removes, and the old names it renames. */
export function retiredBy(capability, delta) {
  const removed = [];
  let inBlock = false;
  for (const line of delta.split('\n')) {
    if (/^## /.test(line)) inBlock = /^## REMOVED Requirements\s*$/.test(line);
    const heading = inBlock && /^### Requirement: (.+?)\s*$/.exec(line);
    if (heading) removed.push([capability, heading[1]].join(SEPARATOR));
  }
  return [...removed, ...readRenames(capability, delta).map(({ from }) => from)];
}

const keysOf = (capability, spec) =>
  spec === null ? [] : readRequirements(capability, spec).map(({ key }) => key);

/** Each requirement a main spec held at `base` and holds no more, with no delta retiring it. */
export function dropped(root, base) {
  const files = [...changedFiles(root, base)].sort();
  const read = (file) => (existsSync(join(root, file)) ? readFileSync(join(root, file), 'utf8') : null);
  const retired = new Set(
    files.flatMap((file) => {
      const capability = DELTA.exec(file)?.[1];
      const text = capability && read(file);
      return text ? retiredBy(capability, text) : [];
    }),
  );
  return files.flatMap((file) => {
    const capability = MAIN.exec(file)?.[1];
    if (!capability) return [];
    const now = new Set(keysOf(capability, read(file)));
    return keysOf(capability, showAt(root, base, file)).filter(
      (key) => !now.has(key) && !retired.has(key),
    );
  });
}

export function run(ctx) {
  // With no base, compare with HEAD, so an uncommitted drop still shows.
  const keys = dropped(ctx.root, baseOf(ctx) ?? 'HEAD');
  if (keys.length === 0) return { problems: [], summary: 'no requirement left a main spec without a delta' };
  return {
    problems: keys.map((key) => `${key}: left its main spec with no delta retiring it`),
    hint:
      "Restore each one, or name it in the change's delta spec under '## REMOVED Requirements', or as the FROM of a rename.",
  };
}
