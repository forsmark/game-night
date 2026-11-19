/**
 * What every check shares: the main specs, the branch's base, and a baseline
 * list as it was at the base.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CONFIG_FILE } from '../config.mjs';
import { baseCommit, git } from '../git.mjs';
import { listAt } from '../specs/lists.mjs';

export const SPECS = 'openspec/specs';
export const CHANGES = 'openspec/changes';

export const specFile = (capability) => `${SPECS}/${capability}/spec.md`;

/** The `<capability>/spec.md` files under a folder of specs, by capability, sorted. */
export function specsIn(folder) {
  if (!existsSync(folder)) return [];
  return readdirSync(folder)
    .filter((capability) => existsSync(join(folder, capability, 'spec.md')))
    .sort()
    .map((capability) => ({ capability, text: readFileSync(join(folder, capability, 'spec.md'), 'utf8') }));
}

/** The main specs of the project at `root`. */
export const mainSpecs = (root) => specsIn(join(root, SPECS));

/**
 * The branch's base, found once per run. Where there is none, a check compares
 * nothing and says so. In CI that is a failure: a shallow clone hides the base,
 * and every check would pass without comparing.
 */
export function baseOf(ctx) {
  if (ctx.base === undefined) {
    ctx.base = baseCommit(ctx.root, ctx.config.baseRefs);
    if (!ctx.base && process.env.CI) {
      throw new Error(
        `none of ${ctx.config.baseRefs.join(', ')} exists, so nothing can be compared. ` +
          'In CI, fetch the full history, as actions/checkout with fetch-depth: 0',
      );
    }
    if (!ctx.base) ctx.note(`no base: none of ${ctx.config.baseRefs.join(', ')} exists, so nothing is compared`);
  }
  return ctx.base;
}

/**
 * A baseline's lines at the base. A list the base lacks is empty there when the
 * base already had the checks, so a new list cannot start with gaps in it. It is
 * null when the base had no checks yet, so the branch that adopts them may list
 * today's gaps.
 */
export function baselineAtBase(ctx, file) {
  const base = baseOf(ctx);
  if (!base) return null;
  const lines = listAt(ctx.root, base, file);
  if (lines !== null) return lines;
  return git(ctx.root, ['cat-file', '-e', `${base}:./${CONFIG_FILE}`]) === null ? null : [];
}
