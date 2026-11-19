/**
 * The record that a passed verify leaves, and verify.mjs writing it. verify
 * runs in a scratch repository with stand-ins for the package managers, so no
 * real check or test runs.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { after, before, beforeEach, describe, it } from 'node:test';
import { HELD } from '../heavy-lock.mjs';
import { SCRIPTS_DIR } from './affected.mjs';
import { findRecord, prune, recordOf, snapshot, writeRecord } from './record.mjs';

const HERE = import.meta.dirname;
const ROOT = join(HERE, '../..');

const clean = {
  head: 'h1',
  tree: 't1',
  base: { ref: 'origin/main', commit: 'b1' },
  clean: true,
};

describe('recordOf', () => {
  const at = new Date('2026-11-16T10:00:00Z');

  it('records the head, the tree, the base and the scope of a clean run that passed', () => {
    assert.deepEqual(recordOf({ before: clean, after: clean, status: 0, scope: 'affected', at }), {
      head: 'h1',
      tree: 't1',
      base: { ref: 'origin/main', commit: 'b1' },
      scope: 'affected',
      at: '2026-11-16T10:00:00.000Z',
    });
  });

  it('records nothing for a failed run', () => {
    assert.equal(recordOf({ before: clean, after: clean, status: 1, scope: 'full', at }), null);
  });

  it('records nothing when the tree was dirty at the start or at the end', () => {
    const dirty = { ...clean, clean: false };
    assert.equal(recordOf({ before: dirty, after: clean, status: 0, scope: 'full', at }), null);
    assert.equal(recordOf({ before: clean, after: dirty, status: 0, scope: 'full', at }), null);
  });

  it('records nothing when HEAD, its tree or the base moved during the run', () => {
    for (const moved of [
      { ...clean, head: 'h2' },
      { ...clean, tree: 't2' },
      { ...clean, base: { ...clean.base, commit: 'b2' } },
    ]) {
      assert.equal(recordOf({ before: clean, after: moved, status: 0, scope: 'full', at }), null);
    }
  });

  it('records nothing when a ref did not resolve', () => {
    assert.equal(recordOf({ before: null, after: clean, status: 0, scope: 'full', at }), null);
  });
});

describe('writeRecord, findRecord and prune', () => {
  let dir;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'verify-records-'));
  });
  after(() => rmSync(dir, { recursive: true, force: true }));

  const record = (extra = {}) => ({
    head: 'h1',
    tree: 't1',
    base: { ref: 'origin/main', commit: 'b1' },
    scope: 'affected',
    at: '2026-11-16T10:00:00.000Z',
    ...extra,
  });
  const wanted = { tree: 't1', baseRef: 'origin/main', baseCommit: 'b1' };

  it('finds a record of the same tree and base commit, with its path', () => {
    const path = writeRecord(record(), dir);
    assert.deepEqual(findRecord(wanted, dir), { record: record(), path });
    assert.deepEqual(readdirSync(dir), [path.split('/').pop()]);
  });

  it('finds none for another tree or another base commit', () => {
    writeRecord(record(), dir);
    assert.equal(findRecord({ ...wanted, tree: 't2' }, dir), null);
    assert.equal(findRecord({ ...wanted, baseCommit: 'b2' }, dir), null);
  });

  it('takes an affected run only against the same base ref, and a full run against any', () => {
    writeRecord(record({ base: { ref: 'origin/other', commit: 'b1' } }), dir);
    assert.equal(findRecord(wanted, dir), null);
    writeRecord(record({ base: { ref: 'origin/other', commit: 'b1' }, scope: 'full' }), dir);
    assert.equal(findRecord(wanted, dir).record.scope, 'full');
  });

  it('finds none in a folder that does not exist', () => {
    assert.equal(findRecord(wanted, join(dir, 'none')), null);
  });

  it('prunes records older than three days, and ignores one that it has not pruned yet', () => {
    const old = writeRecord(record(), dir);
    const fresh = writeRecord(record({ tree: 't2' }), dir);
    const fourDaysAgo = (Date.now() - 4 * 24 * 60 * 60 * 1000) / 1000;
    utimesSync(old, fourDaysAgo, fourDaysAgo);
    assert.equal(findRecord(wanted, dir), null);
    prune(dir);
    assert.equal(existsSync(old), false);
    assert.equal(existsSync(fresh), true);
  });
});

const gitEnv = {
  ...process.env,
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 'Test',
  GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'Test',
  GIT_COMMITTER_EMAIL: 'test@example.com',
};

describe('snapshot', () => {
  let repo;
  const git = (...args) => {
    const result = spawnSync('git', args, { cwd: repo, encoding: 'utf8', env: gitEnv });
    if (result.status !== 0) throw new Error(result.stderr);
    return result.stdout.trim();
  };
  before(() => {
    repo = mkdtempSync(join(tmpdir(), 'verify-snapshot-'));
    git('init', '-q', '-b', 'main');
    writeFileSync(join(repo, '.gitignore'), 'ignored/\n');
    writeFileSync(join(repo, 'a.txt'), 'a');
    git('add', '.');
    git('commit', '-q', '-m', 'Start');
  });
  after(() => rmSync(repo, { recursive: true, force: true }));

  it('names HEAD, its tree and the base commit, and is clean on a clean checkout', () => {
    assert.deepEqual(snapshot(repo, 'main'), {
      head: git('rev-parse', 'HEAD'),
      tree: git('rev-parse', 'HEAD^{tree}'),
      base: { ref: 'main', commit: git('rev-parse', 'main') },
      clean: true,
    });
  });

  it('counts an ignored file as clean', () => {
    mkdirSync(join(repo, 'ignored'), { recursive: true });
    writeFileSync(join(repo, 'ignored/x'), 'x');
    assert.equal(snapshot(repo, 'main').clean, true);
  });

  it('is not clean with a changed tracked file or an untracked file', () => {
    writeFileSync(join(repo, 'a.txt'), 'changed');
    assert.equal(snapshot(repo, 'main').clean, false);
    git('checkout', '--', 'a.txt');
    writeFileSync(join(repo, 'new.txt'), 'new');
    assert.equal(snapshot(repo, 'main').clean, false);
    rmSync(join(repo, 'new.txt'));
    assert.equal(snapshot(repo, 'main').clean, true);
  });

  it('is null when the base does not resolve', () => {
    assert.equal(snapshot(repo, 'origin/nowhere'), null);
  });
});

/**
 * Commands that verify's CONFIG may start. Each stand-in prints its name and
 * arguments, runs FAKE_HOOK, stops verify when FAKE_KILL is set, and exits
 * FAKE_STATUS. Add any other command that the project's checks start.
 */
const STAND_INS = ['pnpm', 'npm', 'npx', 'yarn', 'bun', 'turbo'];

describe('verify.mjs', () => {
  let dir;
  let work;
  let records;
  let env;

  before(() => {
    dir = mkdtempSync(join(tmpdir(), 'verify-e2e-'));
    work = join(dir, 'work');
    records = join(dir, 'records');
    const lock = join(dir, 'heavy.lock');
    const bin = join(dir, 'bin');
    mkdirSync(bin);
    for (const name of STAND_INS) {
      writeFileSync(
        join(bin, name),
        '#!/bin/sh\n' +
          `echo "ran ${name} $*"\n` +
          '[ -n "$FAKE_HOOK" ] && sh -c "$FAKE_HOOK"\n' +
          '[ -n "$FAKE_KILL" ] && kill -TERM $PPID\n' +
          'exit ${FAKE_STATUS:-0}\n',
      );
      chmodSync(join(bin, name), 0o755);
    }
    const outside = { ...gitEnv };
    // Without the runner's context, verify's own `node --test` reports as a run of its own.
    delete outside.NODE_TEST_CONTEXT;
    env = {
      ...outside,
      PATH: `${bin}:${process.env.PATH}`,
      VERIFY_RECORDS: records,
      // A lock of its own, held above as far as verify knows, so no test waits for the machine's lock.
      HEAVY_LOCK_FILE: lock,
      [HELD]: lock,
    };

    mkdirSync(work);
    const scripts = dirname(HERE);
    for (const file of [
      join(scripts, 'verify.mjs'),
      join(scripts, 'heavy-lock.mjs'),
      join(HERE, 'affected.mjs'),
      join(HERE, 'record.mjs'),
    ]) {
      cpSync(file, join(work, relative(ROOT, file)));
    }
    mkdirSync(join(work, 'packages/core/src'), { recursive: true });
    writeFileSync(join(work, 'packages/core/src/index.js'), 'export const one = 1;\n');
    if (SCRIPTS_DIR !== null) {
      writeFileSync(
        join(work, SCRIPTS_DIR, 'ok.test.mjs'),
        "import { it } from 'node:test';\nit('passes', () => {});\n",
      );
    }
    git('init', '-q', '-b', 'main');
    git('add', '.');
    git('commit', '-q', '-m', 'Start');
    git('branch', 'base');
  });
  after(() => rmSync(dir, { recursive: true, force: true }));
  beforeEach(() => rmSync(records, { recursive: true, force: true }));

  function git(...args) {
    const result = spawnSync('git', args, { cwd: work, env, encoding: 'utf8' });
    if (result.status !== 0) throw new Error(result.stderr);
    return result.stdout.trim();
  }
  function verify(args, extra = {}) {
    const result = spawnSync('node', [relative(ROOT, join(dirname(HERE), 'verify.mjs')), ...args], {
      cwd: work,
      env: { ...env, ...extra },
      encoding: 'utf8',
    });
    return { status: result.status, signal: result.signal, out: result.stdout + result.stderr };
  }
  const recorded = () =>
    existsSync(records)
      ? readdirSync(records).map((name) => JSON.parse(readFileSync(join(records, name), 'utf8')))
      : [];

  it('records an affected run that passed on a clean tree', () => {
    const { status, out } = verify(['--affected', '--base', 'base']);
    assert.equal(status, 0, out);
    assert.match(out, /verify: affected since base: no package\. Script tests: no\./);
    const [record, ...more] = recorded();
    assert.equal(more.length, 0);
    assert.deepEqual(
      { ...record, at: undefined },
      {
        head: git('rev-parse', 'HEAD'),
        tree: git('rev-parse', 'HEAD^{tree}'),
        base: { ref: 'base', commit: git('rev-parse', 'base') },
        scope: 'affected',
        at: undefined,
      },
    );
    assert.match(out, /verify: recorded the pass in /);
  });

  it('records a full run as full', () => {
    const { status, out } = verify(['--base', 'base']);
    assert.equal(status, 0, out);
    assert.deepEqual(
      recorded().map((record) => record.scope),
      ['full'],
    );
  });

  it('tests the changed package and its dependents, from the merge base', () => {
    git('checkout', '-q', '-b', 'change');
    try {
      writeFileSync(join(work, 'packages/core/src/index.js'), 'export const one = 2;\n');
      git('commit', '-q', '-am', 'Change core');
      const mergeBase = git('merge-base', 'base', 'HEAD');
      const { status, out } = verify(['--affected', '--base', 'base']);
      assert.equal(status, 0, out);
      assert.match(out, /affected since base: packages\/core and their dependents\./);
      assert.ok(out.includes(`--filter=...[${mergeBase}]`), out);
    } finally {
      git('checkout', '-q', 'main');
    }
  });

  it('records nothing when a step fails', () => {
    const { status } = verify(['--base', 'base'], { FAKE_STATUS: '1' });
    assert.equal(status, 1);
    assert.deepEqual(recorded(), []);
  });

  it('records nothing when it is stopped part way', () => {
    const { signal } = verify(['--base', 'base'], { FAKE_KILL: '1' });
    assert.equal(signal, 'SIGTERM');
    assert.deepEqual(recorded(), []);
  });

  it('records nothing on a dirty tree, and says so', () => {
    writeFileSync(join(work, 'stray.txt'), 'stray');
    try {
      const { status, out } = verify(['--affected', '--base', 'base']);
      assert.equal(status, 0, out);
      assert.deepEqual(recorded(), []);
      assert.match(out, /recorded nothing/);
    } finally {
      rmSync(join(work, 'stray.txt'));
    }
  });

  it('records nothing when the tree changes during the run', () => {
    const { status, out } = verify(['--base', 'base'], { FAKE_HOOK: 'echo late > late.txt' });
    rmSync(join(work, 'late.txt'));
    assert.equal(status, 0, out);
    assert.deepEqual(recorded(), []);
  });

  it('records nothing against a base that does not resolve', () => {
    const { status } = verify(['--affected', '--base', 'origin/nowhere']);
    assert.notEqual(status, 0);
    assert.deepEqual(recorded(), []);
  });
});
