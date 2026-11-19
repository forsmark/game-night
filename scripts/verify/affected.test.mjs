/**
 * The scope rules of `verify --affected`, and the guard that holds EXTRA_TESTS
 * to what the tests of this repository read.
 *
 * The first two groups use a sample workspace, so they pass in any repository
 * with the template's layout. Change them when you change the layout in
 * affected.mjs. The guard reads this repository.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, it } from 'node:test';
import {
  EXTRA_TESTS,
  PACKAGE,
  READS_THE_WHOLE_REPO,
  SCRIPT_TESTS,
  SCRIPTS_DIR,
  scopeOf,
} from './affected.mjs';
import { missingEntries, readsIn } from './reads-across.mjs';

const ROOT = join(import.meta.dirname, '../..');

/** A sample workspace: two apps that both depend on one package. */
const SAMPLE = [
  { folder: 'packages/core', name: '@acme/core', depends: [] },
  { folder: 'apps/web', name: '@acme/web', depends: ['@acme/core'] },
  { folder: 'apps/api', name: '@acme/api', depends: ['@acme/core'] },
];

/** A sample map: the API's tests read the web app's fonts. */
const SAMPLE_EXTRA = [{ path: /^apps\/web\/public\/fonts\//, tests: ['@acme/api'] }];

describe('what an affected verify tests', () => {
  it('runs the changed packages and their dependents for a change in one', () => {
    assert.deepEqual(scopeOf(['packages/core/src/index.ts']), {
      packages: 'changed',
      extra: [],
      scripts: false,
    });
  });

  it('runs the tests that EXTRA_TESTS names, beside the changed packages', () => {
    assert.deepEqual(scopeOf(['apps/web/public/fonts/a.woff2'], SAMPLE_EXTRA), {
      packages: 'changed',
      extra: ['@acme/api'],
      scripts: false,
    });
  });

  it('runs the script tests when scripts changed', () => {
    assert.deepEqual(scopeOf(['scripts/release.mjs']), {
      packages: 'none',
      extra: [],
      scripts: true,
    });
    const both = scopeOf(['packages/core/src/index.ts', 'scripts/verify.mjs']);
    assert.equal(both.packages, 'changed');
    assert.equal(both.scripts, true);
  });

  it('runs nothing for docs, e2e and markdown at the root', () => {
    assert.deepEqual(scopeOf(['docs/guide.md', 'e2e/tests/home.spec.ts', 'README.md']), {
      packages: 'none',
      extra: [],
      scripts: false,
    });
  });

  it('runs everything for a root file that any package may read', () => {
    for (const file of ['pnpm-lock.yaml', 'package.json', 'turbo.json', 'tsconfig.base.json']) {
      assert.deepEqual(scopeOf([file]), { packages: 'all', extra: [], scripts: true }, file);
    }
  });

  it('runs everything for a file beside the packages but in none of them', () => {
    assert.equal(scopeOf(['packages/README.md']).packages, 'all');
  });

  it('runs nothing when nothing changed', () => {
    assert.deepEqual(scopeOf([]), { packages: 'none', extra: [], scripts: false });
  });
});

describe('the guard on reads across packages', () => {
  it('fails when a test reads another package with no entry', () => {
    const file = 'apps/web/src/test/new.test.ts';
    const text = `readFileSync(join(__dirname, '../../../api/src/schema.sql'))`;
    assert.deepEqual(missingEntries([{ file, text }], SAMPLE, SAMPLE_EXTRA), [
      `${file} reads apps/api/src/schema.sql, and no entry in EXTRA_TESTS runs it`,
    ]);
  });

  it('fails when a test reads a doc with no entry', () => {
    const file = 'apps/web/src/test/new.test.ts';
    const text = `readFileSync(resolve(__dirname, '../../../../docs/deploy.md'))`;
    assert.deepEqual(missingEntries([{ file, text }], SAMPLE, SAMPLE_EXTRA), [
      `${file} reads docs/deploy.md, and no entry in EXTRA_TESTS runs it`,
    ]);
  });

  it('passes when an entry runs the reader', () => {
    const file = 'apps/api/src/og.test.ts';
    const text = `readFileSync(join(__dirname, '../../web/public/fonts/a.woff2'))`;
    assert.deepEqual(missingEntries([{ file, text }], SAMPLE, SAMPLE_EXTRA), []);
  });

  it('fails when a test climbs to the root and READS_THE_WHOLE_REPO lacks it', () => {
    const file = 'packages/core/src/test/new.test.ts';
    const text = `const ROOT = join(__dirname, '..', '..', '..', '..');`;
    assert.deepEqual(missingEntries([{ file, text }], SAMPLE, SAMPLE_EXTRA), [
      `${file} climbs to the repository root, and READS_THE_WHOLE_REPO lacks it`,
    ]);
  });

  it('fails when a script test reads a package', () => {
    const file = `${SCRIPTS_DIR}/new.test.mjs`;
    const text = `readFileSync(join(ROOT, 'apps/web/index.html'))`;
    assert.deepEqual(missingEntries([{ file, text }], SAMPLE, SAMPLE_EXTRA), [
      `${file} reads apps/web/index.html, and no entry in EXTRA_TESTS runs it`,
    ]);
  });

  it('asks nothing of a read of a package that the reader depends on', () => {
    const file = 'apps/web/src/test/new.test.ts';
    const text = `join(__dirname, '../../../../packages/core/src/fixtures')`;
    assert.deepEqual(missingEntries([{ file, text }], SAMPLE, SAMPLE_EXTRA), []);
  });

  it('sees every way a read is written', () => {
    const home = 'apps/web/src/test/new.test.ts';
    const reads = (text, file = home) => readsIn(file, text).reads;
    assert.deepEqual(reads(`resolve('../../packages/core/src')`), ['packages/core/src']);
    assert.deepEqual(reads('`${__dirname}/../../../../docs/a.md`'), ['docs/a.md']);
    assert.deepEqual(reads(`join(__dirname, '..', '..', '../api/src/a.ts')`), [
      'apps/api/src/a.ts',
    ]);
    assert.deepEqual(reads(`join(ROOT, 'apps/api/src')`), ['apps/api/src']);
    assert.deepEqual(reads(`import a from '../../../api/src/a.svg?url'`), ['apps/api/src/a.svg']);
  });

  it('asks nothing of a read inside the package, or of the git-ignored .env', () => {
    const file = 'apps/web/src/test/new.test.ts';
    assert.deepEqual(readsIn(file, `join(__dirname, '../../index.html')`).reads, []);
    assert.deepEqual(readsIn(file, `join(__dirname, '../../../../.env')`).reads, []);
  });
});

/** Every file in the checkout, tracked or new, that git does not ignore. */
function checkoutFiles() {
  const result = spawnSync(
    'git',
    ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
    { cwd: ROOT, encoding: 'utf8' },
  );
  if (result.status !== 0) throw new Error(result.stderr);
  return result.stdout.split('\0').filter(Boolean);
}

/**
 * The folder, the name and the workspace dependencies of each package. Only
 * `dependencies` and `devDependencies` count. A runner that follows more kinds
 * selects more tests, so the guard can only ask for an entry too many.
 */
function manifests(files) {
  const MANIFEST = '/package.json';
  const all = files
    .filter((file) => file.endsWith(MANIFEST))
    .map((file) => ({ file, folder: file.slice(0, -MANIFEST.length) }))
    // A manifest at the top of a package. A fixture deeper inside it is no package.
    .filter(({ file, folder }) => PACKAGE.exec(file)?.[0] === folder)
    .map(({ file, folder }) => ({
      folder,
      ...JSON.parse(readFileSync(join(ROOT, file), 'utf8')),
    }));
  const names = new Set(all.map(({ name }) => name));
  return all.map(({ folder, name, dependencies, devDependencies }) => ({
    folder,
    name,
    depends: Object.keys({ ...dependencies, ...devDependencies }).filter((dep) => names.has(dep)),
  }));
}

const CODE = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;
const THIS_FILE = relative(ROOT, import.meta.filename);

/** The files whose reads a test run follows: the code of each package, and the script tests. */
function readers(files) {
  return files.filter(
    (file) =>
      (PACKAGE.test(file) && CODE.test(file)) ||
      // This file's own examples of a read are no reads.
      (SCRIPTS_DIR !== null &&
        file.startsWith(`${SCRIPTS_DIR}/`) &&
        file.endsWith('.test.mjs') &&
        file !== THIS_FILE),
  );
}

describe('a test in this repository that reads across packages', () => {
  const files = checkoutFiles();
  const workspace = manifests(files);

  it('has an entry that runs it, for every read', () => {
    const texts = readers(files).map((file) => ({
      file,
      text: readFileSync(join(ROOT, file), 'utf8'),
    }));
    assert.deepEqual(missingEntries(texts, workspace), []);
  });

  it('is listed in READS_THE_WHOLE_REPO only when it climbs to the root', () => {
    for (const file of READS_THE_WHOLE_REPO) {
      const text = readFileSync(join(ROOT, file), 'utf8');
      assert.equal(readsIn(file, text).climbsToRoot, true, file);
    }
  });

  it('is named in EXTRA_TESTS only by a package that exists', () => {
    const names = new Set([...workspace.map(({ name }) => name), SCRIPT_TESTS]);
    for (const { tests } of EXTRA_TESTS) {
      for (const test of tests) assert.ok(names.has(test), test);
    }
  });
});
