import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import * as schema from "./schema";
import { getEnv } from "../env";

export type AppDb = BetterSQLite3Database<typeof schema>;

const { databasePath } = getEnv();
mkdirSync(dirname(databasePath), { recursive: true });

const sqlite = new Database(databasePath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

export const db: AppDb = drizzle(sqlite, { schema });

export function runMigrations() {
  migrate(db, { migrationsFolder: "./drizzle" });
}
