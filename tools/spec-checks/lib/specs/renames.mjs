/**
 * The requirements a branch renamed through OpenSpec: the `## RENAMED Requirements`
 * of the delta specs it added or changed under openspec/changes, archived or not.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SEPARATOR } from './requirements.mjs';
import { changedFiles } from '../git.mjs';

/** A delta spec's path, `openspec/changes/…/specs/<capability>/spec.md`, and its capability. */
const DELTA = /^openspec\/changes\/.+\/specs\/([^/]+)\/spec\.md$/;

/** A FROM or TO line, as `- FROM: \`### Requirement: …\`` or `### From: …`. */
const RENAME_LINE =
  /^(?:- (FROM|TO): `?(?:### Requirement: )?(.+?)`?|### (From|To): (?:Requirement: )?(.+?))\s*$/;

/** Every rename in one delta spec, as `{ from, to }` requirement keys, in its order. */
export function readRenames(capability, delta) {
  const renames = [];
  let inBlock = false;
  let from = null;
  for (const line of delta.split('\n')) {
    if (/^## /.test(line)) inBlock = /^## RENAMED Requirements\s*$/.test(line);
    const match = inBlock && RENAME_LINE.exec(line);
    if (!match) continue;
    const side = (match[1] ?? match[3]).toUpperCase();
    const key = [capability, match[2] ?? match[4]].join(SEPARATOR);
    if (side === 'FROM') from = key;
    else if (from) {
      renames.push({ from, to: key });
      from = null;
    }
  }
  return renames;
}

/** Every rename in the delta specs that differ from the base, untracked ones too. */
export function renamesSince(root, base) {
  return [...changedFiles(root, base)].sort().flatMap((file) => {
    const capability = DELTA.exec(file)?.[1];
    // A delta the branch archived is gone from where it was, and read where it went.
    if (!capability || !existsSync(join(root, file))) return [];
    return readRenames(capability, readFileSync(join(root, file), 'utf8'));
  });
}

/**
 * The key a requirement had at the base, following renames back, or its own key
 * where no rename names it.
 */
export function nameAtBase(key, renames, isAtBase) {
  const previous = new Map(renames.map(({ from, to }) => [to, from]));
  const seen = new Set([key]);
  let current = key;
  while (!isAtBase(current) && previous.has(current) && !seen.has(previous.get(current))) {
    current = previous.get(current);
    seen.add(current);
  }
  return current;
}
