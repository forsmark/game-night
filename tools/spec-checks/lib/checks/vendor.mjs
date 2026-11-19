/**
 * `spec-checks vendor`: copy the CLI into the project at tools/spec-checks/, so
 * CI runs the checks without the plugin. The copy also pins the version: the
 * hook runs a project's copy before the plugin's own.
 */
import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const VENDOR_DIR = 'tools/spec-checks';

const PLUGIN = join(fileURLToPath(import.meta.url), '..', '..', '..');

export function run(ctx) {
  const target = join(ctx.root, VENDOR_DIR);
  if (PLUGIN === target) throw new Error('this is the vendored copy. Run vendor from the plugin');
  const { version } = JSON.parse(readFileSync(join(PLUGIN, '.claude-plugin', 'plugin.json'), 'utf8'));
  const before = existsSync(join(target, 'VERSION')) ? readFileSync(join(target, 'VERSION'), 'utf8').trim() : null;
  rmSync(target, { recursive: true, force: true });
  for (const folder of ['bin', 'lib']) cpSync(join(PLUGIN, folder), join(target, folder), { recursive: true });
  writeFileSync(join(target, 'VERSION'), `${version}\n`);
  writeFileSync(
    join(target, 'README.md'),
    [
      '# spec-checks',
      '',
      'A copy of the spec-checks CLI from the fstack plugin of the same name.',
      'Do not edit it here. Run `spec-checks vendor` again to update it.',
      '',
      'CI runs it as `node tools/spec-checks/bin/spec-checks verify`.',
      '',
    ].join('\n'),
  );
  return {
    problems: [],
    summary: `copied version ${version} to ${VENDOR_DIR}${before && before !== version ? `, replacing ${before}` : ''}`,
  };
}
