/**
 * `spec-checks gate`: what changed in a change's delta specs and design.md since
 * its gate, the commit a person approved the proposal at.
 *
 *   gate <change> [--gate <commit>]   print each requirement at the gate and now
 *   gate --check                      fail on a rule dropped after the gate in any
 *                                     change the branch proposed since its base
 *
 * The gate is the newest commit with the trailer `Spec-Gate: <change>`, or else
 * the commit that added the change's proposal.md.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { changedFiles, git, showAt } from '../git.mjs';
import { compareDeltas, designChange, droppedRules, OVERRIDE_HEADING, overrides, printout } from '../specs/gate.mjs';
import { baseOf, CHANGES } from './common.mjs';

const ARCHIVED = /^\d{4}-\d{2}-\d{2}-(.+)$/;

/** Where a change lives now: its own folder, or its newest archive. Null where neither is. */
export function changeFolder(root, change) {
  if (existsSync(join(root, CHANGES, change, 'proposal.md'))) return `${CHANGES}/${change}`;
  const archive = join(root, CHANGES, 'archive');
  const archived = existsSync(archive)
    ? readdirSync(archive)
        .filter((name) => ARCHIVED.exec(name)?.[1] === change)
        .sort()
    : [];
  return archived.length > 0 ? `${CHANGES}/archive/${archived.at(-1)}` : null;
}

/** The newest commit with the trailer `Spec-Gate: <change>`, or the one that added its proposal. */
export function gateOf(root, change) {
  const trailer = git(root, [
    'log',
    '-n1',
    '--format=%H',
    '-E',
    `--grep=^Spec-Gate: *${change.replace(/[^\w-]/g, '\\$&')} *$`,
    'HEAD',
  ]);
  if (trailer) return trailer;
  const added = git(root, ['log', '-n1', '--format=%H', '--diff-filter=A', 'HEAD', '--', `${CHANGES}/${change}/proposal.md`]);
  return added || null;
}

const DELTA = /\/specs\/([^/]+)\/spec\.md$/;

/** A change's delta specs at a commit, as capability → text. */
function deltasAt(root, commit, folder) {
  const files = (git(root, ['ls-tree', '-r', '--name-only', commit, '--', `${folder}/specs`]) ?? '')
    .split('\n')
    .filter((file) => DELTA.test(file));
  return new Map(files.map((file) => [DELTA.exec(file)[1], showAt(root, commit, file) ?? '']));
}

/** A change's delta specs in the working tree, as capability → text. */
function deltasNow(root, folder) {
  const specs = join(root, folder, 'specs');
  if (!existsSync(specs)) return new Map();
  return new Map(
    readdirSync(specs)
      .filter((capability) => existsSync(join(specs, capability, 'spec.md')))
      .map((capability) => [capability, readFileSync(join(specs, capability, 'spec.md'), 'utf8')]),
  );
}

const readOr = (path, fallback) => (existsSync(path) ? readFileSync(path, 'utf8') : fallback);

/** A change compared with its gate: each requirement, design.md, and the rules it dropped. */
export function compare(root, change, gate) {
  const folder = changeFolder(root, change);
  if (!folder) throw new Error(`no change ${change} under ${CHANGES}, archived or not`);
  const atGate = `${CHANGES}/${change}`;
  const entries = compareDeltas(deltasAt(root, gate, atGate), deltasNow(root, folder));
  const design = designChange(
    showAt(root, gate, `${atGate}/design.md`),
    readOr(join(root, folder, 'design.md'), null),
  );
  const problems = droppedRules(entries, overrides(readOr(join(root, folder, 'proposal.md'), '')));
  return { entries, design, problems };
}

/**
 * The rules a change had dropped since its gate as it stood at `commit`, found
 * from the files at that commit, active or archived. Empty where the change was
 * absent then.
 */
function droppedAt(root, change, gate, commit) {
  const escaped = change.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const folder = new RegExp(`^${CHANGES}/(?:archive/\\d{4}-\\d{2}-\\d{2}-)?${escaped}/`);
  const files = (git(root, ['ls-tree', '-r', '--name-only', commit, '--', CHANGES]) ?? '')
    .split('\n')
    .filter((file) => folder.test(file));
  const deltas = new Map(
    files.filter((file) => DELTA.test(file)).map((file) => [DELTA.exec(file)[1], showAt(root, commit, file) ?? '']),
  );
  const proposal = files.find((file) => file.endsWith('/proposal.md'));
  const named = overrides(proposal ? (showAt(root, commit, proposal) ?? '') : '');
  return new Set(droppedRules(compareDeltas(deltasAt(root, gate, `${CHANGES}/${change}`), deltas), named).map(({ key }) => key));
}

/** The changes whose files differ from the base, by name, archived ones included. */
export function changesSince(root, base) {
  const names = new Set();
  for (const file of changedFiles(root, base)) {
    const match = /^openspec\/changes\/(?:archive\/([^/]+)|([^/]+))\//.exec(file);
    const name = match && (match[1] ? ARCHIVED.exec(match[1])?.[1] : match[2]);
    if (name && name !== 'archive') names.add(name);
  }
  return [...names].sort();
}

/**
 * Every change whose files the branch changed, checked against its gate. A gate
 * at or before the base still counts: a proposal can merge in one pull request
 * and its apply in the next, and apply is where a rule gets dropped.
 */
function check(ctx) {
  const base = baseOf(ctx);
  if (!base) return { problems: [], summary: 'no base, so no change is compared with its gate' };
  const checked = [];
  const problems = [];
  for (const change of changesSince(ctx.root, base)) {
    const gate = gateOf(ctx.root, change);
    if (!gate || !changeFolder(ctx.root, change)) continue;
    checked.push(change);
    // A gate before the base: a rule dropped before the base was judged on the branch that dropped it.
    const earlier =
      git(ctx.root, ['merge-base', '--is-ancestor', gate, base]) !== null ? droppedAt(ctx.root, change, gate, base) : new Set();
    for (const { key } of compare(ctx.root, change, gate).problems.filter(({ key }) => !earlier.has(key))) {
      problems.push(`${change}: ${key} lost a SHALL word since the gate and kept every scenario`);
    }
  }
  return {
    problems,
    hint:
      `Restore each rule, or name it in proposal.md under "## ${OVERRIDE_HEADING}". ` +
      'Run spec-checks gate <change> to see each requirement at the gate and now.',
    summary: `${checked.length} changes touched on this branch${checked.length ? ` (${checked.join(', ')})` : ''}, none lost a SHALL word with no scenario`,
  };
}

/** The printout for one change. */
function show(ctx) {
  const { args } = ctx;
  const change = args.find((arg, at) => !arg.startsWith('--') && args[at - 1] !== '--gate');
  if (!change) throw new Error('name a change, or pass --check');
  const named = args.includes('--gate') ? args[args.indexOf('--gate') + 1] : null;
  const gate = named ? git(ctx.root, ['rev-parse', '--verify', `${named}^{commit}`]) : gateOf(ctx.root, change);
  if (!gate) throw new Error(named ? `no commit ${named}` : `no gate for ${change}: pass --gate <commit>`);
  const result = compare(ctx.root, change, gate);
  console.log(`${change}, gate ${git(ctx.root, ['log', '-n1', '--format=%h %s', gate])}`);
  console.log(printout(result));
  return { problems: result.problems.map(({ key }) => key), summary: null, quiet: true };
}

export function run(ctx) {
  return ctx.args.includes('--check') || ctx.fromVerify ? check(ctx) : show(ctx);
}
