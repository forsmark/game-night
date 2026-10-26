import { Hono } from "hono";
import { serveStatic } from "@hono/node-server/serve-static";
import type { AppDb } from "./db/client";
import { getEnv } from "./env";
import { authRoutes, joinRoute } from "./routes/auth";
import { membersRoutes } from "./routes/members";
import { gamesRoutes, shelfRoutes } from "./routes/games";
import { eventsRoutes } from "./routes/events";
import { inviteRoutes, joinInviteRoutes } from "./routes/invite";

export function createApp(db: AppDb) {
  const app = new Hono();

  app.get("/api/health", (c) => c.json({ status: "ok" }));
  app.route("/j", joinRoute(db));
  app.route("/api/auth", authRoutes(db));
  app.route("/api/members", membersRoutes(db));
  app.route("/api/games", gamesRoutes(db));
  app.route("/api/shelf", shelfRoutes(db));
  app.route("/api/events", eventsRoutes(db));
  app.route("/api/join", joinInviteRoutes(db));
  app.route("/api/invite", inviteRoutes(db));

  if (getEnv().nodeEnv === "production") {
    app.use("/*", serveStatic({ root: "./dist" }));
    app.get("*", serveStatic({ path: "./dist/index.html" }));
  }

  return app;
}
