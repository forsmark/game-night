import { and, eq, isNull, lt } from "drizzle-orm";
import type { AppDb } from "../db/client";
import { settings, signInCodes } from "../db/schema";
import { generateCode, hashCode, SIGN_IN_CODE_MINUTES } from "./codes";

// The group code is kept in settings next to the group link token, under this key.
export const GROUP_CODE_KEY = "invite_code";

function removeExpired(db: AppDb, now: string) {
  db.delete(signInCodes).where(lt(signInCodes.expiresAt, now)).run();
}

// Group and sign-in codes share one namespace, so a typed code always means one thing.
// Spent sign-in codes count too until they expire, so a code can't come back while someone
// may still remember it.
function codeTaken(db: AppDb, code: string) {
  const group = db.select().from(settings).where(eq(settings.key, GROUP_CODE_KEY)).get()?.value;
  if (group === code) return true;
  return !!db.select().from(signInCodes).where(eq(signInCodes.codeHash, hashCode(code))).get();
}

// A fresh code that is neither the group code nor a sign-in code still on file.
// With ≈8.9e8 codes and a handful taken, the loop almost never runs twice.
// `generate` is only replaced in tests, to force a collision.
export function freshCode(db: AppDb, generate = generateCode) {
  removeExpired(db, new Date().toISOString());
  for (;;) {
    const code = generate();
    if (!codeTaken(db, code)) return code;
  }
}

// Makes a one-time code that signs this member in. Their previous unused code stops working, so
// there is never more than one live code per member.
export function createSignInCode(db: AppDb, memberId: string, generate = generateCode) {
  const code = freshCode(db, generate);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SIGN_IN_CODE_MINUTES * 60_000).toISOString();
  db.delete(signInCodes)
    .where(and(eq(signInCodes.memberId, memberId), isNull(signInCodes.usedAt)))
    .run();
  db.insert(signInCodes).values({ codeHash: hashCode(code), memberId, expiresAt, createdAt: now.toISOString() }).run();
  return { code, expiresAt };
}

// Spends a sign-in code. Returns the member id, or null when the code is unknown, used or expired.
// Synchronous from lookup to update, so two devices can't both spend the same code.
export function spendSignInCode(db: AppDb, code: string) {
  const now = new Date().toISOString();
  removeExpired(db, now);
  const row = db.select().from(signInCodes).where(eq(signInCodes.codeHash, hashCode(code))).get();
  if (!row || row.usedAt || row.expiresAt <= now) return null;
  db.update(signInCodes).set({ usedAt: now }).where(eq(signInCodes.codeHash, row.codeHash)).run();
  return row.memberId;
}
