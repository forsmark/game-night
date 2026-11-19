/**
 * A list of today's gaps that only shrinks, such as a coverage map's not-yet
 * list: one entry per line under `#` comments, compared with the list at the
 * branch's base.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { showAt } from '../git.mjs';

/** A list's lines, without blanks and `#` comments. */
export const listLines = (text) =>
  text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'));

/** A list's lines from its file, or none where the file is absent. */
export const readList = (path) => (existsSync(path) ? listLines(readFileSync(path, 'utf8')) : []);

/** Rewrite a list as these lines, keeping its `#` comments. */
export function writeList(path, lines) {
  const header = existsSync(path)
    ? readFileSync(path, 'utf8')
        .split('\n')
        .filter((line) => line.startsWith('#'))
    : [];
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, [...header, ...lines, ''].join('\n'));
}

/** A list's lines at a commit, or null where the commit has no such file. */
export function listAt(root, commit, file) {
  const text = showAt(root, commit, file);
  return text === null ? null : listLines(text);
}
