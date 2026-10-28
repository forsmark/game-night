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

  // Personal links (/j/<token>) and the group link (/i/<token>) work like passwords.
  // no-referrer keeps them out of the Referer header when someone follows a link out of the app,
  // and nosniff stops browsers guessing a type for anything served here.
  // There is deliberately no request logger: it would write those tokens to the journal.
  app.use("*", async (c, next) => {
    await next();
    c.res.headers.set("Referrer-Policy", "no-referrer");
    c.res.headers.set("X-Content-Type-Options", "nosniff");
  });

  app.get("/api/health", (c) => c.json({ status: "ok" }));
  // For the hosting platform's health check. No session, no database.
  app.get("/healthz", (c) => c.text("ok"));
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
