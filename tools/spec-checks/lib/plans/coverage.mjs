/**
 * The decisions of the coverage check, on text and data only, so they are tested
 * without a checkout. The map ties each scenario to the test that shows it, or to
 * a reason it has none, so a scenario no test shows is visible.
 */

/** The TypeScript compiler, from the project the check runs in: see `useTypeScript`. */
let ts = null;

/** Give the plan the TypeScript compiler it parses test files with. */
export function useTypeScript(module) {
  ts = module;
}
import { readRequirements, SEPARATOR } from '../specs/requirements.mjs';

export { SEPARATOR };

/** Every scenario of one spec, with the lines under its heading, in the order the spec has them. */
const readScenarios = (capability, spec) =>
  readRequirements(capability, spec).flatMap((requirement) => requirement.scenarios);

/** Every scenario of one spec, as keys, in the order the spec has them. */
export const scenarioKeys = (capability, spec) =>
  readScenarios(capability, spec).map((scenario) => scenario.key);

/**
 * Every scenario's key and its steps, its whitespace collapsed so that rewrapping
 * a line changes nothing.
 */
export const scenarioTexts = (capability, spec) =>
  new Map(
    readScenarios(capability, spec).map(({ key, lines }) => [
      key,
      lines.join(' ').replace(/\s+/g, ' ').trim(),
    ]),
  );

export const MAP_DIR = 'e2e/coverage';

export const NOT_YET_FILE = `${MAP_DIR}/not-yet.txt`;

/** Where a capability's map is. */
export const mapFile = (capability, mapDir = MAP_DIR) => `${mapDir}/${capability}.json`;

const KINDS = ['e2e', 'unit', 'none'];

/** A `<file> › <title>` reference, split at its first separator. */
function splitReference(reference) {
  const at = reference.indexOf(SEPARATOR);
  return at < 0
    ? [reference, '']
    : [reference.slice(0, at), reference.slice(at + SEPARATOR.length)];
}

const UNIT_TESTS = new Set(['it', 'test']);
const UNIT_GROUPS = new Set(['describe', 'suite']);

/** The name a call starts from: `it` for `it(…)`, `it.only(…)` and `it.each(…)(…)`. */
function calleeRoot(node) {
  let callee = node.expression;
  while (ts.isPropertyAccessExpression(callee) || ts.isCallExpression(callee)) {
    callee = callee.expression;
  }
  return ts.isIdentifier(callee) ? callee.text : null;
}

/** A title as its source spells it, so `${loan.kind} …` names every test that template makes. */
function unitTitle(node) {
  if (isLiteral(node)) return node.text;
  return node !== undefined && ts.isTemplateExpression(node) ? node.getText().slice(1, -1) : null;
}

/**
 * Every Vitest or `node --test` test a unit file declares with a written-out title,
 * as the titles of its describes and its own, outermost first.
 */
export function readUnitTests(file, source) {
  const kind = file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, kind);
  const paths = [];
  const visit = (node, path) => {
    const title = unitTitle(node.arguments?.[0]);
    if (ts.isCallExpression(node) && title !== null) {
      const root = calleeRoot(node);
      if (UNIT_TESTS.has(root)) paths.push([...path, title]);
      if (UNIT_GROUPS.has(root)) {
        ts.forEachChild(node, (child) => visit(child, [...path, title]));
        return;
      }
    }
    ts.forEachChild(node, (child) => visit(child, path));
  };
  visit(tree, []);
  return paths;
}

/**
 * The tests a `<test>` or `<describe> › <test>` name matches: those whose path
 * ends in its parts.
 */
const unitMatches = (paths, name) => {
  const parts = name.split(SEPARATOR);
  return paths.filter(
    (path) =>
      path.length >= parts.length &&
      parts.every((part, at) => path[path.length - parts.length + at] === part),
  );
};

/**
 * Every way the map, the not-yet list and the e2e tests disagree with the specs,
 * as one line each, or none.
 *
 * - `scenarios`: every key in the main specs.
 * - `map`: capability → requirement → scenario → `{ e2e }`, `{ unit }` or `{ none }`.
 * - `notYet`, `baseNotYet`: the list's lines now, and at the branch's base or null.
 * - `tests`: what `readTests` read from every e2e file.
 * - `readUnit(file)`: a unit test file's text, or null where there is none.
 * - `unitRoots`: the folders a unit entry's file must be under, or null for any.
 * - `mapDir`, `listFile`: where the map and the not-yet list are, for the messages.
 * - `texts`: every scenario's text now, as `scenarioTexts` reads it.
 * - `base`: `{ texts, map, changed }` at the branch's base, `changed`
 *   holding every file that differs from it now; or null.
 */
export function checkCoverage({
  scenarios,
  map,
  notYet,
  baseNotYet,
  tests,
  readUnit,
  texts,
  base,
  mapDir = MAP_DIR,
  listFile = NOT_YET_FILE,
  unitRoots = null,
}) {
  const problems = [];
  const known = new Set(scenarios);
  const unitTests = new Map();
  const readUnitTestsOf = (file) => {
    if (!unitTests.has(file)) {
      const source = readUnit(file);
      unitTests.set(file, source === null ? null : readUnitTests(file, source));
    }
    return unitTests.get(file);
  };
  const waiting = new Set(notYet);

  const mapped = new Map();
  for (const [capability, requirements] of Object.entries(map)) {
    for (const [requirement, entries] of Object.entries(requirements)) {
      for (const [scenario, entry] of Object.entries(entries)) {
        const key = [capability, requirement, scenario].join(SEPARATOR);
        if (known.has(key)) mapped.set(key, entry);
        else problems.push(`${mapFile(capability, mapDir)}: ${key} is in no spec`);
      }
    }
  }

  for (const key of scenarios) {
    const capability = key.split(SEPARATOR)[0];
    if (!mapped.has(key) && !waiting.has(key)) {
      problems.push(`${key}: no entry. Map it in ${mapFile(capability, mapDir)}, or cover it with a test`);
    } else if (mapped.has(key) && waiting.has(key)) {
      problems.push(`${key}: mapped and on the not-yet list. Take it off ${listFile}`);
    }
  }

  for (const key of waiting) {
    if (!known.has(key)) problems.push(`${listFile}: ${key} is in no spec`);
  }

  for (const [key, entry] of mapped) {
    const problem = entryProblem(entry, key, tests, readUnitTestsOf, unitRoots);
    if (problem) problems.push(`${key}: ${problem}`);
  }

  for (const test of tests) {
    for (const key of test.scenarios) {
      const where = `${test.file}${SEPARATOR}${test.title}`;
      if (!known.has(key)) problems.push(`${where} covers ${key}, which is in no spec`);
      else if (waiting.has(key) && !mapped.has(key)) {
        problems.push(`${where} covers ${key}, which is on the not-yet list. Map it instead`);
      }
    }
  }

  if (base) {
    for (const [key, entry] of mapped) {
      const was = base.texts.get(key);
      if (was === undefined || was === texts.get(key) || !kindOf(entry)) continue;
      const [capability, requirement, scenario] = key.split(SEPARATOR);
      const baseEntry = base.map[capability]?.[requirement]?.[scenario];
      const problem = changedEntryProblem(entry, baseEntry, base.changed);
      if (problem) problems.push(`${key}: ${problem}`);
    }
  }

  if (baseNotYet) {
    const before = new Set(baseNotYet);
    for (const key of waiting) {
      if (!before.has(key) && known.has(key)) {
        problems.push(
          `${listFile}: ${key} was not on the list at the base. The list only shrinks: cover it, or map it`,
        );
      }
    }
  }
  return problems;
}

/** An entry's one kind, beside an optional `checked`, or null where it has none or several. */
function kindOf(entry) {
  const kinds = Object.keys(entry ?? {}).filter((field) => field !== 'checked');
  return kinds.length === 1 && KINDS.includes(kinds[0]) ? kinds[0] : null;
}

const hasReason = (text) => typeof text === 'string' && text.trim() !== '';

/**
 * What is wrong with the entry of a scenario whose text changed since the base,
 * or null. A `checked` the base already had was written for the earlier text.
 */
function changedEntryProblem(entry, baseEntry, changed) {
  if (entry.checked !== undefined) {
    return entry.checked !== baseEntry?.checked
      ? null
      : 'its text changed since the base, and its "checked" was written for the earlier text. Remove it, or rewrite it for the new text';
  }
  const kind = kindOf(entry);
  if (entry[kind] !== baseEntry?.[kind]) return null;
  if (kind === 'none') {
    return 'its text changed since the base, and its reason for "none" did not. Re-read it: change it, or say in "checked" why it still holds';
  }
  const [file] = splitReference(String(entry[kind]));
  if (changed.has(file)) return null;
  return `its text changed since the base, and ${file} did not. Update the test, or say in "checked" why it already shows the new text`;
}

/** What is wrong with one entry, or null. */
function entryProblem(entry, key, tests, unitTestsOf, unitRoots) {
  const kind = kindOf(entry);
  if (!kind) {
    return 'an entry is one of {"e2e": …}, {"unit": …} or {"none": …}, with an optional "checked"';
  }
  if (entry.checked !== undefined && !hasReason(entry.checked)) return '"checked" needs a reason';
  if (kind === 'none') return hasReason(entry.none) ? null : '"none" needs a reason';
  const [file, title] = splitReference(String(entry[kind]));
  if (kind === 'e2e') {
    const test = tests.find((candidate) => candidate.file === file && candidate.title === title);
    if (!test) return `no test ${entry.e2e}`;
    return test.scenarios.includes(key) ? null : `${entry.e2e} does not name it in covers(…)`;
  }
  if (unitRoots && !unitRoots.some((root) => file.startsWith(`${root.replace(/\/$/, '')}/`))) {
    return `${file} is under no unit test root in openspec/checks.json: ${unitRoots.join(', ')}`;
  }
  const paths = unitTestsOf(file);
  if (paths === null) return `no file ${file}`;
  const matches = unitMatches(paths, title);
  if (matches.length === 0) return `${file} has no test named ${JSON.stringify(title)}`;
  if (matches.length === 1) return null;
  const named = matches.map((path) => JSON.stringify(path.join(SEPARATOR))).join(', ');
  return `${file} has ${matches.length} tests named ${JSON.stringify(title)}: ${named}. Name one by its describes, as "<file> › <describe> › <test>", or rename them apart`;
}

/** The calls that declare a test. `test.skip(condition, reason)` inside a test declares none. */
const DECLARATIONS = new Set(['test', 'test.only', 'test.skip', 'test.fixme', 'test.fail']);

const isLiteral = (node) =>
  node !== undefined && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node));

const isFunction = (node) =>
  node !== undefined && (ts.isArrowFunction(node) || ts.isFunctionExpression(node));

/**
 * Every test a file declares, with the scenarios its `covers(…)` annotation
 * names. Read from the source, so the check needs no browser and no Playwright.
 * Throws on a test it cannot read, so none hides from the check.
 */
export function readTests(file, source) {
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const tests = [];
  const fail = (node, message) => {
    const line = tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1;
    throw new Error(`${file}:${line}: ${message}`);
  };

  const visit = (node) => {
    if (
      ts.isCallExpression(node) &&
      DECLARATIONS.has(node.expression.getText(tree)) &&
      isFunction(node.arguments.at(-1))
    ) {
      const [title, details] = node.arguments;
      if (!isLiteral(title)) fail(node, "a test's title must be a literal string");
      if (tests.some((test) => test.title === title.text)) {
        fail(node, `a second test titled ${JSON.stringify(title.text)}`);
      }
      tests.push({ file, title: title.text, scenarios: scenariosOf(details, fail) });
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  return tests;
}

/** The keys in a test's `{ annotation: covers(…) }`, or none where it has no annotation. */
function scenariosOf(details, fail) {
  if (!details || !ts.isObjectLiteralExpression(details)) return [];
  const annotation = details.properties.find(
    (property) => property.name?.getText() === 'annotation',
  );
  if (!annotation) return [];
  const value = ts.isPropertyAssignment(annotation) ? annotation.initializer : undefined;
  if (!value || !ts.isCallExpression(value) || value.expression.getText() !== 'covers') {
    fail(annotation, 'write the annotation as covers(…), so the coverage check can read it');
  }
  if (!value.arguments.every(isLiteral)) fail(value, 'covers(…) takes literal strings only');
  return value.arguments.map((argument) => argument.text);
}
