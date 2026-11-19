/**
 * `spec-checks coverage`: every scenario in the main specs has one entry in the
 * coverage map, every entry names one test or a reason, the not-yet list gained
 * no line since the base, and a scenario whose text changed since the base had
 * its test or reason re-read. It reads test files and runs none.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { changedFiles, showAt } from '../git.mjs';
import { checkCoverage, readTests, scenarioKeys, scenarioTexts, SEPARATOR, useTypeScript } from '../plans/coverage.mjs';
import { readList, writeList } from '../specs/lists.mjs';
import { loadTypeScript } from '../typescript.mjs';
import { baselineAtBase, baseOf, mainSpecs, specFile } from './common.mjs';

const read = (path) => readFileSync(path, 'utf8');

/** The map's files, as capability → requirement → scenario → entry. */
function readMap(root, mapDir) {
  const folder = join(root, mapDir);
  if (!existsSync(folder)) return {};
  return Object.fromEntries(
    readdirSync(folder)
      .filter((file) => file.endsWith('.json'))
      .sort()
      .map((file) => {
        try {
          return [file.replace(/\.json$/, ''), JSON.parse(read(join(folder, file)))];
        } catch (error) {
          throw new Error(`${mapDir}/${file}: ${error.message}`);
        }
      }),
  );
}

/** The Playwright test files under the adapters' roots, relative to `root`. */
function e2eFiles(root, adapters) {
  return adapters
    .filter((adapter) => adapter.kind === 'playwright')
    .flatMap((adapter) =>
      adapter.roots.flatMap((folder) => {
        const absolute = join(root, folder);
        if (!existsSync(absolute)) return [];
        const suffixes = adapter.match ?? ['.spec.ts', '.spec.tsx', '.spec.js', '.spec.mjs'];
        return readdirSync(absolute, { recursive: true })
          .map(String)
          .filter((file) => suffixes.some((suffix) => file.endsWith(suffix)))
          .map((file) => relative(root, join(absolute, file)));
      }),
    )
    .sort();
}

const hasUnitEntry = (map) =>
  Object.values(map).some((requirements) =>
    Object.values(requirements).some((entries) => Object.values(entries).some((entry) => entry?.unit !== undefined)),
  );

/**
 * The scenarios' texts and the map at the base, and what changed since. It reads
 * a file at the base only where the branch changed it.
 */
function baseOfMap(root, base, specs, map, mapDir) {
  const changed = changedFiles(root, base);
  // A file the base does not have reads as empty.
  const before = (file, now) => (changed.has(file) ? (showAt(root, base, file) ?? '') : now);
  const texts = new Map(
    specs.flatMap(({ capability, text }) => [...scenarioTexts(capability, before(specFile(capability), text))]),
  );
  const baseMap = Object.fromEntries(
    Object.entries(map).map(([capability, requirements]) => {
      const text = before(`${mapDir}/${capability}.json`, null);
      return [capability, text === null ? requirements : JSON.parse(text || '{}')];
    }),
  );
  return { texts, map: baseMap, changed };
}

export function run(ctx) {
  const { mapDir, adapters = [] } = ctx.config.coverage;
  const specs = mainSpecs(ctx.root);
  const scenarios = specs.flatMap(({ capability, text }) => scenarioKeys(capability, text));
  const map = readMap(ctx.root, mapDir);
  const listFile = ctx.config.baselines.coverage;
  const listPath = join(ctx.root, listFile);

  if (ctx.write) {
    const mapped = new Set(
      Object.entries(map).flatMap(([capability, requirements]) =>
        Object.entries(requirements).flatMap(([requirement, entries]) =>
          Object.keys(entries).map((scenario) => [capability, requirement, scenario].join(SEPARATOR)),
        ),
      ),
    );
    const lines = scenarios.filter((key) => !mapped.has(key));
    writeList(listPath, lines);
    ctx.note(`wrote ${lines.length} lines to ${listFile}`);
  }

  const files = e2eFiles(ctx.root, adapters);
  if (files.length > 0 || hasUnitEntry(map)) useTypeScript(loadTypeScript(ctx.root));
  const unitAdapters = adapters.filter((adapter) => adapter.kind !== 'playwright');
  const notYet = readList(listPath);
  const base = baseOf(ctx);
  const problems = checkCoverage({
    scenarios,
    map,
    notYet,
    baseNotYet: baselineAtBase(ctx, listFile),
    tests: files.flatMap((file) => readTests(file, read(join(ctx.root, file)))),
    readUnit: (file) => (existsSync(join(ctx.root, file)) ? read(join(ctx.root, file)) : null),
    texts: new Map(specs.flatMap(({ capability, text }) => [...scenarioTexts(capability, text)])),
    base: base && baseOfMap(ctx.root, base, specs, map, mapDir),
    mapDir,
    listFile,
    unitRoots: unitAdapters.length > 0 ? unitAdapters.flatMap((adapter) => adapter.roots) : null,
  });
  return {
    problems,
    summary: `${scenarios.length - notYet.length} of ${scenarios.length} scenarios mapped, ${notYet.length} not yet`,
  };
}
