import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Dices, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { makeBody, step, throwVelocity, type Body } from "@/lib/physics";
import { MEEPLE_COLORS, type MeepleColor } from "../../../shared/meeples";
import { Meeple } from "./meeple";
import { DieCube } from "./die";
import { Card, HexTile, Pawn, WoodCube } from "./wood";

type Kind = "meeple" | "die" | "pawn" | "cube" | "card" | "hex";
type Piece = { id: number; kind: Kind; color: MeepleColor; spawned: boolean };

// Collision radius per piece, in px. The drawn piece fits inside it.
const RADIUS: Record<Kind, number> = { meeple: 19, die: 21, pawn: 18, cube: 17, card: 24, hex: 26 };
// How often each kind turns up when you toss a piece.
const ODDS: [Kind, number][] = [["meeple", 35], ["die", 25], ["cube", 15], ["pawn", 10], ["card", 8], ["hex", 7]];
const MAX_SPAWNED = 40;

function randomKind(): Kind {
  let roll = Math.random() * 100;
  for (const [kind, odds] of ODDS) if ((roll -= odds) < 0) return kind;
  return "meeple";
}

function PieceView({ kind, color, cubeRef }: { kind: Kind; color: MeepleColor; cubeRef: (el: HTMLDivElement | null) => void }) {
  switch (kind) {
    case "meeple":
      return <Meeple color={color} size={34} />;
    case "die":
      return <DieCube size={30} cubeRef={cubeRef} />;
    case "pawn":
      return <Pawn size={32} />;
    case "cube":
      return <WoodCube size={30} />;
    case "card":
      return <Card size={50} />;
    case "hex":
      return <HexTile size={50} />;
  }
}

type Parts = { el: HTMLDivElement | null; shadow: HTMLDivElement | null; cube: HTMLDivElement | null };
type Drag = { dx: number; dy: number; startX: number; startY: number; moved: boolean; samples: { x: number; y: number; t: number }[] };

function pieceTransform(b: Body) {
  return `translate3d(${b.x - b.r}px, ${b.y - b.r}px, 0) rotate(${b.a}deg) scale(${1 + b.z * 0.45})`;
}

// Wooden pieces lying on the page like on a table top. Throw them, knock them into each other,
// toss in more. They scroll with the page and stay put between pages.
export function Playground() {
  const layerRef = useRef<HTMLDivElement>(null);
  const bodies = useRef(new Map<number, Body>());
  const parts = useRef(new Map<number, Parts>());
  const drags = useRef(new Map<number, Drag>());
  const size = useRef({ w: 0, h: 0 });
  const frame = useRef<number | null>(null);
  const nextId = useRef(1);
  const [pieces, setPieces] = useState<Piece[]>([]);

  const draw = useCallback(() => {
    for (const [id, b] of bodies.current) {
      const p = parts.current.get(id);
      if (!p?.el) continue;
      p.el.style.transform = pieceTransform(b);
      p.el.style.zIndex = b.held || b.z > 0 ? "2" : "1";
      if (p.shadow) {
        // The shadow drifts away and fades in as the piece rises.
        p.shadow.style.transform = `translate3d(${b.x - b.r + b.z * 14}px, ${b.y - b.r + b.z * 22}px, 0) scale(${0.85 + b.z * 0.2})`;
        p.shadow.style.opacity = String(Math.min(0.4, b.z * 0.7));
      }
      if (p.cube) p.cube.style.transform = `rotateX(${b.rx}deg) rotateY(${b.ry}deg)`;
    }
  }, []);

  const wake = useCallback(() => {
    if (frame.current !== null) return;
    let last = performance.now();
    const tick = (now: number) => {
      // Cap the step so a background tab doesn't fling pieces through walls when it returns.
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const awake = step([...bodies.current.values()], dt, size.current.w, size.current.h);
      draw();
      frame.current = awake ? requestAnimationFrame(tick) : null;
    };
    frame.current = requestAnimationFrame(tick);
  }, [draw]);

  const addPiece = useCallback((kind: Kind, body: Partial<Body> & { x: number; y: number }, spawned: boolean) => {
    const id = nextId.current++;
    const color = MEEPLE_COLORS[Math.floor(Math.random() * 8)];
    bodies.current.set(id, makeBody({ id, r: RADIUS[kind], die: kind === "die", ...body }));
    setPieces((list) => [...list, { id, kind, color, spawned }]);
  }, []);

  // Track the table size, and lay out the starting pieces in the top-right corner once.
  useEffect(() => {
    const layer = layerRef.current!;
    const measure = () => {
      size.current = { w: layer.clientWidth, h: layer.clientHeight };
      wake();
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(layer);

    const w = layer.clientWidth;
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const start: [Kind, number, number][] = [
      ["die", w - 46, 128],
      ["cube", w - 104, 100],
      ["pawn", w - 40, 196],
    ];
    if (w >= 640) start.push(["card", w - 170, 170], ["hex", w - 250, 112], ["meeple", w - 120, 250]);
    // They drop onto the table one after another when the page opens.
    start.forEach(([kind, x, y], i) => addPiece(kind, { x, y, z: calm ? 0 : 1 + i * 0.25, a: (i * 47) % 40 - 20, settle: { x: 0, y: 0 } }, false));

    return () => {
      observer.disconnect();
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
      bodies.current.clear();
      parts.current.clear();
      setPieces([]);
    };
  }, [addPiece, wake]);

  // New pieces need their elements in place before the first frame.
  useEffect(() => {
    draw();
    wake();
  }, [pieces, draw, wake]);

  const toLocal = (e: ReactPointerEvent) => {
    const rect = layerRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const onPointerDown = (id: number) => (e: ReactPointerEvent<HTMLDivElement>) => {
    const b = bodies.current.get(id);
    if (!b) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = toLocal(e);
    b.held = true;
    b.vx = b.vy = 0;
    drags.current.set(id, { dx: p.x - b.x, dy: p.y - b.y, startX: p.x, startY: p.y, moved: false, samples: [{ ...p, t: e.timeStamp }] });
    wake();
  };

  const onPointerMove = (id: number) => (e: ReactPointerEvent<HTMLDivElement>) => {
    const b = bodies.current.get(id);
    const drag = drags.current.get(id);
    if (!b || !drag) return;
    const p = toLocal(e);
    drag.samples.push({ ...p, t: e.timeStamp });
    drag.samples = drag.samples.filter((s) => e.timeStamp - s.t <= 150);
    if (Math.hypot(p.x - drag.startX, p.y - drag.startY) > 4) drag.moved = true;
    b.x = p.x - drag.dx;
    b.y = p.y - drag.dy;
    // The hand's speed, so a held piece knocks others with the right force.
    const { vx, vy } = throwVelocity(drag.samples, e.timeStamp);
    b.vx = vx;
    b.vy = vy;
    // Lean the piece into the motion a little.
    b.a += vx * 0.002;
    wake();
  };

  const onPointerUp = (id: number) => (e: ReactPointerEvent<HTMLDivElement>) => {
    const b = bodies.current.get(id);
    const drag = drags.current.get(id);
    if (!b || !drag) return;
    drags.current.delete(id);
    b.held = false;
    if (drag.moved) {
      const { vx, vy } = throwVelocity(drag.samples, e.timeStamp);
      b.vx = vx;
      b.vy = vy;
      b.va += (Math.random() < 0.5 ? -1 : 1) * Math.hypot(vx, vy) * 0.25;
      b.vz = 0.6;
    } else {
      // A tap flicks the piece: a hop, a spin and a short slide. Dice roll.
      const angle = Math.random() * Math.PI * 2;
      b.vx = Math.cos(angle) * 260;
      b.vy = Math.sin(angle) * 260;
      b.va = (Math.random() - 0.5) * 900;
      b.vz = 2.2;
      b.settle = null;
    }
    wake();
  };

  const spawned = pieces.filter((p) => p.spawned).length;

  const toss = () => {
    const rect = layerRef.current!.getBoundingClientRect();
    // Drop it over the middle of the screen, wherever the page is scrolled to.
    const x = window.innerWidth / 2 - rect.left + (Math.random() - 0.5) * 160;
    const y = window.innerHeight * 0.35 - rect.top;
    const angle = Math.random() * Math.PI * 2;
    const speed = 250 + Math.random() * 450;
    addPiece(
      randomKind(),
      { x, y, z: 1.6, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, va: (Math.random() - 0.5) * 1000, a: Math.random() * 360 },
      true,
    );
  };

  const clear = () => {
    const keep = pieces.filter((p) => !p.spawned);
    for (const p of pieces) if (p.spawned) bodies.current.delete(p.id), parts.current.delete(p.id);
    setPieces(keep);
  };

  return (
    <>
      <div ref={layerRef} aria-hidden className="pointer-events-none absolute inset-0 z-30 overflow-hidden">
        {pieces.map((piece) => {
          const b = bodies.current.get(piece.id)!;
          const ref = (key: keyof Parts) => (el: HTMLDivElement | null) => {
            const entry = parts.current.get(piece.id) ?? { el: null, shadow: null, cube: null };
            entry[key] = el;
            parts.current.set(piece.id, entry);
          };
          return (
            <div key={piece.id}>
              <div
                ref={ref("shadow")}
                className="absolute top-0 left-0 rounded-full bg-[rgb(var(--shadow-color))] opacity-0 blur-[5px]"
                style={{ width: b.r * 2, height: b.r * 2 }}
              />
              <div
                ref={ref("el")}
                onPointerDown={onPointerDown(piece.id)}
                onPointerMove={onPointerMove(piece.id)}
                onPointerUp={onPointerUp(piece.id)}
                onPointerCancel={onPointerUp(piece.id)}
                className="pointer-events-auto absolute top-0 left-0 flex cursor-grab touch-none items-center justify-center select-none will-change-transform active:cursor-grabbing"
                style={{ width: b.r * 2, height: b.r * 2, transform: pieceTransform(b) }}
              >
                <PieceView kind={piece.kind} color={piece.color} cubeRef={ref("cube")} />
              </div>
            </div>
          );
        })}
      </div>

      <div className="fixed bottom-4 left-4 z-40 flex gap-2">
        <Button
          variant="outline"
          className="rounded-full"
          onClick={toss}
          disabled={spawned >= MAX_SPAWNED}
          title={spawned >= MAX_SPAWNED ? `The table holds ${MAX_SPAWNED} extra pieces. Clear some first.` : undefined}
        >
          <Dices /> Toss a piece
        </Button>
        {spawned > 0 && (
          <Button variant="outline" size="icon" className="rounded-full" aria-label="Clear the pieces you tossed" onClick={clear}>
            <X />
          </Button>
        )}
      </div>
    </>
  );
}
