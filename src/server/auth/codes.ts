import { createHash, randomInt } from "node:crypto";

// Short codes people type by hand, for example into the home-screen app on an iPhone, which has its
// own cookie jar and never opens links. There are two kinds, and they share one namespace:
// - the group code, which works like the group link, and
// - one-time sign-in codes, which work like a personal link, once, for 10 minutes.
//
// No 0/O, 1/I/L: they look alike on a phone keyboard and in most fonts.
export const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const CODE_LENGTH = 6;
export const SIGN_IN_CODE_MINUTES = 10;

export function generateCode() {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}

// What people type: any case, with spaces or dashes ("abc def", "ABC-DEF"). Returns null when the
// input can't be a code at all, so it doesn't count as a guess.
export function normaliseCode(input: string) {
  const code = input.toUpperCase().replace(/[\s-]/g, "");
  if (code.length !== CODE_LENGTH) return null;
  for (const ch of code) if (!CODE_ALPHABET.includes(ch)) return null;
  return code;
}

// Sign-in codes are stored like passwords: a database copy or backup must not let anyone sign in.
// A plain hash is enough here, because the codes are random and only live for 10 minutes.
export function hashCode(code: string) {
  return createHash("sha256").update(code).digest("hex");
}

// Why 6 characters are safe enough on the open internet:
// there are 31^6 ≈ 8.9e8 codes, and only a handful are live at once (the group code plus at most one
// unused sign-in code per player). Wrong guesses are limited for everyone together, not per IP, because
// behind Tailscale Funnel the client address isn't reliable. With at most 100 wrong guesses a day and
// say 20 live codes, a guesser hits one with odds of about 100 * 20 / 8.9e8 ≈ 2e-6 a day, under 1e-3 a year.
// The price is that someone guessing can lock everyone out of codes for a while. Links keep working.
// Counters live in memory: the app is one process, and a restart only resets the window early.
export const GUESS_LIMITS = [
  { windowMs: 60_000, max: 10 },
  { windowMs: 24 * 60 * 60_000, max: 100 },
];

export class GuessLimiter {
  private failures: number[] = [];

  constructor(private limits = GUESS_LIMITS) {}

  private prune(now: number) {
    const longest = Math.max(...this.limits.map((l) => l.windowMs));
    this.failures = this.failures.filter((t) => now - t < longest);
  }

  // The window whose limit is reached, so the message can say how long to wait.
  lockedWindow(now = Date.now()) {
    this.prune(now);
    return this.limits.find(({ windowMs, max }) => this.failures.filter((t) => now - t < windowMs).length >= max)?.windowMs ?? null;
  }

  locked(now = Date.now()) {
    return this.lockedWindow(now) !== null;
  }

  fail(now = Date.now()) {
    this.failures.push(now);
  }
}
