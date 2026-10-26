import { existsSync } from "node:fs";

if (existsSync(".env")) process.loadEnvFile(".env");

export function getEnv() {
  return {
    databasePath: process.env.DATABASE_PATH ?? "./data/game-night.db",
    port: Number(process.env.PORT ?? 3002),
    nodeEnv: process.env.NODE_ENV ?? "development",
    baseUrl: (process.env.BASE_URL ?? "http://localhost:5173").replace(/\/$/, ""),
    bggToken: process.env.BGG_TOKEN ?? "",
  };
}
