import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { AppDb } from "../db/client";
import { members } from "../db/schema";
import { GuessLimiter, normaliseCode } from "../auth/codes";
import { spendSignInCode } from "../auth/sign-in-codes";
import { startSession } from "./auth";
import { getInvite } from "./invite";

const body = z.object({ code: z.string().max(40) });

const badCode = {
  error: { code: "BAD_CODE", message: "A code has 6 letters and numbers, like ABC 234. Check it and try again." },
};
const unknownCode = {
  error: {
    code: "UNKNOWN_CODE",
    message: "That code doesn't work. It may have expired or been used. Ask for a new one.",
  },
};
// After the daily limit "a few minutes" would be wrong, so say when it opens again.
function tooMany(windowMs: number) {
  const message =
    windowMs > 60 * 60_000
      ? "Too many wrong codes were tried today. Try again tomorrow, or open your link instead."
      : "Too many wrong codes were tried. Wait a few minutes, then try again.";
  return { error: { code: "TOO_MANY_TRIES", message } };
}

// The code box on the welcome page. Takes the group code or a one-time sign-in code, in the POST
// body only, so codes never end up in a URL, a history entry or a log line.
export function codeRoutes(db: AppDb, limiter = new GuessLimiter()) {
  const app = new Hono();

  app.post("/", async (c) => {
    const lockedFor = limiter.lockedWindow();
    if (lockedFor !== null) return c.json(tooMany(lockedFor), 429);
    const parsed = body.safeParse(await c.req.json().catch(() => null));
    const code = parsed.success ? normaliseCode(parsed.data.code) : null;
    // Input that can't be a code is a typo, not a guess, so it doesn't count towards the limit.
    if (!code) return c.json(badCode, 400);

    // The group code leads to the normal join form, where the per-night limit applies as for the link.
    const invite = getInvite(db);
    if (code === invite.code) return c.json({ kind: "group", token: invite.token });

    const memberId = spendSignInCode(db, code);
    const member = memberId ? db.select().from(members).where(eq(members.id, memberId)).get() : undefined;
    if (!member) {
      limiter.fail();
      return c.json(unknownCode, 404);
    }
    startSession(c, db, member.id);
    return c.json({ kind: "signin", member: { id: member.id, name: member.name, role: member.role, color: member.color } });
  });

  return app;
}
