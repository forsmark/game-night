/**
 * A project's spec checks config, openspec/checks.json, with the defaults filled
 * in. The file's presence is the project's opt-in: without it, no check runs.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

export const CONFIG_FILE = 'openspec/checks.json';

/** The checks `verify` runs when the config names none, in this order. */
export const ALL_CHECKS = ['validate', 'coverage', 'shall', 'dropped', 'repeated', 'gate'];

const DEFAULTS = {
  baseRefs: ['origin/main'],
  checks: ALL_CHECKS,
  baselines: {
    validate: 'openspec/long-requirements-not-yet.txt',
    coverage: 'e2e/coverage/not-yet.txt',
    shall: 'openspec/shall-not-yet.txt',
    repeated: 'openspec/repeated-lists-not-yet.txt',
  },
  coverage: { mapDir: 'e2e/coverage', adapters: [] },
  glossary: null,
  sweep: { groups: {}, dismissed: 'openspec/disagreements-dismissed.txt' },
  extra: [],
};

const ADAPTERS = ['playwright', 'vitest', 'node-test'];

/** The folder at or above `start` that holds openspec/checks.json, or null. */
export function findRoot(start) {
  let folder = resolve(start);
  for (;;) {
    if (existsSync(join(folder, CONFIG_FILE))) return folder;
    const parent = dirname(folder);
    if (parent === folder) return null;
    folder = parent;
  }
}

/** Every problem with a config's shape, as one line each, or none. */
export function configProblems(config) {
  const problems = [];
  const isList = (value) => Array.isArray(value) && value.every((item) => typeof item === 'string');
  if (!isList(config.baseRefs) || config.baseRefs.length === 0) {
    problems.push('"baseRefs" is a list of one or more refs, as ["origin/main"]');
  }
  if (!isList(config.checks)) problems.push('"checks" is a list of check names');
  else {
    for (const name of config.checks) {
      if (!ALL_CHECKS.includes(name)) problems.push(`"checks" names ${name}, which is none of ${ALL_CHECKS.join(', ')}`);
    }
  }
  const adapters = config.coverage.adapters ?? [];
  if (!Array.isArray(adapters)) problems.push('"coverage.adapters" is a list of { "kind", "roots" }');
  for (const adapter of Array.isArray(adapters) ? adapters : []) {
    if (adapter === null || typeof adapter !== 'object') {
      problems.push('a coverage adapter is { "kind", "roots" }');
      continue;
    }
    if (!ADAPTERS.includes(adapter.kind)) {
      problems.push(`a coverage adapter's "kind" is one of ${ADAPTERS.join(', ')}, not ${adapter.kind}`);
    }
    if (!isList(adapter.roots) || adapter.roots.length === 0) {
      problems.push(`the ${adapter.kind} adapter needs "roots", a list of folders`);
    }
  }
  const groups = config.sweep.groups ?? {};
  if (typeof groups !== 'object' || Array.isArray(groups)) problems.push('"sweep.groups" maps a group name to a list of capabilities');
  for (const [group, capabilities] of Object.entries(typeof groups === 'object' && !Array.isArray(groups) ? groups : {})) {
    if (!isList(capabilities)) problems.push(`sweep group ${group} is a list of capabilities`);
  }
  if (!Array.isArray(config.extra)) problems.push('"extra" is a list of commands');
  for (const extra of Array.isArray(config.extra) ? config.extra : []) {
    const command = typeof extra === 'string' ? extra : extra?.command;
    if (typeof command !== 'string' || command.trim() === '') {
      problems.push('an "extra" entry is a command, or { "name", "command", "preview" }');
    }
  }
  return problems;
}

/** A config's text read over the defaults, one level deep. */
export function parseConfig(text) {
  const own = JSON.parse(text);
  const config = { ...DEFAULTS, ...own };
  for (const field of ['baselines', 'coverage', 'sweep']) {
    config[field] = { ...DEFAULTS[field], ...(own[field] ?? {}) };
  }
  return config;
}

/** The config of the project at `root`. Throws where it is absent or wrong. */
export function loadConfig(root) {
  const path = join(root, CONFIG_FILE);
  if (!existsSync(path)) {
    throw new Error(`no ${CONFIG_FILE} in ${root}. Copy the plugin's templates/openspec/checks.json there to opt in`);
  }
  let config;
  try {
    config = parseConfig(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new Error(`${CONFIG_FILE}: ${error.message}`);
  }
  const problems = configProblems(config);
  if (problems.length > 0) throw new Error(`${CONFIG_FILE}:\n  ${problems.join('\n  ')}`);
  return config;
}
