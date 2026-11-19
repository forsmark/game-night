/**
 * `spec-checks repeated`: no list of three or more items is in two specs, beyond
 * the copies its baseline lists. `--report` shows every copy with its two lists.
 */
import { join } from 'node:path';
import { checkCopies, findCopies, listLine, listsOf, report } from '../plans/repeated.mjs';
import { readList, writeList } from '../specs/lists.mjs';
import { renamesSince } from '../specs/renames.mjs';
import { baselineAtBase, baseOf, mainSpecs } from './common.mjs';

export function run(ctx) {
  const copies = findCopies(mainSpecs(ctx.root).flatMap(({ capability, text }) => listsOf(capability, text)));
  if (ctx.args.includes('--report')) {
    for (const line of report(copies)) console.log(line);
    return { problems: [], summary: null };
  }
  const listFile = ctx.config.baselines.repeated;
  const listPath = join(ctx.root, listFile);
  if (ctx.write) {
    const lines = copies.map(listLine);
    writeList(listPath, lines);
    ctx.note(`wrote ${lines.length} lines to ${listFile}`);
  }
  const notYet = readList(listPath);
  const base = baseOf(ctx);
  const problems = checkCopies({
    copies,
    notYet,
    baseNotYet: baselineAtBase(ctx, listFile),
    renames: base ? renamesSince(ctx.root, base) : [],
    listFile,
  });
  return { problems, summary: `no list is in two specs beyond the ${notYet.length} copies not yet resolved` };
}
