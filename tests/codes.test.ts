import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, runMigrations } from "../src/server/db/client";
import { members, rsvps, sessions, settings, signInCodes } from "../src/server/db/schema";
import { createApp } from "../src/server/app";
import { createSession } from "../src/server/auth/sessions";
import { CODE_ALPHABET, generateCode, GuessLimiter, hashCode, normaliseCode } from "../src/server/auth/codes";
import { createSignInCode, freshCode, GROUP_CODE_KEY } from "../src/server/auth/sign-in-codes";
import { getInvite } from "../src/server/routes/invite";

// Short codes exist for the iPhone home-screen app, which has its own cookie jar and never opens
// links. The app is on the open internet, so the codes must be short to type but hard to guess.
runMigrations();
let app = createApp(db);
let host = { id: "", cookie: "" };
let guest = { id: "", cookie: "" };

function addMember(name: string, role: "host" | "guest") {
  const id = randomUUID();
  db.insert(members).values({ id, name, role, color: "red", linkToken: randomUUID(), createdAt: "" }).run();
  return { id, cookie: `session_id=${createSession(db, id).id}` };
}

function post(path: string, body?: unknown, cookie?: string) {
  return app.request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const enter = (code: string) => post("/api/code", { code });
const cookieFrom = (res: Response) => res.headers.get("set-cookie")!.split(";")[0];

async function myCode(cookie: string) {
  const res = await post("/api/auth/code", undefined, cookie);
  expect(res.status).toBe(200);
  return (await res.json()) as { code: string; expiresAt: string };
}

// A valid code that is guaranteed not to be live, for wrong guesses.
function wrongCode() {
  const taken = new Set([getInvite(db).code]);
  let code = "222222";
  while (taken.has(code)) code = generateCode();
  return code;
}

beforeEach(() => {
  for (const table of [signInCodes, rsvps, sessions, members, settings]) db.delete(table).run();
  // A new app per test gives a fresh wrong-guess counter.
  app = createApp(db);
  host = addMember("Host", "host");
  guest = addMember("Anna", "guest");
});

afterEach(() => {
  vi.useRealTimers();
});

describe("code format", () => {
  it("makes 6 characters from an alphabet without look-alikes", () => {
    // 0/O and 1/I/L are easy to mistype on a phone, and a mistyped code costs a guess.
    for (let i = 0; i < 2000; i++) {
      const code = generateCode();
      expect(code).toHaveLength(6);
      for (const ch of code) expect(CODE_ALPHABET).toContain(ch);
    }
    expect(CODE_ALPHABET).not.toMatch(/[01OIL]/);
  });

  it("accepts any case and ignores spaces and dashes, as people type codes they read off a screen", () => {
    expect(normaliseCode("abc def")).toBe("ABCDEF");
    expect(normaliseCode(" ab-cd-ef ")).toBe("ABCDEF");
    expect(normaliseCode("ABCDEF")).toBe("ABCDEF");
  });

  it("rejects input that can't be a code", () => {
    expect(normaliseCode("ABCDE")).toBeNull();
    expect(normaliseCode("ABCDEFG")).toBeNull();
    expect(normaliseCode("ABCDE0")).toBeNull();
    expect(normaliseCode("ABC/EF")).toBeNull();
  });

  it("never issues a code equal to the group code or a live sign-in code", () => {
    // One box takes both kinds, so a shared code would sign someone in when they meant to join, or the reverse.
    db.insert(settings).values({ key: GROUP_CODE_KEY, value: "AAAAAA" }).run();
    createSignInCode(db, guest.id, () => "BBBBBB");
    const queue = ["AAAAAA", "BBBBBB", "CCCCCC"];
    expect(freshCode(db, () => queue.shift()!)).toBe("CCCCCC");
  });
});

describe("group code", () => {
  it("is shown to the host with the group link", async () => {
    const res = await app.request("/api/invite", { headers: { Cookie: host.cookie } });
    const body = await res.json();
    expect(normaliseCode(body.code)).toBe(body.code);
    expect(body.link).toContain("/i/");
  });

  it("is created for an install that only has a group link, and keeps that link", () => {
    // Existing installs have invite_token but no code. The link in the group chat must keep working.
    db.insert(settings).values({ key: "invite_token", value: "existing-token" }).run();
    const invite = getInvite(db);
    expect(invite.token).toBe("existing-token");
    expect(normaliseCode(invite.code)).toBe(invite.code);
    expect(getInvite(db).code).toBe(invite.code);
  });

  it("leads to the join form for the group link", async () => {
    const { code, token } = getInvite(db);
    const res = await enter(code.toLowerCase().replace(/(...)/, "$1 "));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ kind: "group", token });
    // No session yet: the visitor still has to enter a name on the join form.
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("still leads to a full group, where the join form refuses new players", async () => {
    // The code must not be a way around the group limit.
    db.insert(settings).values({ key: "invite_limit", value: "2" }).run();
    const { token } = (await (await enter(getInvite(db).code)).json()) as { token: string };
    expect((await (await app.request(`/api/join/${token}`)).json()).full).toBe(true);
    const res = await post(`/api/join/${token}`, { name: "Bo" });
    expect(res.status).toBe(403);
  });

  it("is renewed together with the group link, so an old code stops working too", async () => {
    // A host makes a new link when the old one leaked. A leaked code must not keep letting people in.
    const old = getInvite(db);
    const res = await post("/api/invite/new-link", undefined, host.cookie);
    const fresh = await res.json();
    expect(fresh.code).not.toBe(old.code);
    expect(fresh.link).not.toBe(old.link);
    expect((await enter(old.code)).status).toBe(404);
    expect(await (await enter(fresh.code)).json()).toEqual({ kind: "group", token: getInvite(db).token });
  });

  it("can only be renewed by the host", async () => {
    expect((await post("/api/invite/new-link", undefined, guest.cookie)).status).toBe(403);
    expect((await app.request("/api/invite", { headers: { Cookie: guest.cookie } })).status).toBe(403);
  });
});

describe("sign-in codes", () => {
  it("sign a member in on a new device with the same session cookie as a personal link", async () => {
    const { code, expiresAt } = await myCode(guest.cookie);
    expect(new Date(expiresAt).getTime() - Date.now()).toBeGreaterThan(9 * 60_000);

    const res = await enter(`${code.slice(0, 3)}-${code.slice(3).toLowerCase()}`);
    expect(res.status).toBe(200);
    expect((await res.json()).kind).toBe("signin");
    const cookie = cookieFrom(res);
    expect(cookie).toMatch(/^session_id=/);
    const me = await (await app.request("/api/auth/me", { headers: { Cookie: cookie } })).json();
    expect(me).toMatchObject({ id: guest.id, name: "Anna" });
  });

  it("work only once, so a code seen over someone's shoulder is useless after they used it", async () => {
    const { code } = await myCode(guest.cookie);
    expect((await enter(code)).status).toBe(200);
    const again = await enter(code);
    expect(again.status).toBe(404);
    expect((await again.json()).error.code).toBe("UNKNOWN_CODE");
  });

  it("stop working after 10 minutes", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const { code } = await myCode(guest.cookie);
    vi.advanceTimersByTime(10 * 60_000 + 1000);
    expect((await enter(code)).status).toBe(404);
  });

  it("are replaced by a newer code, so only one code per member is ever live", async () => {
    const first = await myCode(guest.cookie);
    const second = await myCode(guest.cookie);
    expect((await enter(first.code)).status).toBe(404);
    expect((await enter(second.code)).status).toBe(200);
  });

  it("are stored only as a hash, so a copy of the database can't be used to sign in", async () => {
    const { code } = await myCode(guest.cookie);
    const rows = db.select().from(signInCodes).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].codeHash).toBe(hashCode(code));
    expect(JSON.stringify(rows)).not.toContain(code);
  });

  it("need a session to make one for yourself", async () => {
    expect((await post("/api/auth/code")).status).toBe(401);
  });

  it("can be made by the host for a player, which signs in as that player", async () => {
    const res = await post(`/api/members/${guest.id}/code`, undefined, host.cookie);
    expect(res.status).toBe(200);
    const { code } = await res.json();
    const signedIn = await enter(code);
    expect((await signedIn.json()).member.id).toBe(guest.id);
  });

  it("can't be made for someone else by a guest, or a guest could sign in as the host", async () => {
    expect((await post(`/api/members/${host.id}/code`, undefined, guest.cookie)).status).toBe(403);
    expect(db.select().from(signInCodes).all()).toHaveLength(0);
  });

  it("stop working when the member is removed", async () => {
    const { code } = await myCode(guest.cookie);
    db.delete(members).where(eq(members.id, guest.id)).run();
    expect((await enter(code)).status).toBe(404);
  });
});

describe("the code box", () => {
  it("answers an unknown code with a message that says what to do", async () => {
    const res = await enter(wrongCode());
    expect(res.status).toBe(404);
    expect((await res.json()).error.message).toMatch(/Ask for a new one/);
  });

  it("tells people when what they typed isn't shaped like a code", async () => {
    const res = await enter("ABC");
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("BAD_CODE");
  });
});

describe("wrong-guess limit", () => {
  // The limit is what makes 6 characters safe on the open internet. It counts everyone together,
  // because behind Tailscale Funnel the client address can't be trusted.
  it("still accepts a correct code after a few wrong ones", async () => {
    for (let i = 0; i < 9; i++) expect((await enter(wrongCode())).status).toBe(404);
    const { code } = await myCode(guest.cookie);
    expect((await enter(code)).status).toBe(200);
  });

  it("locks the code box for everyone after 10 wrong codes in a minute, even for a correct code", async () => {
    for (let i = 0; i < 10; i++) await enter(wrongCode());
    const { code } = await myCode(guest.cookie);
    const res = await enter(code);
    expect(res.status).toBe(429);
    expect((await res.json()).error.message).toMatch(/Wait a few minutes/);
    expect((await enter(getInvite(db).code)).status).toBe(429);
  });

  it("opens again once the minute has passed", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    for (let i = 0; i < 10; i++) await enter(wrongCode());
    expect((await enter(getInvite(db).code)).status).toBe(429);
    vi.advanceTimersByTime(60_000);
    expect((await enter(getInvite(db).code)).status).toBe(200);
  });

  it("allows at most 100 wrong codes a day, however slowly they come", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    for (let i = 0; i < 100; i++) {
      await enter(wrongCode());
      vi.advanceTimersByTime(7 * 60_000); // Slow enough never to hit the per-minute limit.
    }
    const locked = await enter(getInvite(db).code);
    expect(locked.status).toBe(429);
    // "Wait a few minutes" would be wrong here; the box stays shut until the day has passed.
    expect((await locked.json()).error.message).toMatch(/Try again tomorrow/);
    vi.advanceTimersByTime(24 * 60 * 60_000);
    expect((await enter(getInvite(db).code)).status).toBe(200);
  });

  it("doesn't count typos that can't be a code, so a clumsy thumb can't lock everyone out", async () => {
    for (let i = 0; i < 20; i++) await enter("AB");
    expect((await enter(getInvite(db).code)).status).toBe(200);
  });

  it("counts by window, in a pure limiter", () => {
    const limiter = new GuessLimiter([{ windowMs: 1000, max: 2 }]);
    limiter.fail(0);
    expect(limiter.locked(10)).toBe(false);
    limiter.fail(10);
    expect(limiter.locked(20)).toBe(true);
    expect(limiter.locked(1010)).toBe(false);
  });
});
