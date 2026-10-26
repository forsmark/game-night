import { serve } from "@hono/node-server";
import { eq } from "drizzle-orm";
import { db, runMigrations } from "./db/client";
import { members } from "./db/schema";
import { createApp } from "./app";
import { getEnv } from "./env";

runMigrations();
const app = createApp(db);
const { port, bggToken } = getEnv();

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Game Night server listening on port ${info.port}`);
  if (!db.select().from(members).where(eq(members.role, "host")).get()) {
    console.log(
      "No host yet. Run `pnpm host:link <your name>`, or in the container `node dist-server/seed/host-link.js <your name>`.",
    );
  }
  if (!bggToken) console.log("BGG_TOKEN is not set. BoardGameGeek search and username import are off. Known games and the CSV import still work.");
});
