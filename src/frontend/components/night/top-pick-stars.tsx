import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

// A small seeded random number generator, so each star wobbles the same way on every render.
function random(seed: number) {
  let t = seed + 0x6d2b79f5;
  return () => {
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A five-pointed star drawn in one stroke, the way a pen draws it: every point a little off,
// and the line runs past where it started instead of closing neatly. Centred on 12,12.
function sketchedStar(seed: number) {
  const next = random(seed);
  const wobble = (amount: number) => (next() - 0.5) * amount;
  const points: [number, number][] = [];
  for (let i = 0; i < 10; i++) {
    const angle = -Math.PI / 2 + (i * Math.PI) / 5 + wobble(0.12);
    const r = (i % 2 === 0 ? 10 : 4.4) + wobble(1.4);
    points.push([12 + r * Math.cos(angle), 12 + r * Math.sin(angle)]);
  }
  const [first, second] = points;
  const overshoot: [number, number] = [first[0] + (second[0] - first[0]) * 0.35, first[1] + (second[1] - first[1]) * 0.35];
  const route = [...points, first, overshoot];
  return route.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`).join(" ");
}

// Where the stars sit around the card, in percent of its box, with their size and tilt.
// They sit on the card's edge like doodles, stay clear of the buttons, and never reach past the
// page gutter at phone width.
const PLACES = [
  { left: 2, top: -3, size: 34, rotate: -14 },
  { left: 30, top: -5, size: 20, rotate: 12 },
  { left: 97, top: -2, size: 28, rotate: 18 },
  { left: 98.5, top: 52, size: 18, rotate: -8 },
  { left: 2.5, top: 97, size: 22, rotate: 8 },
];

function SketchedStar({ seed, size, delay, still }: { seed: number; size: number; delay: number; still: boolean }) {
  const d = sketchedStar(seed);
  const draw = still
    ? { initial: false as const }
    : { initial: { pathLength: 0 }, animate: { pathLength: 1 }, transition: { duration: 0.45, delay, ease: "easeOut" as const } };
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className="overflow-visible">
      <motion.path d={d} fill="none" stroke="var(--vote)" strokeWidth={2.3} strokeLinecap="round" strokeLinejoin="round" {...draw} />
      {/* A second, lighter pass a hair off the first, like a pen going over the line again. */}
      <motion.path
        d={sketchedStar(seed + 101)}
        fill="none"
        stroke="var(--vote)"
        strokeOpacity={0.5}
        strokeWidth={1.3}
        strokeLinecap="round"
        strokeLinejoin="round"
        {...draw}
      />
    </svg>
  );
}

// Hand-drawn stars around the viewer's own top pick. Purely decoration: the card says
// "Top pick" in words, so screen readers skip the stars.
export function TopPickStars({ className }: { className?: string }) {
  // MotionConfig turns off transforms for reduced motion, but not a path drawing itself in.
  const still = useReducedMotion() ?? false;
  return (
    <div aria-hidden className={cn("pointer-events-none absolute inset-0", className)}>
      {PLACES.map((place, i) => (
        <div
          key={i}
          className="absolute -translate-x-1/2 -translate-y-1/2"
          style={{ left: `${place.left}%`, top: `${place.top}%`, rotate: `${place.rotate}deg` }}
        >
          <SketchedStar seed={i + 1} size={place.size} delay={i * 0.08} still={still} />
        </div>
      ))}
    </div>
  );
}

// A small filled star on a meeple, for a member whose top pick this is.
export function MeepleStar({ size = 11, className }: { size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden
      className={cn("pointer-events-none absolute -top-1 -right-1 overflow-visible", className)}
    >
      <path
        d={sketchedStar(7)}
        fill="var(--vote)"
        stroke="var(--card)"
        strokeWidth={2.5}
        strokeLinejoin="round"
        paintOrder="stroke"
      />
    </svg>
  );
}
