import { describe, expect, it } from "vitest";
import { makeBody, step, throwVelocity, type Body } from "../src/frontend/lib/physics";
import { DIE_FACES } from "../src/frontend/lib/dice";

function run(bodies: Body[], seconds: number, w = 800, h = 600) {
  let awake = true;
  for (let t = 0; t < seconds; t += 1 / 60) awake = step(bodies, 1 / 60, w, h, () => DIE_FACES[4].show);
  return awake;
}

describe("piece physics", () => {
  it("a thrown piece slides, slows down and comes to rest", () => {
    const piece = makeBody({ id: 1, r: 20, x: 100, y: 300, vx: 900 });
    run([piece], 0.2);
    expect(piece.vx).toBeGreaterThan(0);
    const awake = run([piece], 6);
    expect(awake).toBe(false);
    expect(piece.x).toBeGreaterThan(300);
  });

  it("bounces off the edge of the table and never leaves it", () => {
    const piece = makeBody({ id: 1, r: 20, x: 760, y: 300, vx: 2000 });
    run([piece], 0.1);
    expect(piece.x).toBeLessThanOrEqual(780);
    expect(piece.vx).toBeLessThan(0);
  });

  it("pieces knock each other away instead of overlapping", () => {
    const moving = makeBody({ id: 1, r: 20, x: 100, y: 300, vx: 800 });
    const still = makeBody({ id: 2, r: 20, x: 200, y: 300 });
    run([moving, still], 0.3);
    expect(still.x).toBeGreaterThan(200);
    expect(Math.hypot(still.x - moving.x, still.y - moving.y)).toBeGreaterThanOrEqual(39.9);
  });

  it("a held piece pushes others aside but does not move itself", () => {
    const held = makeBody({ id: 1, r: 20, x: 200, y: 300, held: true });
    const other = makeBody({ id: 2, r: 20, x: 220, y: 300 });
    run([held, other], 0.05);
    expect(held.x).toBe(200);
    expect(other.x - held.x).toBeGreaterThanOrEqual(39.9);
  });

  it("a thrown die tumbles, then lands flat on one face", () => {
    const die = makeBody({ id: 1, r: 20, x: 100, y: 300, vx: 1200, vy: 300, die: true });
    run([die], 0.1);
    expect(die.settle).toBeNull();
    expect(run([die], 8)).toBe(false);
    // The test always picks face 3, which shows at rotateX(-90).
    expect(((die.rx % 360) + 360) % 360).toBeCloseTo(270, 0);
    expect(((die.ry % 360) + 360) % 360).toBeCloseTo(0, 0);
  });

  it("a piece dropped from above lands and stays on the table", () => {
    const piece = makeBody({ id: 1, r: 20, x: 300, y: 300, z: 1.2 });
    expect(run([piece], 3)).toBe(false);
    expect(piece.z).toBe(0);
  });
});

describe("throwVelocity", () => {
  it("measures the last tenth of a second of the drag, not the slow start", () => {
    // 100 px in the first 400 ms, then 100 px in the last 100 ms.
    const samples = [
      { x: 0, y: 0, t: 0 },
      { x: 100, y: 0, t: 400 },
      { x: 150, y: 0, t: 450 },
      { x: 200, y: 0, t: 500 },
    ];
    expect(throwVelocity(samples, 500).vx).toBeCloseTo(1000);
  });

  it("a slow release is not a throw", () => {
    expect(throwVelocity([{ x: 0, y: 0, t: 0 }], 500)).toEqual({ vx: 0, vy: 0 });
  });
});
