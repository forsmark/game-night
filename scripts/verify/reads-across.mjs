/**
 * Finds what the code of a package, and the tests of the scripts, read outside
 * their own folder. `affected.test.mjs` uses it to hold the map in
 * `affected.mjs` to those reads.
 *
 * It reads paths off the text, so a path that code builds from variables stays
 * unseen. That is why a file that climbs to the repository root must be listed
 * by hand, in READS_THE_WHOLE_REPO.
 */
import { dirname, join, normalize } from 'node:path';
import { EXTRA_TESTS, PACKAGE, READS_THE_WHOLE_REPO, SCRIPTS_DIR, scopeOf } from './affected.mjs';

// `join(__dirname, '..', '..')` says the same as `'../..'`.
const joinArguments = (text) => {
  const apart = /['"`]((?:\.\.\/)*\.\.)['"`]\s*,\s*['"`](\.\.(?:\/[^'"`]*)?)['"`]/;
  let joined = text;
  while (apart.test(joined)) joined = joined.replace(apart, "'$1/$2'");
  return joined;
};

// A climb opens a string, or follows `${__dirname}/`. A bare call starts from
// the working directory, which is the package's folder in a test run.
const CLIMB =
  /(?:(resolve|read\w*Sync|existsSync|statSync)\(\s*)?(?:['"`]|\}\/)((?:\.\.\/)*\.\.)(\/[^'"`\s$]*)?/g;

// A path joined to a constant for the root. Add the names the project uses.
const FROM_THE_ROOT = /(?:join|resolve)\(\s*(?:ROOT|REPO|REPO_ROOT|repoRoot\(\))\s*,\s*['"`]([^'"`$]+)/g;

const isTestOfScripts = (file) => SCRIPTS_DIR !== null && file.startsWith(`${SCRIPTS_DIR}/`);

/** The folder of a package that holds `path`, or undefined. */
const packageOf = (path) => PACKAGE.exec(`${path}/`)?.[0];

/** The folder that a file's own reads stay inside, by its path from the repository. */
const homeOf = (file) => (isTestOfScripts(file) ? SCRIPTS_DIR : packageOf(file));

const inside = (path, folder) => path === folder || path.startsWith(`${folder}/`);

// git ignores `.env`, so no change ever names it.
const isOutside = (path, home) =>
  !path.startsWith('..') && !inside(path, home) && !/(^|\/)\.env$/.test(path);

/** What one file reaches outside its home: paths, and whether it climbs to the root. */
export function readsIn(file, text) {
  const home = homeOf(file);
  const reads = new Set();
  let climbsToRoot = false;
  const joined = joinArguments(text);

  for (const [, bareCall, climb, rest = ''] of joined.matchAll(CLIMB)) {
    const start = bareCall ? home : dirname(file);
    const target = normalize(join(start, climb + rest))
      .replace(/\?.*$/, '')
      .replace(/\/$/, '');
    if (target === '.') climbsToRoot = true;
    else if (isOutside(target, home)) reads.add(target);
  }
  for (const [, path] of joined.matchAll(FROM_THE_ROOT)) {
    const target = path.replace(/^(\.\.\/)+/, '').replace(/\/$/, '');
    if (isOutside(target, home)) reads.add(target);
  }
  return { reads: [...reads], climbsToRoot };
}

/** The name of the package that holds `path`, and every package that depends on it, however far along. */
function reachedBy(path, manifests) {
  const own = manifests.find((manifest) => manifest.folder === packageOf(path));
  if (!own) return new Set();
  const reached = new Set([own.name]);
  for (let grew = true; grew;) {
    grew = false;
    for (const { name, depends } of manifests) {
      if (!reached.has(name) && depends.some((dep) => reached.has(dep))) {
        reached.add(name);
        grew = true;
      }
    }
  }
  return reached;
}

/** A read path as `scopeOf` sees a change. A folder has no name of its own. */
const asChange = (path) => (/\.\w+$/.test(path) ? path : `${path}/`);

function runsWhenChanged(path, file, manifests, extraTests) {
  const scope = scopeOf([asChange(path)], extraTests);
  if (isTestOfScripts(file)) return scope.scripts;
  if (scope.packages === 'all') return true;
  const { name } = manifests.find((manifest) => manifest.folder === homeOf(file));
  if (scope.extra.includes(name)) return true;
  return scope.packages === 'changed' && reachedBy(path, manifests).has(name);
}

/**
 * What the map in `affected.mjs` lacks, one line each. `files` holds the path
 * and the text of each file. `manifests` holds the folder, the name and the
 * workspace dependencies of each package, as the test runner's filter follows them.
 */
export function missingEntries(files, manifests, extraTests = EXTRA_TESTS) {
  return files.flatMap(({ file, text }) => {
    const { reads, climbsToRoot } = readsIn(file, text);
    const scanned = reads
      .filter((path) => !runsWhenChanged(path, file, manifests, extraTests))
      .map((path) => `${file} reads ${path}, and no entry in EXTRA_TESTS runs it`);
    // A script test finds its own scripts from the root, so only its literal paths count.
    return climbsToRoot && !isTestOfScripts(file) && !READS_THE_WHOLE_REPO.includes(file)
      ? [...scanned, `${file} climbs to the repository root, and READS_THE_WHOLE_REPO lacks it`]
      : scanned;
  });
}
