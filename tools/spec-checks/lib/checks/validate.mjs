/**
 * `spec-checks validate`: run `openspec validate --specs --strict` and fail on
 * every issue it reports, except a requirement too long that the baseline lists.
 */
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { checkLong, longKeys, readIssues } from '../plans/long.mjs';
import { readRequirements } from '../specs/requirements.mjs';
import { readList, writeList } from '../specs/lists.mjs';
import { baselineAtBase, mainSpecs } from './common.mjs';

/** The OpenSpec versions the checks were tested with. */
export const TESTED_OPENSPEC = ['1.16.0', '2.1.0'];

/** The version of the openspec binary on the PATH, or null where it prints none. */
function openspecVersion(root) {
  const result = spawnSync('openspec', ['--version'], { cwd: root, encoding: 'utf8' });
  return /\d+\.\d+\.\d+/.exec(result.stdout ?? '')?.[0] ?? null;
}

function validate(root) {
  const result = spawnSync('openspec', ['validate', '--specs', '--strict', '--json', '--no-interactive'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error?.code === 'ENOENT') throw new Error('no openspec CLI on the PATH');
  try {
    return JSON.parse(result.stdout);
  } catch {
    // Exit 1 with JSON is the normal failing case. No JSON at all is a crash.
    throw new Error(`openspec validate printed no report (exit ${result.status}): ${result.stderr}`);
  }
}

export function run(ctx) {
  const requirements = new Map(
    mainSpecs(ctx.root).map(({ capability, text }) => [capability, readRequirements(capability, text)]),
  );
  const namesOf = (capability) => (requirements.get(capability) ?? []).map(({ name }) => name);
  const issues = readIssues(validate(ctx.root), namesOf);
  const version = openspecVersion(ctx.root);
  if (!TESTED_OPENSPEC.includes(version)) {
    ctx.note(`openspec ${version ?? 'of an unknown version'} is untested here. Tested: ${TESTED_OPENSPEC.join(', ')}`);
  }
  const keys = [...requirements.values()].flat().map(({ key }) => key);
  const listFile = ctx.config.baselines.validate;
  const listPath = join(ctx.root, listFile);

  if (ctx.write) {
    const lines = longKeys(issues);
    writeList(listPath, lines);
    ctx.note(`wrote ${lines.length} lines to ${listFile}`);
  }
  const notYet = readList(listPath);
  const problems = checkLong({ issues, keys, notYet, baseNotYet: baselineAtBase(ctx, listFile), listFile });
  return {
    problems,
    summary: `every spec validates, with ${notYet.length} of ${keys.length} requirements long not yet`,
  };
}
