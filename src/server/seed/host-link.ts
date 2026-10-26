// Prints the host's magic link. Creates the host on first run.
// Usage: pnpm host:link [name]
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, runMigrations } from "../db/client";
import { members } from "../db/schema";
import { magicLink, newLinkToken } from "../auth/sessions";

runMigrations();

let host = db.select().from(members).where(eq(members.role, "host")).get();
if (!host) {
  host = {
    id: randomUUID(),
    name: process.argv[2] ?? "Host",
    role: "host",
    color: "yellow",
    linkToken: newLinkToken(),
    createdAt: new Date().toISOString(),
  };
  db.insert(members).values(host).run();
  console.log(`Created host "${host.name}".`);
}

console.log(magicLink(host.linkToken));
