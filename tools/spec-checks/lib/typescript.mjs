/**
 * The TypeScript compiler for the coverage check, which parses test files with
 * it. The plugin ships no dependencies, so it loads the copy the project has,
 * and falls back to one beside the plugin.
 */
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PLUGIN = join(fileURLToPath(import.meta.url), '..', '..');

/** The `typescript` module the project at `root` resolves, or the plugin's own. Throws where neither has one. */
export function loadTypeScript(root) {
  for (const from of [root, PLUGIN]) {
    try {
      return createRequire(join(from, 'package.json'))('typescript');
    } catch {
      // Try the next place.
    }
  }
  throw new Error(
    'the coverage check parses test files with TypeScript, and the project has none. Add typescript as a dev dependency',
  );
}
