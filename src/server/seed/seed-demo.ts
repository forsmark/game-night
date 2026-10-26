// Fills an empty database with players, a shelf and next month's game night,
// so the app can be tried without a BGG_TOKEN. Game data is typed in by hand
// from BoardGameGeek and has no thumbnails.
import { randomUUID } from "node:crypto";
import { db, runMigrations } from "../db/client";
import { events, games, members, nominations, rsvps, shelf, votes } from "../db/schema";
import { magicLink, newLinkToken } from "../auth/sessions";
import { MEEPLE_COLORS } from "../../shared/meeples";

runMigrations();

if (db.select().from(members).get()) {
  console.error("The database already has members. Delete data/game-night.db to seed again.");
  process.exit(1);
}

const now = new Date().toISOString();
const GAMES: [number, string, number, number, number, number[], number, number, number][] = [
  // bggId, name, year, min, max, best with, min time, max time, weight
  [13, "CATAN", 1995, 3, 4, [4], 60, 120, 2.29],
  [266192, "Wingspan", 2019, 1, 5, [3], 40, 70, 2.48],
  [230802, "Azul", 2017, 2, 4, [2], 30, 45, 1.76],
  [178900, "Codenames", 2015, 2, 8, [6, 8], 15, 15, 1.27],
  [295947, "Cascadia", 2021, 1, 4, [3], 30, 45, 1.85],
  [167791, "Terraforming Mars", 2016, 1, 5, [3], 120, 120, 3.26],
  [9209, "Ticket to Ride", 2004, 2, 5, [4], 30, 60, 1.83],
  [316554, "Dune: Imperium", 2020, 1, 4, [4], 60, 120, 3.03],
  [284083, "The Crew: The Quest for Planet Nine", 2019, 2, 5, [4], 20, 20, 1.98],
  [254640, "Just One", 2018, 3, 7, [6, 7], 20, 20, 1.05],
  [68448, "7 Wonders", 2010, 2, 7, [4, 5], 30, 30, 2.32],
  [366013, "Heat: Pedal to the Metal", 2022, 1, 6, [5, 6], 30, 60, 2.2],
  [342942, "Ark Nova", 2021, 1, 4, [2], 90, 150, 3.76],
  [199792, "Everdell", 2018, 1, 4, [3], 40, 80, 2.8],
  [291453, "SCOUT", 2019, 2, 5, [4, 5], 15, 15, 1.2],
  [262543, "Wavelength", 2019, 2, 12, [6, 8], 30, 45, 1.1],
];
for (const [bggId, name, year, minPlayers, maxPlayers, best, minTime, maxTime, weight] of GAMES) {
  db.insert(games)
    .values({ bggId, name, year, minPlayers, maxPlayers, bestWith: JSON.stringify(best), minTime, maxTime, weight, thumbnail: null, fetchedAt: now })
    .run();
}
// Everything except the games guests bring below.
for (const [bggId] of GAMES.filter(([id]) => ![316554, 366013, 291453].includes(id))) {
  db.insert(shelf).values({ bggId, addedAt: now }).run();
}

const NAMES = ["Marc", "Anna", "Jonas", "Sofie", "Mikkel", "Ida", "Frederik", "Laura", "Emil"];
const ids = NAMES.map((name, i) => {
  const id = randomUUID();
  db.insert(members)
    .values({ id, name, role: i === 0 ? "host" : "guest", color: MEEPLE_COLORS[i], linkToken: newLinkToken(), createdAt: new Date(Date.now() + i).toISOString() })
    .run();
  return id;
});
const [marc, anna, jonas, sofie, mikkel, ida, frederik, laura, emil] = ids;

// The second Friday from now, at 18:30.
const date = new Date();
date.setDate(date.getDate() + ((5 - date.getDay() + 7) % 7 || 7) + 7);
const eventId = randomUUID();
db.insert(events)
  .values({ id: eventId, startsAt: `${date.toLocaleDateString("sv-SE")}T18:30`, location: "Marc's place, Nørrebro", note: "Pizza from 18:30. First game at 19:00.", splitAt: 7, createdAt: now })
  .run();

const answers: [string, "yes" | "maybe" | "no"][] = [
  [marc, "yes"], [anna, "yes"], [jonas, "yes"], [sofie, "yes"], [mikkel, "yes"],
  [ida, "yes"], [frederik, "yes"], [laura, "maybe"], [emil, "no"],
];
answers.forEach(([memberId, status], i) => {
  db.insert(rsvps).values({ eventId, memberId, status, updatedAt: new Date(Date.now() + i).toISOString() }).run();
});

const picks: [number, string, string | null, string[]][] = [
  // bggId, nominated by, brought by, voters
  [266192, marc, null, [marc, anna, sofie, ida]],
  [9209, anna, null, [anna, mikkel, laura]],
  [316554, jonas, jonas, [jonas, frederik, mikkel]],
  [366013, mikkel, mikkel, [mikkel, jonas, frederik, laura, sofie]],
  [254640, sofie, null, [sofie, ida, anna, laura]],
  [342942, frederik, null, [frederik, jonas]],
];
picks.forEach(([bggId, nominatedBy, broughtBy, voters], i) => {
  db.insert(nominations).values({ eventId, bggId, nominatedBy, broughtBy, createdAt: new Date(Date.now() + i).toISOString() }).run();
  for (const memberId of voters) db.insert(votes).values({ eventId, bggId, memberId }).run();
});

console.log("Seeded demo data. Links:");
const tokens = db.select({ name: members.name, token: members.linkToken }).from(members).all();
for (const t of tokens) console.log(`  ${t.name.padEnd(9)} ${magicLink(t.token)}`);
