// Draws public/icon.png: the favicon's meeple on a paper disc on the wooden table.
// 512x512, for the home screen (apple-touch-icon) and the olympus-edge portal tile.
// No dependencies: shapes are drawn with signed distances and written with node:zlib.
// Run it again after changing the drawing: node scripts/make-icon.mjs
import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const SIZE = 512;

// Colours from src/frontend/index.css (light theme).
const wood = [0xe8, 0xcd, 0xb8]; // --background
const grain = [107, 66, 51]; // the --table-grain colour (.42 .26 .2)
const paper = [0xff, 0xf6, 0xef]; // --card
const ink = [0x3a, 0x2b, 0x3e]; // --ink
const shadow = [58, 43, 62]; // --shadow-color
const meeple = [0xdc, 0x6c, 0x70]; // the favicon meeple

// The favicon's meeple path (viewBox 0 0 100 100).
const MEEPLE_PATH =
  "M50 6C59 6 66 13 66 22c0 6-3 10-6 13l28 9c7 2 8 12 1 14l-19 4 14 28c2 5-2 8-7 8H60L50 80 40 98H23c-5 0-9-3-7-8l14-28-19-4c-7-2-6-12 1-14l28-9c-3-3-6-7-6-13 0-9 7-16 16-16z";

// Turns the path (M, L, H, C, l, c, z) into one closed polygon.
function flatten(d) {
  const tokens = d.match(/[a-zA-Z]|-?\d*\.?\d+/g);
  const points = [];
  let i = 0;
  let cmd = "";
  let x = 0;
  let y = 0;
  const num = () => Number(tokens[i++]);
  while (i < tokens.length) {
    if (/[a-zA-Z]/.test(tokens[i])) cmd = tokens[i++];
    const rel = cmd === cmd.toLowerCase();
    const ox = rel ? x : 0;
    const oy = rel ? y : 0;
    switch (cmd.toUpperCase()) {
      case "M":
      case "L":
        x = ox + num();
        y = oy + num();
        points.push([x, y]);
        break;
      case "H":
        x = ox + num();
        points.push([x, y]);
        break;
      case "C": {
        const p0 = [x, y];
        const p1 = [ox + num(), oy + num()];
        const p2 = [ox + num(), oy + num()];
        const p3 = [ox + num(), oy + num()];
        for (let t = 1; t <= 16; t++) {
          const s = t / 16;
          const a = (1 - s) ** 3;
          const b = 3 * (1 - s) ** 2 * s;
          const c = 3 * (1 - s) * s ** 2;
          const e = s ** 3;
          points.push([a * p0[0] + b * p1[0] + c * p2[0] + e * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + e * p3[1]]);
        }
        [x, y] = p3;
        break;
      }
      case "Z":
        break;
      default:
        throw new Error(`Unsupported path command ${cmd}`);
    }
  }
  return points;
}

// Signed distance to a polygon: negative inside.
function polygonDistance(poly, px, py) {
  let min = Infinity;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, ay] = poly[j];
    const [bx, by] = poly[i];
    if (ay > py !== by > py && px < ((bx - ax) * (py - ay)) / (by - ay) + ax) inside = !inside;
    const dx = bx - ax;
    const dy = by - ay;
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
    min = Math.min(min, Math.hypot(px - ax - t * dx, py - ay - t * dy));
  }
  return inside ? -min : min;
}

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const mix = (under, over, alpha) => under.map((u, k) => u + (over[k] - u) * alpha);

// Meeple scaled into the middle of the icon.
const scale = 2.9;
const meeplePoly = flatten(MEEPLE_PATH).map(([x, y]) => [256 + (x - 50) * scale, 262 + (y - 52) * scale]);
const discRadius = 214;
const outline = 9; // ink line width in px

const rows = [];
for (let y = 0; y < SIZE; y++) {
  const row = Buffer.alloc(1 + SIZE * 3); // filter byte 0, then RGB
  for (let x = 0; x < SIZE; x++) {
    const px = x + 0.5;
    const py = y + 0.5;

    // Wood with soft horizontal grain.
    const g = Math.sin(py * 0.11 + Math.sin(px * 0.012) * 2.4 + Math.sin(px * 0.031 + py * 0.02) * 0.6);
    let colour = mix(wood, grain, 0.06 + 0.06 * g);

    // The paper disc, its shadow on the table and its ink edge.
    const disc = Math.hypot(px - 256, py - 256) - discRadius;
    const discShadow = Math.hypot(px - 256, py - 268) - discRadius;
    colour = mix(colour, shadow, 0.28 * clamp01(1 - (discShadow + 4) / 18));
    colour = mix(colour, paper, clamp01(0.5 - disc));
    colour = mix(colour, ink, clamp01(outline / 2 + 0.5 - Math.abs(disc)));

    // The meeple, its shadow on the paper and its ink outline.
    const piece = polygonDistance(meeplePoly, px, py);
    const pieceShadow = polygonDistance(meeplePoly, px - 2, py - 10);
    if (disc < 0) colour = mix(colour, shadow, 0.22 * clamp01(1 - (pieceShadow + 2) / 12));
    colour = mix(colour, meeple, clamp01(0.5 - piece));
    colour = mix(colour, ink, clamp01(outline / 2 + 0.5 - Math.abs(piece)));

    for (let k = 0; k < 3; k++) row[1 + x * 3 + k] = Math.round(colour[k]);
  }
  rows.push(row);
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 2; // colour type: RGB
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", ihdr),
  chunk("IDAT", deflateSync(Buffer.concat(rows), { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]);

const out = new URL("../public/icon.png", import.meta.url);
writeFileSync(out, png);
console.log(`Wrote ${out.pathname} (${png.length} bytes)`);
