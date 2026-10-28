import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { db, runMigrations } from "../src/server/db/client";
import { members, rsvps, sessions, settings, signInCodes } from "../src/server/db/schema";
import { createApp } from "../src/server/app";
import { createSession, magicLink } from "../src/server/auth/sessions";
import { getInvite } from "../src/server/routes/invite";

// On olympus-edge the app is public on its own hostname, with no proxy in front of it.
// These tests cover what the app itself must do there.
runMigrations();
const app = createApp(db);
const saved = { BASE_URL: process.env.BASE_URL, SHARE_BASE_URL: process.env.SHARE_BASE_URL };
let host = { id: "", token: "", cookie: "" };

beforeEach(() => {
  for (const table of [signInCodes, rsvps, sessions, members, settings]) db.delete(table).run();
  process.env.BASE_URL = "https://game-night.example.ts.net";
  delete process.env.SHARE_BASE_URL;
  host = { id: randomUUID(), token: randomUUID(), cookie: "" };
  db.insert(members).values({ id: host.id, name: "Host", role: "host", color: "red", linkToken: host.token, createdAt: "" }).run();
  host.cookie = `session_id=${createSession(db, host.id).id}`;
});

afterEach(() => {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  vi.restoreAllMocks();
});

describe("health check", () => {
  it("answers /healthz without a session, so the platform can tell the app is up", async () => {
    const res = await app.request("/healthz");
    expect(res.status).toBe(200);
  });
});

describe("app icon", () => {
  it("is a 512x512 PNG, the size the portal tile and phone home screens expect", () => {
    const png = readFileSync(new URL("../public/icon.png", import.meta.url));
    expect(png.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    expect(png.subarray(12, 16).toString("ascii")).toBe("IHDR");
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([512, 512]);
  });
});

describe("home-screen app", () => {
  // People add the app to their iPhone home screen. Without a manifest and the iOS meta tags it
  // opens as a plain browser bookmark, without the app icon and name.
  it("has a web app manifest that opens standalone at the start page", () => {
    const manifest = JSON.parse(readFileSync(new URL("../public/manifest.webmanifest", import.meta.url), "utf8"));
    expect(manifest).toMatchObject({ name: "Game Night", display: "standalone", start_url: "/" });
    expect(manifest.icons).toContainEqual(expect.objectContaining({ src: "/icon.png", sizes: "512x512" }));
    // The design tokens' violet and table-top peach, so the splash screen matches the app.
    expect(manifest.theme_color).toBe("#6c587b");
    expect(manifest.background_color).toBe("#e8cdb8");
  });

  it("links the manifest and the iOS tags from the page", () => {
    const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
    expect(html).toContain('<link rel="manifest" href="/manifest.webmanifest"');
    expect(html).toContain('<link rel="apple-touch-icon" href="/icon.png"');
    expect(html).toContain('<meta name="apple-mobile-web-app-capable" content="yes"');
    expect(html).toContain('<meta name="apple-mobile-web-app-title" content="Game Night"');
  });
});

describe("response headers", () => {
  // Without no-referrer, a page opened from /j/<token> could hand the token to the next site.
  it.each([
    ["the health check", "/healthz", 200],
    ["the API", "/api/health", 200],
    ["a personal link redirect", "/j/not-a-token", 302],
    ["a request without a session", "/api/auth/me", 401],
    ["an unknown address", "/nothing-here", 404],
  ])("sets no-referrer and nosniff on %s", async (_, path, status) => {
    const res = await app.request(path);
    expect(res.status).toBe(status);
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });
});

describe("logging", () => {
  it("never writes a personal or group link token, or a code, to the logs", async () => {
    // Personal links and the group link are passwords, and the journal is not a safe place for them.
    // A request logger (hono/logger or similar) would print the path and make this fail.
    const output: string[] = [];
    const capture = (...args: unknown[]) => void output.push(args.map(String).join(" "));
    for (const method of ["log", "info", "warn", "error", "debug"] as const) vi.spyOn(console, method).mockImplementation(capture);
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => (output.push(String(chunk)), true));
    vi.spyOn(process.stderr, "write").mockImplementation((chunk) => (output.push(String(chunk)), true));
    // Built after the spies, because loggers keep a reference to console.log from when they're created.
    const logged = createApp(db);

    const invite = getInvite(db).token;
    await logged.request(`/j/${host.token}`);
    await logged.request(`/i/${invite}`);
    await logged.request(`/api/join/${invite}`);
    await logged.request(`/api/join/${invite}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Anna" }),
    });

    // Codes are passwords too: the group code, and a sign-in code both made and spent.
    const json = { "Content-Type": "application/json" };
    const groupCode = getInvite(db).code;
    await logged.request("/api/code", { method: "POST", headers: json, body: JSON.stringify({ code: groupCode }) });
    const made = await logged.request("/api/auth/code", { method: "POST", headers: { Cookie: host.cookie } });
    const signInCode = (await made.json()).code;
    await logged.request("/api/code", { method: "POST", headers: json, body: JSON.stringify({ code: signInCode }) });
    await logged.request("/api/code", { method: "POST", headers: json, body: JSON.stringify({ code: signInCode }) });

    const all = output.join("\n");
    expect(all).not.toContain(host.token);
    expect(all).not.toContain(invite);
    expect(all).not.toContain(groupCode);
    expect(all).not.toContain(signInCode);
  });
});

describe("shared links", () => {
  async function linksFromApi() {
    const headers = { Cookie: host.cookie };
    const personal = (await (await app.request("/api/auth/link", { headers })).json()).link;
    const group = (await (await app.request("/api/invite", { headers })).json()).link;
    return { personal, group };
  }

  it("point at BASE_URL when SHARE_BASE_URL is not set, as they always have", async () => {
    // Existing installs must keep handing out the same links.
    const invite = getInvite(db).token;
    expect(magicLink(host.token)).toBe(`https://game-night.example.ts.net/j/${host.token}`);
    expect(getInvite(db).link).toBe(`https://game-night.example.ts.net/i/${invite}`);
    expect(await linksFromApi()).toEqual({
      personal: `https://game-night.example.ts.net/j/${host.token}`,
      group: `https://game-night.example.ts.net/i/${invite}`,
    });
  });

  it("go through SHARE_BASE_URL when it is set, so the token stays in the fragment", async () => {
    // The redirect page on GitHub Pages reads #j/<token> or #i/<token>. A fragment is never sent
    // to GitHub, so the token only reaches the app.
    process.env.SHARE_BASE_URL = "https://forsmark.github.io/game-night/#";
    const invite = getInvite(db).token;
    expect(magicLink(host.token)).toBe(`https://forsmark.github.io/game-night/#j/${host.token}`);
    expect(getInvite(db).link).toBe(`https://forsmark.github.io/game-night/#i/${invite}`);
    expect(await linksFromApi()).toEqual({
      personal: `https://forsmark.github.io/game-night/#j/${host.token}`,
      group: `https://forsmark.github.io/game-night/#i/${invite}`,
    });
  });

  it("accepts a quoted SHARE_BASE_URL, because Podman env files keep the quotes", () => {
    // A .env file needs the quotes, or Node reads everything from # on as a comment.
    process.env.SHARE_BASE_URL = '"https://forsmark.github.io/game-night/#"';
    expect(magicLink(host.token)).toBe(`https://forsmark.github.io/game-night/#j/${host.token}`);
  });

  it("refuses a SHARE_BASE_URL without a #, because the token would then be sent to that server", () => {
    // Unquoted in a .env file, `.../game-night/#` is cut to `.../game-night/`, and every link would
    // put the token in the path of a request to GitHub. Failing loudly beats handing those out.
    process.env.SHARE_BASE_URL = "https://forsmark.github.io/game-night/";
    expect(() => magicLink(host.token)).toThrow(/must contain a #/);
    expect(() => getInvite(db)).toThrow(/must contain a #/);
  });

  it("treats an empty SHARE_BASE_URL as not set", () => {
    // .env.example ships it empty.
    process.env.SHARE_BASE_URL = "";
    expect(magicLink(host.token)).toBe(`https://game-night.example.ts.net/j/${host.token}`);
  });
});
