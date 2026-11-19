/**
 * `spec-checks shall`: no requirement has more SHALL sentences than scenarios,
 * beyond the gaps its baseline lists. `--report` lists every gap with its sentences.
 */
import { join } from 'node:path';
import { checkShall, listLine, report, requirementsOf } from '../plans/shall.mjs';
import { readList, writeList } from '../specs/lists.mjs';
import { renamesSince } from '../specs/renames.mjs';
import { baselineAtBase, baseOf, mainSpecs } from './common.mjs';

export function run(ctx) {
  const all = mainSpecs(ctx.root).flatMap(({ capability, text }) => requirementsOf(capability, text));
  if (ctx.args.includes('--report')) {
    for (const line of report(all)) console.log(line);
    return { problems: [], summary: null };
  }
  const listFile = ctx.config.baselines.shall;
  const listPath = join(ctx.root, listFile);
  if (ctx.write) {
    const lines = all.filter((requirement) => requirement.excess > 0).map(listLine);
    writeList(listPath, lines);
    ctx.note(`wrote ${lines.length} lines to ${listFile}`);
  }
  const notYet = readList(listPath);
  const base = baseOf(ctx);
  const problems = checkShall({
    requirements: all,
    notYet,
    baseNotYet: baselineAtBase(ctx, listFile),
    renames: base ? renamesSince(ctx.root, base) : [],
    listFile,
  });
  return {
    problems,
    summary: `${all.length - notYet.length} of ${all.length} requirements have a scenario for each SHALL sentence, ${notYet.length} not yet`,
  };
}
