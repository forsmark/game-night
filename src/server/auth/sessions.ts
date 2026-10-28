import { randomBytes, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { AppDb } from "../db/client";
import { sessions } from "../db/schema";
import { getEnv } from "../env";

const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 180; // 180 days

export function createSession(db: AppDb, memberId: string) {
  const id = randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS).toISOString();
  db.insert(sessions).values({ id, memberId, expiresAt }).run();
  return { id, expiresAt };
}

export function getSession(db: AppDb, sessionId: string) {
  const row = db.select().from(sessions).where(eq(sessions.id, sessionId)).get();
  if (!row) return null;
  if (new Date(row.expiresAt).getTime() < Date.now()) {
    deleteSession(db, sessionId);
    return null;
  }
  return row;
}

export function deleteSession(db: AppDb, sessionId: string) {
  db.delete(sessions).where(eq(sessions.id, sessionId)).run();
}

export function newLinkToken() {
  return randomBytes(24).toString("base64url");
}

// The address people open: `/j/<token>` for a personal link, `/i/<token>` for the group link.
// With SHARE_BASE_URL set, the link goes through that address instead, for example
// `https://forsmark.github.io/game-night/#j/<token>`, which forwards to BASE_URL.
export function shareLink(kind: "i" | "j", token: string) {
  const { baseUrl, shareBaseUrl } = getEnv();
  return shareBaseUrl ? `${shareBaseUrl}${kind}/${token}` : `${baseUrl}/${kind}/${token}`;
}

export function magicLink(token: string) {
  return shareLink("j", token);
}
