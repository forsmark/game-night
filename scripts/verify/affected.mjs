/**
 * Which tests `verify --affected` runs, from the files that a branch changes.
 * The full suite still runs once per batch, before a release. So a test that
 * this skips still runs before anything ships.
 *
 * Edit the layout below to match the repository. affected.test.mjs holds the
 * map in EXTRA_TESTS to what the tests read.
 */

/**
 * A path inside a workspace package. The match is the package's folder, such as
 * `packages/core`. Write another pattern when packages sit elsewhere.
 */
export const PACKAGE = /^(apps|packages)\/[^/]+(?=\/)/;

/**
 * The folder of scripts that is no workspace package. Its tests run with
 * `node --test`, because the workspace's test runner never sees them. Null when
 * the repository has no such folder.
 */
export const SCRIPTS_DIR = 'scripts';

/**
 * A change that matches one of these alone runs no tests, unless EXTRA_TESTS
 * names it. A string matches a path that starts with it. Leave out a folder
 * that a test reads, or give that read an entry in EXTRA_TESTS.
 */
export const NO_TESTS = [
  'docs/',
  // e2e tests choose their own tests. See references/playwright.md in the skill.
  'e2e/',
  '.claude/',
  // Markdown files at the root, such as README.md.
  /^[^/]+\.md$/,
];

/** The name EXTRA_TESTS uses for the tests of SCRIPTS_DIR. */
export const SCRIPT_TESTS = 'scripts';

/**
 * What runs when a path changes, beyond the package it sits in and the
 * dependents of that package. The test runner finds those by itself. Each entry
 * names a test that reads a file outside its own package, and why.
 * `affected.test.mjs` fails when a test reads across packages and no entry here
 * runs it. `tests` holds package names, or SCRIPT_TESTS.
 */
export const EXTRA_TESTS = [
  // `og-image.test.ts` in @acme/api draws with the fonts of the web app.
  // { path: /^apps\/web\/public\/fonts\//, tests: ['@acme/api'] },
];

/**
 * A file that climbs to the repository root can read anything, and a scan of
 * its text cannot see what. So a person reads it, gives its reads an entry in
 * EXTRA_TESTS, and names it here, as a path from the root.
 */
export const READS_THE_WHOLE_REPO = [];

const matches = (file, rule) => (typeof rule === 'string' ? file.startsWith(rule) : rule.test(file));

/**
 * What a change to `files` runs, as `{ packages, extra, scripts }`.
 * `packages` is `all`, `changed` or `none`. `changed` means the changed
 * packages and their dependents, which the test runner's filter selects.
 * `extra` names more packages to test. `scripts` says whether the tests of
 * SCRIPTS_DIR run.
 */
export function scopeOf(files, extraTests = EXTRA_TESTS) {
  let packages = 'none';
  let scripts = false;
  const extra = new Set();
  for (const file of files) {
    for (const { path, tests } of extraTests) {
      if (!path.test(file)) continue;
      for (const test of tests) {
        if (test === SCRIPT_TESTS) scripts = true;
        else extra.add(test);
      }
    }
    if (SCRIPTS_DIR && file.startsWith(`${SCRIPTS_DIR}/`)) {
      scripts = true;
    } else if (PACKAGE.test(file)) {
      if (packages === 'none') packages = 'changed';
    } else if (NO_TESTS.some((rule) => matches(file, rule))) {
      continue;
    } else {
      // A root file, such as the lockfile or a shared config, can change any
      // package. A filter by changed packages can map it to none of them.
      packages = 'all';
      scripts = SCRIPTS_DIR !== null;
    }
  }
  return { packages, extra: packages === 'all' ? [] : [...extra].sort(), scripts };
}
