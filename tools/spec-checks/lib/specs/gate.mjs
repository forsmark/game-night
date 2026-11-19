/**
 * What changed in a change's delta specs since its gate, the commit the main
 * person approved the proposal at. Text in, data out, so it is tested without a
 * checkout. A rule dropped after the gate is a change the person never approved.
 */
import { readRequirements, SEPARATOR, sentences } from './requirements.mjs';

/** The heading in `proposal.md` under which a rule dropped after the gate is named. */
export const OVERRIDE_HEADING = 'Rules dropped after the proposal';

/** How many times a requirement's text above its first scenario says SHALL. */
export const shallWords = (requirement) =>
  sentences(requirement.body)
    .join(' ')
    .match(/\bSHALL\b/g)?.length ?? 0;

/** A requirement as its delta writes it, without the blank lines at its end. */
function textOf(requirement) {
  const lines = [`### Requirement: ${requirement.name}`, ...requirement.body];
  for (const scenario of requirement.scenarios) {
    lines.push(`#### Scenario: ${scenario.name}`, ...scenario.lines);
  }
  while (lines.at(-1)?.trim() === '') lines.pop();
  return lines.join('\n');
}

/** Every requirement of a change's deltas, as key → its text and counts. */
function readDeltas(deltas) {
  const all = new Map();
  for (const [capability, text] of [...deltas].sort(([a], [b]) => a.localeCompare(b))) {
    for (const requirement of readRequirements(capability, text)) {
      all.set(requirement.key, {
        text: textOf(requirement),
        shall: shallWords(requirement),
        scenarios: requirement.scenarios.length,
      });
    }
  }
  return all;
}

/**
 * Each requirement of the deltas at the gate and now, as `{ key, status, gate,
 * now }`. `deltas` map a capability to its delta's text. Status is unchanged,
 * changed, added or removed, and `gate` or `now` is null where it is absent.
 */
export function compareDeltas(gateDeltas, nowDeltas) {
  const gate = readDeltas(gateDeltas);
  const now = readDeltas(nowDeltas);
  const keys = [...gate.keys(), ...[...now.keys()].filter((key) => !gate.has(key))];
  return keys.map((key) => {
    const before = gate.get(key) ?? null;
    const after = now.get(key) ?? null;
    const status = !after
      ? 'removed'
      : !before
        ? 'added'
        : before.text === after.text
          ? 'unchanged'
          : 'changed';
    return { key, status, gate: before, now: after };
  });
}

/**
 * The requirements `proposal.md` names under *Rules dropped after the proposal*,
 * each as a list item `- <requirement>: <reason>`, with or without its capability.
 */
export function overrides(proposal) {
  const named = new Set();
  let inBlock = false;
  for (const line of proposal.split('\n')) {
    if (/^## /.test(line)) inBlock = line.slice(3).trim() === OVERRIDE_HEADING;
    const item = inBlock && /^[-*] (.+?): (.*\S.*)$/.exec(line);
    if (item) named.add(item[1].replace(/^[*_`]+|[*_`]+$/g, '').trim());
  }
  return named;
}

/**
 * The requirements that lost a SHALL word since the gate and kept every
 * scenario, less those `proposal.md` names under its override heading. A rule
 * dropped with its scenario is a removal a reviewer sees. One dropped alone is
 * how a merged sentence hides.
 */
export function droppedRules(entries, named) {
  return entries.filter(({ key, gate, now }) => {
    if (!gate || (now?.shall ?? 0) >= gate.shall) return false;
    if ((now?.scenarios ?? 0) < gate.scenarios) return false;
    const name = key.slice(key.indexOf(SEPARATOR) + SEPARATOR.length);
    return !named.has(key) && !named.has(name);
  });
}

/** How `design.md` changed since the gate: unchanged, kept with additions, or rewritten. */
export function designChange(gateText, nowText) {
  if (gateText?.trimEnd() === nowText?.trimEnd()) return { status: 'unchanged', lost: [] };
  const now = new Set((nowText ?? '').split('\n'));
  const lost = (gateText ?? '').split('\n').filter((line) => line.trim() !== '' && !now.has(line));
  return { status: lost.length === 0 ? 'added to' : 'rewritten', lost };
}

const indent = (text) =>
  text
    .split('\n')
    .map((line) => (line === '' ? '' : `    ${line}`))
    .join('\n');

/** The printout for a person: each requirement at the gate and now, and design.md. */
export function printout({ entries, design, problems }) {
  const lines = [];
  if (design.status === 'unchanged') lines.push('design.md: unchanged since the gate');
  else if (design.status === 'added to') {
    lines.push('design.md: added to since the gate, and every line of the gate is kept');
  } else {
    lines.push(`design.md: rewritten since the gate. These lines of the gate's text are gone:`);
    for (const line of design.lost) lines.push(`    - ${line}`);
  }
  const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;
  const counts = (side) =>
    side ? `${plural(side.shall, 'SHALL word')}, ${plural(side.scenarios, 'scenario')}` : 'absent';
  for (const { key, status, gate, now } of entries) {
    if (status === 'unchanged') continue;
    lines.push('', `${key}: ${status}, at the gate ${counts(gate)}, now ${counts(now)}`);
    if (gate) lines.push('  at the gate:', indent(gate.text));
    if (now) lines.push('  now:', indent(now.text));
  }
  const unchanged = entries.filter(({ status }) => status === 'unchanged');
  if (unchanged.length > 0) {
    lines.push('', `${plural(unchanged.length, 'requirement')} unchanged since the gate:`);
    for (const { key } of unchanged) lines.push(`  ${key}`);
  }
  lines.push('');
  if (problems.length === 0) {
    lines.push('No requirement lost a SHALL word while it kept every scenario.');
  } else {
    lines.push(
      `${plural(problems.length, 'requirement')} lost a SHALL word and kept every scenario:`,
    );
    for (const { key } of problems) lines.push(`  ${key}`);
    lines.push(
      `Restore each rule, or name it in proposal.md under "## ${OVERRIDE_HEADING}"`,
      'as "- <requirement>: <reason>".',
    );
  }
  return lines.join('\n');
}
