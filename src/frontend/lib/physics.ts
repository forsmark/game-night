import { DIE_FACES } from "./dice";

// Top-down physics for game pieces on a table. Pieces are discs.
// x, y and r are in px. z is the height above the table: 0 is resting, 1 is about a hand's height.
export type Body = {
  id: number;
  r: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  // Rotation on the table, in degrees.
  a: number;
  va: number;
  z: number;
  vz: number;
  // Held pieces follow the pointer. They push others but nothing pushes them.
  held: boolean;
  // Dice only: the cube's tumble, and the face rotation it settles to once it stops.
  die: boolean;
  rx: number;
  ry: number;
  settle: { x: number; y: number } | null;
};

export const PHYSICS = {
  // Exponential slow-down per second while a piece slides on the table.
  friction: 2.4,
  spinFriction: 3,
  gravity: 9,
  // Pieces in the hand float at this height.
  liftHeight: 0.35,
  wallBounce: 0.5,
  pieceBounce: 0.65,
  // Below this speed (px/s) a piece stops.
  restSpeed: 8,
  maxSpeed: 2600,
  // Degrees of tumble per px a die slides.
  dieTumble: 1.1,
  // Below this speed a die stops tumbling and turns to its final face.
  dieSettleSpeed: 60,
};

export function makeBody(partial: Partial<Body> & Pick<Body, "id" | "r" | "x" | "y">): Body {
  return { vx: 0, vy: 0, a: 0, va: 0, z: 0, vz: 0, held: false, die: false, rx: 0, ry: 0, settle: null, ...partial };
}

// The rotation that shows a face, picked as close as possible to the current one so the turn is short.
function nearest(target: number, current: number) {
  return target + 360 * Math.round((current - target) / 360);
}

export function randomFace() {
  return DIE_FACES[Math.floor(Math.random() * DIE_FACES.length)].show;
}

function integrate(b: Body, dt: number, pickFace: () => { x: number; y: number }) {
  if (b.held) {
    b.z += (PHYSICS.liftHeight - b.z) * Math.min(1, dt * 12);
    b.vz = 0;
  } else if (b.z > 0 || b.vz !== 0) {
    b.vz -= PHYSICS.gravity * dt;
    b.z += b.vz * dt;
    if (b.z <= 0) {
      b.z = 0;
      // A small bounce on landing, then rest.
      b.vz = b.vz < -0.8 ? -b.vz * 0.35 : 0;
    }
  }

  if (!b.held) {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.a += b.va * dt;
    // Only the table slows a piece down. In the air it keeps its speed.
    if (b.z === 0) {
      const slow = Math.exp(-PHYSICS.friction * dt);
      b.vx *= slow;
      b.vy *= slow;
      b.va *= Math.exp(-PHYSICS.spinFriction * dt);
    }
    if (Math.hypot(b.vx, b.vy) < PHYSICS.restSpeed && b.z === 0) {
      b.vx = 0;
      b.vy = 0;
    }
    if (Math.abs(b.va) < 4 && b.z === 0) b.va = 0;
  }

  if (b.die) {
    const speed = Math.hypot(b.vx, b.vy);
    if (b.held || b.z > 0 || speed > PHYSICS.dieSettleSpeed) {
      // Rolling across the table turns the cube around the axis across the motion.
      b.rx -= b.vy * dt * PHYSICS.dieTumble;
      b.ry += b.vx * dt * PHYSICS.dieTumble;
      b.settle = null;
    } else {
      if (!b.settle) {
        const face = pickFace();
        b.settle = { x: nearest(face.x, b.rx), y: nearest(face.y, b.ry) };
      }
      const t = Math.min(1, dt * 12);
      b.rx += (b.settle.x - b.rx) * t;
      b.ry += (b.settle.y - b.ry) * t;
    }
  }
}

function hitWalls(b: Body, w: number, h: number) {
  const e = PHYSICS.wallBounce;
  if (b.x < b.r) {
    b.x = b.r;
    if (b.vx < 0) (b.vx = -b.vx * e), (b.va += b.vy * 0.3);
  } else if (b.x > w - b.r) {
    b.x = w - b.r;
    if (b.vx > 0) (b.vx = -b.vx * e), (b.va -= b.vy * 0.3);
  }
  if (b.y < b.r) {
    b.y = b.r;
    if (b.vy < 0) (b.vy = -b.vy * e), (b.va -= b.vx * 0.3);
  } else if (b.y > h - b.r) {
    b.y = h - b.r;
    if (b.vy > 0) (b.vy = -b.vy * e), (b.va += b.vx * 0.3);
  }
}

function collide(a: Body, b: Body) {
  // A piece high in the air passes over pieces on the table.
  if (Math.abs(a.z - b.z) > 0.6) return;
  let dx = b.x - a.x;
  let dy = b.y - a.y;
  let dist = Math.hypot(dx, dy);
  const min = a.r + b.r;
  if (dist >= min) return;
  if (dist === 0) (dx = 1), (dy = 0), (dist = 1);

  // Heavier pieces are bigger. A held piece acts as if it had infinite mass.
  const ia = a.held ? 0 : 1 / (a.r * a.r);
  const ib = b.held ? 0 : 1 / (b.r * b.r);
  if (ia + ib === 0) return;
  const nx = dx / dist;
  const ny = dy / dist;

  const overlap = min - dist;
  a.x -= nx * overlap * (ia / (ia + ib));
  a.y -= ny * overlap * (ia / (ia + ib));
  b.x += nx * overlap * (ib / (ia + ib));
  b.y += ny * overlap * (ib / (ia + ib));

  const closing = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
  if (closing >= 0) return;
  const j = (-(1 + PHYSICS.pieceBounce) * closing) / (ia + ib);
  a.vx -= j * ia * nx;
  a.vy -= j * ia * ny;
  b.vx += j * ib * nx;
  b.vy += j * ib * ny;

  // A glancing hit sets both pieces spinning.
  const slide = (b.vx - a.vx) * -ny + (b.vy - a.vy) * nx;
  if (ia) a.va += slide * 0.4;
  if (ib) b.va -= slide * 0.4;
}

// Advances the table by dt seconds. Returns true while anything still moves.
export function step(bodies: Body[], dt: number, w: number, h: number, pickFace = randomFace) {
  // Short substeps so fast pieces don't pass through each other or the walls.
  const substeps = Math.max(1, Math.ceil(dt / (1 / 120)));
  const sub = dt / substeps;
  for (let s = 0; s < substeps; s++) {
    for (const b of bodies) integrate(b, sub, pickFace);
    for (let i = 0; i < bodies.length; i++) {
      for (let j = i + 1; j < bodies.length; j++) collide(bodies[i], bodies[j]);
    }
    for (const b of bodies) hitWalls(b, w, h);
  }

  return bodies.some(
    (b) =>
      b.held ||
      b.z > 0 ||
      b.vz !== 0 ||
      b.vx !== 0 ||
      b.vy !== 0 ||
      b.va !== 0 ||
      (b.die && (!b.settle || Math.abs(b.settle.x - b.rx) > 0.2 || Math.abs(b.settle.y - b.ry) > 0.2)),
  );
}

// Throw velocity from recent pointer samples, in px/s.
export function throwVelocity(samples: { x: number; y: number; t: number }[], now: number) {
  const recent = samples.filter((s) => now - s.t <= 100);
  if (recent.length < 2) return { vx: 0, vy: 0 };
  const first = recent[0];
  const last = recent[recent.length - 1];
  const dt = (last.t - first.t) / 1000;
  if (dt < 0.01) return { vx: 0, vy: 0 };
  let vx = (last.x - first.x) / dt;
  let vy = (last.y - first.y) / dt;
  const speed = Math.hypot(vx, vy);
  if (speed > PHYSICS.maxSpeed) (vx *= PHYSICS.maxSpeed / speed), (vy *= PHYSICS.maxSpeed / speed);
  return { vx, vy };
}
