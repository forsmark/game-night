/**
 * The two helpers of the spec sweep, which reads every spec for rules that
 * disagree. Neither is a gate.
 *
 *   sweep-groups      fails when a spec is in no sweep group or in two
 *   sweep-dismissed   lists the dismissed pairs whose requirements changed
 *                     after the pair was listed, so a sweep reads them again
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { git, showAt } from '../git.mjs';
import { listLines } from '../specs/lists.mjs';
import { readRequirements, SEPARATOR } from '../specs/requirements.mjs';
import { mainSpecs, specFile } from './common.mjs';

export function runGroups(ctx) {
  const groups = Object.entries(ctx.config.sweep.groups ?? {});
  if (groups.length === 0) return { problems: ['openspec/checks.json names no sweep groups under "sweep.groups"'] };
  const capabilities = mainSpecs(ctx.root).map(({ capability }) => capability);
  const problems = [];
  for (const capability of capabilities) {
    const named = groups.filter(([, members]) => members.includes(capability)).map(([group]) => group);
    if (named.length === 0) problems.push(`${capability} is in no sweep group`);
    if (named.length > 1) problems.push(`${capability} is in ${named.length} sweep groups: ${named.join(', ')}`);
  }
  for (const [group, members] of groups) {
    for (const member of members) {
      if (!capabilities.includes(member)) problems.push(`sweep group ${group} names ${member}, which is no spec`);
    }
  }
  return { problems, summary: `each of ${capabilities.length} specs is in one of ${groups.length} sweep groups` };
}

const BETWEEN = ' ⇄ ';

/** A dismissed line's two sides as `{ capability, requirement }`, or null where a side names no requirement. */
export function readPair(line) {
  const at = line.indexOf(BETWEEN);
  if (at < 0) return null;
  const side = (text) => {
    const [capability, requirement] = text.split(SEPARATOR);
    return requirement === undefined ? null : { capability, requirement };
  };
  return [side(line.slice(0, at)), side(line.slice(at + BETWEEN.length))];
}

/** A requirement's text in a spec, or null where the spec does not have it. */
function requirementText(capability, spec, name) {
  if (spec === null) return null;
  const requirement = readRequirements(capability, spec).find((candidate) => candidate.name === name);
  if (!requirement) return null;
  return [...requirement.body, ...requirement.scenarios.flatMap((scenario) => [scenario.name, ...scenario.lines])]
    .join('\n')
    .trim();
}

export function runDismissed(ctx) {
  const file = ctx.config.sweep.dismissed;
  const path = join(ctx.root, file);
  if (!existsSync(path)) return { problems: [], summary: `no ${file}, so no pair is dismissed` };
  const lines = listLines(readFileSync(path, 'utf8'));
  const stale = [];
  for (const line of lines) {
    const listed = git(ctx.root, ['log', '-1', '--format=%H', '-S', line, '--', file]);
    // A line no commit added is new, so no requirement changed after it.
    if (!listed) continue;
    for (const side of readPair(line) ?? []) {
      if (!side) continue;
      const spec = specFile(side.capability);
      const now = existsSync(join(ctx.root, spec)) ? readFileSync(join(ctx.root, spec), 'utf8') : null;
      const before = requirementText(side.capability, showAt(ctx.root, listed, spec), side.requirement);
      // A side that was no requirement when the pair was listed is a scenario or a file. A person reads it.
      if (before === null) continue;
      const after = requirementText(side.capability, now, side.requirement);
      if (after !== before) {
        stale.push(`${line}\n    ${side.capability}${SEPARATOR}${side.requirement} ${after === null ? 'is gone' : 'changed'} since ${listed.slice(0, 7)}`);
      }
    }
  }
  for (const line of stale) console.log(line);
  return {
    problems: [],
    summary: `${stale.length} of ${lines.length} dismissed pairs have a requirement that changed since the pair was listed${stale.length ? '. A sweep reads them again' : ''}`,
  };
}
