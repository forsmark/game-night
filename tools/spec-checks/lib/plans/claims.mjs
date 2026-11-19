/**
 * The absolute claims of the specs, the GLOSSARY.md terms each names, and which
 * of them share terms with a change. Text in, data out: the claims command reads
 * the files. A proposer reads them because a new rule can break an old absolute one.
 */
import { readRequirements, sentences, SEPARATOR } from '../specs/requirements.mjs';

/** The words that make a SHALL sentence sweep: it holds everywhere, for everyone, or as a whole. */
const SWEEPING =
  /\b(any|anywhere|anything|anyone|every|everything|everywhere|never|no|nothing|none|nobody|only|whatever)\b/i;

/** A line that starts a list item. */
const LIST_ITEM = /^\s*([-*+]|\d+\.)\s+/;

/** The terms a glossary defines, one per `**Term**:` line, longest first. */
export function readTerms(context) {
  return [...context.matchAll(/^\*\*(.+?)\*\*:\s*$/gm)]
    .map((match) => match[1])
    .sort((a, b) => b.length - a.length);
}

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Matches a term as the specs write it, in the plural too. A one-word term is
 * matched capitalised, or `New` and `Status` would match prose; a longer one in
 * any case, as `display name`.
 */
function termPattern(term) {
  const words = term.split(' ');
  const last = words.pop();
  const plural = last.endsWith('y')
    ? `${escape(last.slice(0, -1))}(?:y|ies)`
    : `${escape(last)}(?:e?s)?`;
  const source = [...words.map(escape), plural].join(' ');
  return new RegExp(`\\b${source}\\b`, words.length > 0 ? 'gi' : 'g');
}

/** The terms a text names, and the text with them taken out. A longer term hides a shorter one inside it. */
function nameTerms(text, terms) {
  const named = [];
  let rest = text;
  for (const term of terms) {
    const pattern = termPattern(term);
    if (rest.search(pattern) === -1) continue;
    named.push(term);
    rest = rest.replace(pattern, ' ');
  }
  return { named: named.sort(), rest };
}

/** The terms a text names. */
export const termsIn = (text, terms) => nameTerms(text, terms).named;

const STOP = new Set(
  'about above after again also because been before being both does each from have here into just more most must only other over same shall should such than that their them then there these they this those through under until upon what when where which while will with within without would your'.split(
    ' ',
  ),
);

/** A crude stem, enough for `stored` and `stores` to meet `store`. */
const stem = (word) => word.replace(/(ies|es|s|ed|ing|e|y)$/, '');

/**
 * What a text is about: the terms it names, as `Account`, and its other words of
 * four letters or more, stemmed, as `stor` for `stored`.
 */
export function vocabulary(text, terms) {
  const { named, rest } = nameTerms(text, terms);
  const words = (rest.toLowerCase().match(/[a-z][a-z-]{3,}/g) ?? [])
    .filter((word) => !STOP.has(word))
    .map(stem);
  return new Set([...named, ...words]);
}

/**
 * What a sentence binds: the word its SHALL governs, as `store` for *SHALL
 * store* or `stored` for *SHALL be stored*. Null where that word says too
 * little, as `have`.
 */
export function verbOf(sentence) {
  const match = /\bSHALL(?: (?:NOT|be|only|never|still|also|always|not))* ([a-z][a-z-]+)/.exec(
    sentence,
  );
  if (!match || match[1].length < 4 || STOP.has(match[1])) return null;
  return match[1];
}

/**
 * A requirement body's paragraphs, each with the list items under it, so a
 * sentence that ends in a colon carries the list it introduces.
 */
function paragraphs(lines) {
  const blocks = [];
  let block = null;
  let open = false;
  let fenced = false;
  for (const line of lines) {
    if (line.trim().startsWith('```')) fenced = !fenced;
    if (fenced || line.trim().startsWith('```')) continue;
    if (line.trim() === '') open = false;
    else if (LIST_ITEM.test(line)) {
      if (!block) blocks.push((block = { text: [], items: [] }));
      block.items.push([line.replace(LIST_ITEM, '').trim()]);
      open = false;
    } else if (/^\s/.test(line) && block?.items.length > 0) block.items.at(-1).push(line.trim());
    else if (open) block.text.push(line);
    else {
      blocks.push((block = { text: [line], items: [] }));
      open = true;
    }
  }
  return blocks;
}

/**
 * Every absolute claim of one spec: a SHALL sentence holding a sweeping word,
 * with the list it introduces where it ends in a colon. Each records its
 * capability, its requirement, its sentence, how many items its list has, its
 * verb, the terms it names and its vocabulary.
 */
export function readClaims(capability, spec, terms) {
  const claim = (requirement, sentence, list) => {
    const whole = [sentence, ...list].join(' ');
    return {
      capability,
      requirement: requirement.name,
      sentence,
      items: list.length,
      verb: verbOf(sentence),
      terms: termsIn(whole, terms),
      vocabulary: vocabulary(whole, terms),
    };
  };
  const absolute = (sentence) => /\bSHALL\b/.test(sentence) && SWEEPING.test(sentence);
  return readRequirements(capability, spec).flatMap((requirement) =>
    paragraphs(requirement.body).flatMap(({ text, items }) => [
      ...sentences(text)
        .filter(absolute)
        .map((sentence) =>
          claim(
            requirement,
            sentence,
            sentence.endsWith(':') ? items.map((item) => item.join(' ')) : [],
          ),
        ),
      ...items.flatMap((item) =>
        sentences(item)
          .filter(absolute)
          .map((sentence) => claim(requirement, sentence, [])),
      ),
    ]),
  );
}

/**
 * How much a word says, from how many of the given texts hold it: a word in
 * every one says nothing, a word in one says most.
 */
export function weights(vocabularies) {
  const counts = new Map();
  for (const words of vocabularies)
    for (const word of words) counts.set(word, (counts.get(word) ?? 0) + 1);
  const total = vocabularies.length;
  return (word) => Math.log((total + 1) / ((counts.get(word) ?? 0) + 1));
}

/** What two vocabularies share, weighted, and the terms among it. */
function overlap(a, b, weight, terms) {
  const shared = [...a].filter((word) => b.has(word));
  const sharedTerms = shared.filter((word) => terms.includes(word)).sort();
  const score = shared.reduce((sum, word) => sum + weight(word), 0);
  return { score, terms: sharedTerms };
}

/**
 * The keys of the requirements one delta spec adds, modifies, removes or
 * renames, a renamed one under both its names.
 */
export function touchedRequirements(capability, delta) {
  const renamed = [...delta.matchAll(/^\s*- (?:FROM|TO): `### Requirement: (.+?)`\s*$/gm)].map(
    (match) => [capability, match[1]].join(SEPARATOR),
  );
  const named = readRequirements(capability, delta).map((requirement) => requirement.key);
  return [...new Set([...named, ...renamed])];
}

const keyOf = (item) => [item.capability, item.requirement].join(SEPARATOR);

/**
 * The claims outside the requirements a change touches that share a term with
 * it, most related first: by the rarity-weighted words the claim and the change
 * share, over the root of the claim's length, so a long list does not lead
 * every change. A claim in a spec the change touches counts: it is the likeliest
 * place for a clash.
 */
export function claimsSharingTerms({ change, claims, weight, terms }) {
  return claims
    .filter((claim) => !change.requirements.includes(keyOf(claim)))
    .map((claim) => {
      const shared = overlap(claim.vocabulary, change.vocabulary, weight, terms);
      return { claim, ...shared, score: shared.score / Math.sqrt(claim.vocabulary.size) };
    })
    .filter((match) => match.terms.length > 0)
    .sort((a, b) => b.score - a.score);
}

/**
 * The requirements whose SHALL sentences share a term with one claim, each by
 * its best sentence, leaving out the keys in `exclude`. Those that also use the
 * claim's verb come first, as a sentence storing a field on an Account does for
 * a claim that lists all an Account stores; then the closest. Only other
 * capabilities count, unless `ownSpec` lets in the rest of the claim's own spec.
 */
export function requirementsSharingTerms({
  claim,
  requirements,
  weight,
  terms,
  exclude = [],
  ownSpec = false,
}) {
  const best = new Map();
  for (const sentence of requirements) {
    const key = keyOf(sentence);
    if (exclude.includes(key) || key === keyOf(claim)) continue;
    if (!ownSpec && sentence.capability === claim.capability) continue;
    const shared = overlap(claim.vocabulary, sentence.vocabulary, weight, terms);
    if (shared.terms.length === 0) continue;
    const verb = claim.verb !== null && sentence.vocabulary.has(stem(claim.verb));
    const match = { key, capability: sentence.capability, verb, ...shared };
    if (!best.has(key) || closer(match, best.get(key)) < 0) best.set(key, match);
  }
  return [...best.values()].sort(closer);
}

/** Orders a match that uses the claim's verb before one that does not, then by score. */
const closer = (a, b) => Number(b.verb) - Number(a.verb) || b.score - a.score;

/** Every SHALL sentence of one spec, with its vocabulary, absolute or not. */
export function readShallSentences(capability, spec, terms) {
  return readRequirements(capability, spec).flatMap((requirement) =>
    sentences(requirement.body)
      .filter((sentence) => /\bSHALL\b/.test(sentence))
      .map((sentence) => ({
        capability,
        requirement: requirement.name,
        sentence,
        vocabulary: vocabulary(sentence, terms),
      })),
  );
}
