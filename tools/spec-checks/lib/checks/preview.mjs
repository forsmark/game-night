/**
 * `spec-checks preview <change>`: run the checks that read only the specs on the
 * specs as they will be once the change syncs. A fault in a delta then shows
 * before the gate, not after the sync.
 *
 * It syncs the change in a throwaway worktree with this checkout's openspec/
 * folder, committed or not, and touches nothing here. `coverage` does not run:
 * a new scenario has no test until the change is applied.
 */
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CHANGES } from './common.mjs';

/** The checks that read the specs only. */
export const PREVIEW_CHECKS = ['validate', 'shall', 'repeated'];

/** A change's name as a folder name, or null where it could leave openspec/changes. */
export const changeName = (arg) => (typeof arg === 'string' && /^[a-z0-9][a-z0-9-]*$/.test(arg) ? arg : null);

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8' });
  return { ok: result.status === 0, out: `${result.stdout ?? ''}${result.stderr ?? ''}`.trim() };
}

/**
 * Sync `change` in a worktree of `root` at HEAD with `root`'s openspec/ folder,
 * then call `inCopy(copy)`. Returns the sync's result and what `inCopy` returned.
 */
export function inSyncedCopy(root, change, inCopy) {
  const copy = mkdtempSync(join(tmpdir(), 'spec-checks-preview-'));
  const added = run('git', ['worktree', 'add', '--detach', '--quiet', copy, 'HEAD'], root);
  if (!added.ok) {
    rmSync(copy, { recursive: true, force: true });
    return { sync: added, result: null };
  }
  try {
    rmSync(join(copy, 'openspec'), { recursive: true, force: true });
    cpSync(join(root, 'openspec'), join(copy, 'openspec'), { recursive: true });
    const sync = run('openspec', ['archive', change, '--yes'], copy);
    return { sync, result: sync.ok ? inCopy(copy) : null };
  } finally {
    run('git', ['worktree', 'remove', '--force', copy], root);
    rmSync(copy, { recursive: true, force: true });
  }
}

export function runPreview(ctx, runCheck) {
  const change = changeName(ctx.args.find((arg) => !arg.startsWith('--')));
  if (!change) throw new Error('name a change: spec-checks preview <change>');
  if (!existsSync(join(ctx.root, CHANGES, change, 'proposal.md'))) {
    throw new Error(`${CHANGES}/${change} holds no proposal.md`);
  }
  const checks = PREVIEW_CHECKS.filter((name) => ctx.config.checks.includes(name));
  const extras = ctx.config.extra.filter((extra) => typeof extra === 'object' && extra.preview);
  const { sync, result } = inSyncedCopy(ctx.root, change, (copy) => [
    ...checks.map((name) => ({ name, ...runCheck(name, { ...ctx, root: copy, args: [], write: false, base: undefined }) })),
    ...extras.map((extra) => {
      const out = spawnSync(extra.command, { cwd: copy, shell: true, encoding: 'utf8' });
      return {
        name: extra.name ?? extra.command,
        problems: out.status === 0 ? [] : [`${out.stdout ?? ''}${out.stderr ?? ''}`.trim()],
      };
    }),
  ]);
  if (!sync.ok) return { problems: [`${change} does not sync:\n${sync.out}`] };
  const problems = [];
  for (const { name, problems: found, error } of result) {
    if (error) problems.push(`${name}: ${error}`);
    for (const problem of found ?? []) problems.push(`${name}: ${problem}`);
  }
  return {
    problems,
    hint: 'Correct the delta before the Spec-Gate commit.',
    summary: `${change} passes ${result.map(({ name }) => name).join(', ')} as it will sync`,
  };
}
