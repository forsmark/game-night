/**
 * Git for the spec checks: run a command, find the branch's base, and list the
 * files that differ from it.
 */
import { spawnSync } from 'node:child_process';

/** Run git in a checkout: its output, or null where it fails. */
export function git(root, args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return result.status === 0 ? result.stdout.trim() : null;
}

/**
 * Where this branch started: its merge base with the first of `baseRefs` that
 * exists. Null where none exists or the branch shares no history with it.
 */
export function baseCommit(root, baseRefs) {
  const ref = baseRefs.find((candidate) => git(root, ['rev-parse', '--verify', '--quiet', candidate]) !== null);
  return (ref && git(root, ['merge-base', 'HEAD', ref])) || null;
}

/**
 * A file's text at a commit, or null where the commit has no such file. The
 * path is relative to `root`, which may be a folder inside the repo.
 */
export const showAt = (root, commit, file) => git(root, ['show', `${commit}:./${file}`]);

/**
 * Every file under `root` that differs from the base in the working tree,
 * untracked ones too, as paths relative to `root`.
 */
export function changedFiles(root, base) {
  const lines = (text) => (text ?? '').split('\n').filter((line) => line !== '');
  return new Set([
    ...lines(git(root, ['diff', '--name-only', '--no-renames', '--relative', base])),
    ...lines(git(root, ['ls-files', '--others', '--exclude-standard'])),
  ]);
}
