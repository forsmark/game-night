/**
 * `spec-checks claims`: print the absolute claims in the main specs that share a
 * glossary term with a change, so its proposer checks the change against them.
 * It points, and the proposer judges. `verify` does not run it.
 *
 *   claims <change>         the closest claims outside the requirements it touches,
 *                           and its own claims with the requirements elsewhere that
 *                           share their terms
 *   claims <change> --all   every claim and requirement that shares a term
 *   claims                  every claim, with the requirements in other specs that
 *                           share its terms
 *
 * <change> is a name under openspec/changes, active or archived, with or without
 * the archive's date, or a path to a change's folder.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import {
  claimsSharingTerms,
  readClaims,
  readShallSentences,
  readTerms,
  requirementsSharingTerms,
  touchedRequirements,
  vocabulary,
  weights,
} from '../plans/claims.mjs';
import { readRequirements, SEPARATOR } from '../specs/requirements.mjs';
import { CHANGES, mainSpecs, specsIn } from './common.mjs';

// Enough to read in one go: the closest claims are the ones a proposer acts on.
const CLOSEST_CLAIMS = 20;
const CLOSEST_REQUIREMENTS = 3;

const read = (path) => readFileSync(path, 'utf8');

/** A change's folder from its name, its archived name, or a path. Null where none is found. */
function changeFolder(root, name) {
  const changes = join(root, CHANGES);
  if (existsSync(join(resolve(name), 'specs'))) return resolve(name);
  if (existsSync(join(changes, name, 'specs'))) return join(changes, name);
  const archive = join(changes, 'archive');
  if (!existsSync(archive)) return null;
  const archived = readdirSync(archive)
    .filter((folder) => folder === name || folder.replace(/^\d{4}-\d{2}-\d{2}-/, '') === name)
    .sort();
  return archived.length > 0 ? join(archive, archived.at(-1)) : null;
}

const by = (item) => [item.capability, item.requirement].join(SEPARATOR);

const sentenceOf = (claim) =>
  claim.items > 0 ? `${claim.sentence} (a list of ${claim.items})` : claim.sentence;

/** The terms, every SHALL sentence and claim of the specs, and the weight of each word. */
function load(ctx) {
  const glossary = ctx.config.glossary;
  if (!glossary) throw new Error('claims needs a glossary: name its file in "glossary" in openspec/checks.json');
  if (!existsSync(join(ctx.root, glossary))) throw new Error(`no glossary ${glossary}`);
  const terms = readTerms(read(join(ctx.root, glossary)));
  if (terms.length === 0) throw new Error(`${glossary} defines no terms. claims reads lines of the form **Term**:`);
  const specs = mainSpecs(ctx.root);
  const sentences = specs.flatMap(({ capability, text }) =>
    readShallSentences(capability, text, terms),
  );
  const weight = weights(sentences.map((sentence) => sentence.vocabulary));
  const claims = specs.flatMap(({ capability, text }) => readClaims(capability, text, terms));
  return { terms, specs, sentences, weight, claims };
}

/**
 * Each claim under its requirement, with the specs elsewhere whose SHALL
 * sentences use its verb beside a term it names, and the closest requirements.
 */
function printClaimsWithRequirements(claims, sharing, all) {
  let last = null;
  for (const claim of claims) {
    if (by(claim) !== last) console.log(`\n${by(claim)}`);
    last = by(claim);
    console.log(`  - ${sentenceOf(claim)} [${claim.terms.join(', ')}]`);
    const others = sharing(claim);
    const counts = new Map();
    for (const other of others.filter((other) => other.verb))
      counts.set(other.capability, (counts.get(other.capability) ?? 0) + 1);
    if (counts.size > 0) {
      const specs = [...counts]
        .sort((a, b) => b[1] - a[1])
        .map(([capability, count]) => `${capability} (${count})`);
      console.log(`    "${claim.verb}" beside its terms, in requirements of: ${specs.join(', ')}`);
    }
    const rest = others.filter((other) => !other.verb);
    const closest = all ? rest : rest.slice(0, CLOSEST_REQUIREMENTS);
    if (closest.length > 0)
      console.log(`    closest: ${closest.map((other) => other.key).join('; ')}`);
  }
}

function printChange(ctx, name, all) {
  const folder = changeFolder(ctx.root, name);
  if (!folder) throw new Error(`no change named ${name} under ${CHANGES}`);
  const { terms, sentences, weight, claims } = load(ctx);
  const deltas = specsIn(join(folder, 'specs'));
  if (deltas.length === 0) throw new Error(`${name} has no delta specs`);
  const capabilities = deltas.map(({ capability }) => capability);
  const touched = deltas.flatMap(({ capability, text }) => touchedRequirements(capability, text));
  const deltaText = deltas
    .flatMap(({ capability, text }) =>
      readRequirements(capability, text).flatMap((requirement) => [
        requirement.name,
        ...requirement.body,
        ...requirement.scenarios.flatMap((scenario) => scenario.lines),
      ]),
    )
    .join('\n');
  const change = { requirements: touched, vocabulary: vocabulary(deltaText, terms) };
  const named = terms.filter((term) => change.vocabulary.has(term)).sort();
  console.log(
    `${basename(folder)} changes ${capabilities.join(', ')}, and names ${named.join(', ')}`,
  );

  const matches = claimsSharingTerms({ change, claims, weight, terms });
  const shown = all ? matches : matches.slice(0, CLOSEST_CLAIMS);
  const more = shown.length < matches.length ? ' (--all prints every one)' : '';
  console.log(
    `\nClaims in requirements it does not touch that share its terms, closest first: ${shown.length} of ${matches.length}${more}`,
  );
  let last = null;
  for (const { claim, terms: shared } of shown) {
    if (by(claim) !== last) console.log(`\n${by(claim)}`);
    last = by(claim);
    console.log(`  - ${sentenceOf(claim)} [${shared.join(', ')}]`);
  }

  const own = deltas
    .flatMap(({ capability, text }) => readClaims(capability, text, terms))
    .filter((claim) => claim.terms.length > 0);
  console.log(
    `\nIts own claims that name a term, and where else those terms are bound: ${own.length}`,
  );
  printClaimsWithRequirements(
    own,
    (claim) =>
      requirementsSharingTerms({
        claim,
        requirements: sentences,
        weight,
        terms,
        exclude: touched,
        ownSpec: true,
      }),
    all,
  );
}

function printAudit(ctx) {
  const { terms, specs, sentences, weight, claims } = load(ctx);
  console.log(`${claims.length} claims in ${specs.length} specs`);
  printClaimsWithRequirements(
    claims,
    (claim) => requirementsSharingTerms({ claim, requirements: sentences, weight, terms }),
    false,
  );
}

export function run(ctx) {
  const name = ctx.args.find((arg) => !arg.startsWith('--'));
  if (name) printChange(ctx, name, ctx.args.includes('--all'));
  else printAudit(ctx);
  return { problems: [], summary: null };
}
