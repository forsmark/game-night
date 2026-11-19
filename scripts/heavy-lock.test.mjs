import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { HELD, heldAbove, lockHolders, parentPid, projectName } from './heavy-lock.mjs';

const MODULE = join(dirname(fileURLToPath(import.meta.url)), 'heavy-lock.mjs');

describe('lockHolders', () => {
  const locks = [
    '1: FLOCK  ADVISORY  WRITE 4242 103:02:917504 0 EOF',
    '1: -> FLOCK  ADVISORY  WRITE 5151 103:02:917504 0 EOF',
    '2: POSIX  ADVISORY  WRITE 777 103:02:12 0 EOF',
    '',
  ].join('\n');

  it('names the process that holds the file, and not one that waits for it', () => {
    assert.deepEqual(lockHolders(locks, 917504), [4242]);
  });

  it('names nobody for a file that no one locks', () => {
    assert.deepEqual(lockHolders(locks, 1), []);
  });
});

describe('parentPid', () => {
  it('reads past a command name that holds spaces and parentheses', () => {
    assert.equal(parentPid('31 (node (x) y) S 17 31 31 0 -1'), 17);
  });
});

describe('projectName', () => {
  const dir = mkdtempSync(join(tmpdir(), 'heavy-lock-name-'));
  after(() => rmSync(dir, { recursive: true, force: true }));
  const env = {
    ...process.env,
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_AUTHOR_NAME: 'Test',
    GIT_AUTHOR_EMAIL: 'test@example.com',
    GIT_COMMITTER_NAME: 'Test',
    GIT_COMMITTER_EMAIL: 'test@example.com',
  };
  const git = (cwd, ...args) => {
    const result = spawnSync('git', args, { cwd, env, encoding: 'utf8' });
    if (result.status !== 0) throw new Error(result.stderr);
  };

  it('is the folder name of the main checkout, also in a worktree', () => {
    const main = join(dir, 'project');
    mkdirSync(main);
    git(main, 'init', '-q', '-b', 'main');
    git(main, 'commit', '-q', '--allow-empty', '-m', 'Start');
    git(main, 'worktree', 'add', '-q', join(dir, 'project-wt'));
    assert.equal(projectName(main), 'project');
    assert.equal(projectName(join(dir, 'project-wt')), 'project');
  });

  it('is the folder name outside a repository', () => {
    const plain = join(dir, 'plain');
    mkdirSync(plain);
    assert.equal(projectName(plain), 'plain');
  });
});

describe('heldAbove', () => {
  const dir = mkdtempSync(join(tmpdir(), 'heavy-lock-'));
  const lock = join(dir, 'heavy.lock');
  writeFileSync(lock, '');
  after(() => rmSync(dir, { recursive: true, force: true }));

  const probe = `import { heldAbove } from ${JSON.stringify(MODULE)};
    process.stdout.write(String(heldAbove({}, ${JSON.stringify(lock)})));`;
  const node = ['node', '--input-type=module', '-e', probe];

  it('is true where a job that holds the lock set the variable', () => {
    assert.equal(heldAbove({ [HELD]: lock }, lock), true);
  });

  it('is true under a flock on the file by hand, so a nested job cannot deadlock', () => {
    const result = spawnSync('flock', ['--nonblock', lock, ...node], { encoding: 'utf8' });
    assert.equal(result.stdout, 'true', result.stderr);
  });

  it('is false where nobody above holds it', () => {
    const result = spawnSync(node[0], node.slice(1), { encoding: 'utf8' });
    assert.equal(result.stdout, 'false', result.stderr);
  });
});
