import { sqliteTable, text, integer, real, primaryKey } from "drizzle-orm/sqlite-core";

export const members = sqliteTable("members", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  role: text("role", { enum: ["host", "guest"] }).notNull(),
  // Meeple colour key, see MEEPLE_COLORS in the frontend.
  color: text("color").notNull(),
  // Secret part of the member's magic link. Stored in plain text so the host
  // can copy a link again later. "New link" replaces it.
  linkToken: text("link_token").notNull().unique(),
  createdAt: text("created_at").notNull(),
});

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  memberId: text("member_id")
    .notNull()
    .references(() => members.id, { onDelete: "cascade" }),
  expiresAt: text("expires_at").notNull(),
});

// Game data cached from BoardGameGeek.
export const games = sqliteTable("games", {
  bggId: integer("bgg_id").primaryKey(),
  name: text("name").notNull(),
  year: integer("year"),
  minPlayers: integer("min_players").notNull(),
  maxPlayers: integer("max_players").notNull(),
  // JSON array of player counts from the BGG "best with" poll.
  bestWith: text("best_with").notNull().default("[]"),
  minTime: integer("min_time"),
  maxTime: integer("max_time"),
  weight: real("weight"),
  thumbnail: text("thumbnail"),
  // Expansions are stored, but only base games can be suggested and voted on.
  kind: text("kind", { enum: ["base", "expansion"] }).notNull().default("base"),
  // For an expansion: the base game it belongs to, if known.
  baseId: integer("base_id"),
  fetchedAt: text("fetched_at").notNull(),
});

// BoardGameGeek's list of games, loaded from its ranks data dump. Search runs on this table.
// It holds names and ids only. A game's details are looked up when someone picks it, and saved in games.
export const catalogue = sqliteTable("catalogue", {
  bggId: integer("bgg_id").primaryKey(),
  name: text("name").notNull(),
  // The name in lower case without accents or punctuation, after a space, so " word%" matches the start of a word.
  search: text("search").notNull(),
  year: integer("year"),
  // BGG rank. Null for unranked games and for every expansion.
  rank: integer("rank"),
  usersRated: integer("users_rated").notNull(),
  kind: text("kind", { enum: ["base", "expansion"] }).notNull(),
});

// The host's own collection.
export const shelf = sqliteTable("shelf", {
  bggId: integer("bgg_id")
    .primaryKey()
    .references(() => games.bggId),
  addedAt: text("added_at").notNull(),
});

export const events = sqliteTable("events", {
  id: text("id").primaryKey(),
  // Local date and time, "YYYY-MM-DDTHH:mm".
  startsAt: text("starts_at").notNull(),
  location: text("location").notNull().default(""),
  note: text("note").notNull().default(""),
  // Attendee count at which the planner recommends two tables.
  splitAt: integer("split_at").notNull().default(7),
  createdAt: text("created_at").notNull(),
});

export const rsvps = sqliteTable(
  "rsvps",
  {
    eventId: text("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    memberId: text("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    status: text("status", { enum: ["yes", "maybe", "no"] }).notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.eventId, t.memberId] })],
);

// A game on the vote list for one event.
export const nominations = sqliteTable(
  "nominations",
  {
    eventId: text("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    bggId: integer("bgg_id")
      .notNull()
      .references(() => games.bggId),
    nominatedBy: text("nominated_by")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    // Set when a guest brings their own copy. Null means it comes from the shelf.
    broughtBy: text("brought_by").references(() => members.id, { onDelete: "set null" }),
    createdAt: text("created_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.eventId, t.bggId] })],
);

export const votes = sqliteTable(
  "votes",
  {
    eventId: text("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    bggId: integer("bgg_id").notNull(),
    memberId: text("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.eventId, t.bggId, t.memberId] })],
);

// App-wide settings as key/value pairs.
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

// One-time sign-in codes, typed on another device. Only the SHA-256 hash is stored, like a password.
// A row is spent when usedAt is set, and dead after expiresAt. Expired rows are removed when the
// next code is made or tried.
export const signInCodes = sqliteTable("sign_in_codes", {
  codeHash: text("code_hash").primaryKey(),
  memberId: text("member_id")
    .notNull()
    .references(() => members.id, { onDelete: "cascade" }),
  expiresAt: text("expires_at").notNull(),
  usedAt: text("used_at"),
  createdAt: text("created_at").notNull(),
});
