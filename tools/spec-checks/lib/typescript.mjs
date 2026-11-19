/**
 * The TypeScript compiler for the coverage check, which parses test files with
 * its compiler API. The plugin ships no dependencies, so it loads the copy the
 * project has, and falls back to one beside the plugin.
 *
 * TypeScript 7 compiles natively and ships no compiler API. A project on it keeps
 * the API through `@typescript/typescript6`, the package TypeScript publishes to
 * run beside 7 for tools that need it. So in each place, the check takes the first
 * of these that has the API.
 */
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PLUGIN = join(fileURLToPath(import.meta.url), '..', '..');
const NAMES = ['typescript', '@typescript/typescript6'];

const hasCompilerApi = (ts) => typeof ts?.createSourceFile === 'function';

/**
 * The first TypeScript with a compiler API that the project at `root` resolves,
 * or else the plugin's own. Throws where none has one, and names the package to
 * add when the only TypeScript it found has no API.
 */
export function loadTypeScript(root, places = [root, PLUGIN]) {
  let withoutApi = null;
  for (const from of places) {
    const require = createRequire(join(from, 'package.json'));
    for (const name of NAMES) {
      let ts;
      try {
        ts = require(name);
      } catch {
        continue;
      }
      if (hasCompilerApi(ts)) return ts;
      withoutApi ??= `${name} ${ts?.version ?? ''}`.trim();
    }
  }
  if (withoutApi) {
    throw new Error(
      `the coverage check parses test files with the TypeScript compiler API, and ${withoutApi} has none. ` +
        'TypeScript 7 ships without it. Add @typescript/typescript6 as a dev dependency: TypeScript publishes it to run beside 7',
    );
  }
  throw new Error(
    'the coverage check parses test files with TypeScript, and the project has none. Add typescript as a dev dependency',
  );
}
