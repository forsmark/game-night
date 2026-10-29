import { serve } from "@hono/node-server";
import { eq } from "drizzle-orm";
import { closeDb, db, runMigrations } from "./db/client";
import { members } from "./db/schema";
import { createApp } from "./app";
import { getEnv } from "./env";
import { startImageFill } from "./bgg/images";

runMigrations();
const app = createApp(db);
const { port, bggToken, shareBaseUrl } = getEnv();

const server = serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Game Night server listening on port ${info.port}`);
  if (!db.select().from(members).where(eq(members.role, "host")).get()) {
    console.log(
      "No host yet. Run `pnpm host:link <your name>`, or in the container `node dist-server/seed/host-link.js <your name>`.",
    );
  }
  // The prefix isn't secret. Printing it shows at a glance if a .env file cut it short at the #.
  if (shareBaseUrl) console.log(`Links start with ${shareBaseUrl} (SHARE_BASE_URL).`);
  if (!bggToken) console.log("BGG_TOKEN is not set. Game details come from geekdo, and username import is off.");
  // Finishes a box image run that a restart cut short.
  startImageFill(db);
});

// Node as PID 1 in a container ignores SIGTERM unless it handles it, so `podman stop` would wait
// 10 seconds and then kill it. Stop taking requests, close the database and exit straight away.
function shutdown() {
  server.close(() => {
    closeDb();
    process.exit(0);
  });
  if ("closeAllConnections" in server) server.closeAllConnections();
  // Don't hang if something keeps the server open.
  setTimeout(() => process.exit(0), 3000).unref();
}
process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
