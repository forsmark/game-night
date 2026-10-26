import type { Ref } from "react";
import { DIE_FACES } from "@/lib/dice";

// Dice are ivory with dark pips in both themes, like the real thing.
const IVORY = "#fff6ef";
const PIP = "#3a2b3e";

// Pip positions on a 3x3 grid, as [row, column].
const PIPS: Record<number, [number, number][]> = {
  1: [[1, 1]],
  2: [[0, 0], [2, 2]],
  3: [[0, 0], [1, 1], [2, 2]],
  4: [[0, 0], [0, 2], [2, 0], [2, 2]],
  5: [[0, 0], [0, 2], [1, 1], [2, 0], [2, 2]],
  6: [[0, 0], [1, 0], [2, 0], [0, 2], [1, 2], [2, 2]],
};

// A six-sided die as a CSS 3D cube, tilted so three faces show.
// The caller turns it by setting a rotateX/rotateY transform on cubeRef.
export function DieCube({ size = 36, cubeRef }: { size?: number; cubeRef?: Ref<HTMLDivElement> }) {
  const half = size / 2;
  const pip = Math.max(3, Math.round(size * 0.16));

  return (
    <div className="shrink-0" style={{ width: size, height: size, perspective: size * 6 }}>
      <div style={{ width: size, height: size, transformStyle: "preserve-3d", transform: "rotateX(-22deg) rotateY(28deg)" }}>
        <div ref={cubeRef} className="relative" style={{ width: size, height: size, transformStyle: "preserve-3d" }}>
          {DIE_FACES.map((face) => (
            <div
              key={face.value}
              className="absolute inset-0 grid grid-cols-3 grid-rows-3 border-2 border-ink p-[14%]"
              style={{
                transform: `${face.place} translateZ(${half}px)`,
                borderRadius: size * 0.2,
                background: `var(--grain), ${IVORY}`,
                boxShadow: "inset -3px -4px 6px rgb(58 43 62 / 0.25)",
                backfaceVisibility: "hidden",
              }}
            >
              {PIPS[face.value].map(([row, col]) => (
                <span
                  key={`${row}-${col}`}
                  className="place-self-center rounded-full"
                  style={{ gridRow: row + 1, gridColumn: col + 1, width: pip, height: pip, background: PIP }}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
