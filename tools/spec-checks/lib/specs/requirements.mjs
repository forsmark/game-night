/**
 * How the spec checks read a spec in openspec/specs: its requirements, the SHALL
 * sentences of each, and its scenarios. Text in, data out, so every check that
 * reads a spec reads it the same way.
 */

/** Between the parts of a key, `<capability> › <requirement> › <scenario>`. */
export const SEPARATOR = ' › ';

const HEADING = /^(###|####) (Requirement|Scenario): (.+?)\s*$/;
const ANY_HEADING = /^#{1,4} /;

/**
 * Every requirement of one spec, in the order the spec has them: its name, its
 * key, the lines of its body above the first heading under it, and its scenarios,
 * each with the lines under its heading.
 */
export function readRequirements(capability, spec) {
  const requirements = [];
  let requirement = null;
  let lines = null;
  for (const line of spec.split('\n')) {
    const heading = HEADING.exec(line);
    if (heading || ANY_HEADING.test(line)) lines = null;
    if (heading?.[2] === 'Requirement') {
      requirement = {
        name: heading[3],
        key: [capability, heading[3]].join(SEPARATOR),
        body: [],
        scenarios: [],
      };
      requirements.push(requirement);
      lines = requirement.body;
    } else if (heading?.[2] === 'Scenario' && requirement) {
      const scenario = { name: heading[3], key: [requirement.key, heading[3]].join(SEPARATOR) };
      scenario.lines = [];
      requirement.scenarios.push(scenario);
      lines = scenario.lines;
    } else if (lines) lines.push(line);
  }
  return requirements;
}

/** A line that starts a list item, which starts a new sentence even with no full stop before it. */
const LIST_ITEM = /^\s*([-*+]|\d+\.)\s+/;

/**
 * A full stop, question or exclamation mark, any closing marks after it, then a
 * space and what can start a sentence. `e.g. a` does not end one.
 */
const SENTENCE_END = /(?<=[.!?][*_)"'`]*)\s+(?=[A-Z*_("'`[])/;

/**
 * The sentences of some markdown prose, each on one line. A paragraph and a list
 * item each start a sentence; a fenced code block holds none.
 */
export function sentences(lines) {
  const blocks = [];
  let block = [];
  let fenced = false;
  const close = () => {
    if (block.length > 0) blocks.push(block.join(' '));
    block = [];
  };
  for (const line of lines) {
    if (line.trim().startsWith('```')) {
      fenced = !fenced;
      close();
    } else if (fenced) continue;
    else if (line.trim() === '') close();
    else {
      if (LIST_ITEM.test(line)) close();
      block.push(line.replace(LIST_ITEM, '').trim());
    }
  }
  close();
  return blocks.flatMap((text) =>
    text
      .replace(/\s+/g, ' ')
      .trim()
      .split(SENTENCE_END)
      .filter((sentence) => sentence !== ''),
  );
}

/** The sentences of a requirement's body that say SHALL or SHALL NOT. */
export const shallSentences = (requirement) =>
  sentences(requirement.body).filter((sentence) => /\bSHALL\b/.test(sentence));
