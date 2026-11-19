/**
 * A record of a verify run that passed. A later step, such as a merge script,
 * can find it and skip a second run on the same code and the same base.
 *
 * A record names the tree that verify saw, the base ref and its commit, and the
 * scope. verify writes one only after it exits 0, on a tree that was clean
 * from start to end. Any doubt leaves no record, and the later step runs verify.
 *
 * A merge step uses it like this:
 *
 *   const found = findRecord({ tree, baseRef, baseCommit });
 *   if (!found) run verify;
 *
 * Take `tree` from `git rev-parse <branch>^{tree}` and `baseCommit` from
 * `git rev-parse <baseRef>^{commit}`.
 */
import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { CACHE_DIR } from '../heavy-lock.mjs';

/** Beside the heavy lock, so every worktree and session shares the records. */
export const RECORDS_DIR = process.env.VERIFY_RECORDS ?? `${CACHE_DIR}/verified`;

const MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000;

function git(args, cwd) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : null;
}

/**
 * What a run would verify in `cwd` against `baseRef`: HEAD's commit and tree,
 * the base's commit, and whether the checkout is clean. Clean means
 * `git status --porcelain` is empty: no change to a tracked file and no
 * untracked file that is not ignored, since verify reads both. Null when a ref
 * does not resolve.
 */
export function snapshot(cwd, baseRef) {
  const head = git(['rev-parse', '--verify', '--quiet', 'HEAD^{commit}'], cwd);
  const tree = git(['rev-parse', '--verify', '--quiet', 'HEAD^{tree}'], cwd);
  const base = git(['rev-parse', '--verify', '--quiet', `${baseRef}^{commit}`], cwd);
  const status = git(['status', '--porcelain'], cwd);
  if (!head || !tree || !base || status === null) return null;
  return { head, tree, base: { ref: baseRef, commit: base }, clean: status === '' };
}

/**
 * The record a run leaves, or null. `scope` is `affected` or `full`. Only a
 * run that exited 0, clean at both ends, with HEAD and the base unmoved, earns one.
 */
export function recordOf({ before, after, status, scope, at = new Date() }) {
  if (status !== 0 || !before || !after) return null;
  if (!before.clean || !after.clean) return null;
  if (before.head !== after.head || before.tree !== after.tree) return null;
  if (before.base.ref !== after.base.ref || before.base.commit !== after.base.commit) return null;
  return { head: before.head, tree: before.tree, base: before.base, scope, at: at.toISOString() };
}

const fileOf = (record) => `${record.tree}-${record.base.commit}-${record.scope}.json`;

/** Write `record` whole or not at all, then prune the old ones. */
export function writeRecord(record, dir = RECORDS_DIR, now = Date.now()) {
  mkdirSync(dir, { recursive: true });
  const path = join(dir, fileOf(record));
  const partial = `${path}.${process.pid}.tmp`;
  writeFileSync(partial, `${JSON.stringify(record, null, 2)}\n`);
  renameSync(partial, path);
  prune(dir, now);
  return path;
}

/** Delete records, and partial writes, older than three days. */
export function prune(dir = RECORDS_DIR, now = Date.now()) {
  let names;
  try {
    names = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of names) {
    const path = join(dir, name);
    try {
      if (now - statSync(path).mtimeMs > MAX_AGE_MS) rmSync(path, { force: true });
    } catch {
      // Another session pruned it first.
    }
  }
}

/**
 * The record that lets a merge skip verify on `tree` over `baseRef` at
 * `baseCommit`, with its path, or null. A full run counts for any base ref. An
 * affected run counts only for the same ref, since it chose its tests from it.
 */
export function findRecord({ tree, baseRef, baseCommit }, dir = RECORDS_DIR, now = Date.now()) {
  for (const scope of ['affected', 'full']) {
    const path = join(dir, fileOf({ tree, base: { commit: baseCommit }, scope }));
    let record;
    try {
      if (now - statSync(path).mtimeMs > MAX_AGE_MS) continue;
      record = JSON.parse(readFileSync(path, 'utf8'));
    } catch {
      continue;
    }
    if (record?.tree !== tree || record.base?.commit !== baseCommit) continue;
    if (record.scope === 'affected' && record.base.ref !== baseRef) continue;
    if (record.scope !== 'affected' && record.scope !== 'full') continue;
    return { record, path };
  }
  return null;
}
