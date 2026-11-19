#!/usr/bin/env node
/**
 * One heavy job at a time on this machine. Parallel agents each start a test
 * run, and several full runs at once can use up the memory of the machine.
 *
 *   node scripts/heavy-lock.mjs <command> [arguments]   run any command under the lock
 *
 * scripts/verify.mjs takes the lock itself: it calls holdHeavyLock() first.
 * Give other heavy scripts, such as an e2e run or a build, the same first line.
 * A job waits up to two hours for the lock.
 *
 * A job that runs inside a job that holds the lock does not wait for it. So
 * nesting cannot deadlock: verify can start a heavy script, and a person can
 * still wrap a job in `flock` on this file by hand.
 *
 * The lock is a file under ~/.cache/<name>/, where <name> is the folder name
 * of the main checkout. Every worktree of the repository shares it.
 * HEAVY_LOCK_FILE sets another path, for example one that several projects share.
 *
 * It needs `flock` from util-linux, and reads /proc to find a holder above it.
 * Without `flock` it warns and runs the job with no lock.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * The folder name of the main checkout. A worktree gives the same name as the
 * main checkout, because git names the same common folder for both.
 */
export function projectName(cwd = HERE) {
  const result = spawnSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], {
    cwd,
    encoding: 'utf8',
  });
  if (result.status !== 0) return basename(cwd);
  const common = result.stdout.trim();
  return basename(common) === '.git' ? basename(dirname(common)) : basename(common, '.git');
}

/** The folder this project's lock and verify records live in. Not under TMPDIR: every session must share it. */
export const CACHE_DIR = `${homedir()}/.cache/${projectName()}`;

export const LOCK_FILE = process.env.HEAVY_LOCK_FILE ?? `${CACHE_DIR}/heavy.lock`;

/** Set on a job that runs under the lock, so the jobs it starts know. */
export const HELD = 'HEAVY_LOCK_HELD';

const WAIT_SECONDS = 2 * 60 * 60;
/** flock's exit status when the wait runs out. It differs from the job's own codes. */
const TIMED_OUT = 75;

/**
 * The PIDs that hold a lock on the file with inode `inode`, read from the text
 * of /proc/locks. A line with `->` is a process that still waits, not a holder.
 */
export function lockHolders(procLocks, inode) {
  return procLocks
    .split('\n')
    .map((line) => line.trim().split(/\s+/))
    .filter((fields) => fields[1] !== '->' && fields.length >= 6)
    .filter((fields) => fields[5].split(':')[2] === String(inode))
    .map((fields) => Number(fields[4]));
}

/** The parent PID in the text of /proc/<pid>/stat. The command name can hold spaces and parentheses. */
export function parentPid(stat) {
  return Number(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[1]);
}

function ancestors(pid) {
  const found = [];
  for (let at = pid; at > 1;) {
    try {
      at = parentPid(readFileSync(`/proc/${at}/stat`, 'utf8'));
    } catch {
      break;
    }
    found.push(at);
  }
  return found;
}

/** Whether this process runs under a holder of the lock. */
export function heldAbove(env = process.env, lockFile = LOCK_FILE) {
  if (env[HELD] === lockFile) return true;
  try {
    const holders = lockHolders(readFileSync('/proc/locks', 'utf8'), statSync(lockFile).ino);
    return ancestors(process.pid).some((pid) => holders.includes(pid));
  } catch {
    return false;
  }
}

function say(message) {
  console.error(`heavy-lock: ${message}`);
}

const hasFlock = () => !spawnSync('flock', ['--version']).error;

/** Run `command` with `args` under the lock, and return its exit status. */
export function underLock(command, args) {
  const env = { ...process.env, [HELD]: LOCK_FILE };
  if (!hasFlock()) {
    say('flock was not found, so this job runs without the lock.');
    return spawnSync(command, args, { stdio: 'inherit', env }).status ?? 1;
  }
  mkdirSync(dirname(LOCK_FILE), { recursive: true });
  if (spawnSync('flock', ['--nonblock', LOCK_FILE, 'true']).status !== 0) {
    say(`another heavy job holds ${LOCK_FILE}. Waiting for it, up to two hours.`);
  }
  const result = spawnSync(
    'flock',
    [
      '--wait',
      String(WAIT_SECONDS),
      '--conflict-exit-code',
      String(TIMED_OUT),
      LOCK_FILE,
      command,
      ...args,
    ],
    { stdio: 'inherit', env },
  );
  if (result.error) throw result.error;
  if (result.status === TIMED_OUT) say('gave up after two hours. Nothing ran.');
  return result.status ?? 1;
}

/**
 * Run this script again under the lock and exit with its status, unless a job
 * above it holds the lock. Call it before the script does any work.
 */
export function holdHeavyLock() {
  if (heldAbove()) return;
  process.exit(underLock(process.execPath, [...process.execArgv, ...process.argv.slice(1)]));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [command, ...args] = process.argv.slice(2);
  if (!command) {
    say('expected a command: node scripts/heavy-lock.mjs <command> [arguments]');
    process.exit(1);
  }
  process.exit(
    heldAbove()
      ? (spawnSync(command, args, { stdio: 'inherit' }).status ?? 1)
      : underLock(command, args),
  );
}
