import { existsSync } from "node:fs";

if (existsSync(".env")) process.loadEnvFile(".env");

// Node's .env loader reads an unquoted `#` as the start of a comment, so SHARE_BASE_URL must be
// quoted there. Podman's env files keep quotes as part of the value, so remove one pair here.
function unquote(value: string) {
  return value.replace(/^(["'])(.*)\1$/, "$2");
}

// A share link must keep the token in the fragment (after `#`), which browsers never send to the
// server hosting the share page. Without it the token would be in the request path. A value cut off
// at the `#` by Node's .env loader ends up here too, so stop rather than hand out such links.
function shareBase(value: string) {
  if (value && !value.includes("#")) {
    throw new Error(
      `SHARE_BASE_URL must contain a # so tokens stay in the fragment (got ${value}). In a .env file, quote the value.`,
    );
  }
  return value;
}

export function getEnv() {
  return {
    databasePath: process.env.DATABASE_PATH ?? "./data/game-night.db",
    port: Number(process.env.PORT ?? 3002),
    nodeEnv: process.env.NODE_ENV ?? "development",
    baseUrl: (process.env.BASE_URL ?? "http://localhost:5173").replace(/\/$/, ""),
    bggToken: process.env.BGG_TOKEN ?? "",
    // Optional prefix for the links the app shows and copies, such as a redirect page
    // whose fragment carries the token. Used as is: the link is `${shareBaseUrl}j/<token>`.
    shareBaseUrl: shareBase(unquote(process.env.SHARE_BASE_URL ?? "")),
  };
}
