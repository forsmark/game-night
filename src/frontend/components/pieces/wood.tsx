import { cn } from "@/lib/utils";
import { shade } from "@/lib/color";

const DEPTH = 9;

// A flat wooden token: a darker side for thickness, then the face, with the shared wood filter.
function Token({ d, color, size, className }: { d: string; color: string; size: number; className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox={`0 0 100 ${100 + DEPTH}`}
      width={size}
      height={size * ((100 + DEPTH) / 100)}
      className={cn("overflow-visible drop-shadow-[0_3px_2px_rgb(var(--shadow-color)/0.35)]", className)}
    >
      <path d={d} transform={`translate(0 ${DEPTH})`} fill="none" stroke="var(--meeple-outline)" strokeWidth={6} strokeLinejoin="round" />
      <path d={d} fill="none" stroke="var(--meeple-outline)" strokeWidth={6} strokeLinejoin="round" />
      <g filter="url(#wood)">
        {[DEPTH, DEPTH * 0.5].map((dy) => (
          <path key={dy} d={d} transform={`translate(0 ${dy})`} fill={shade(color, -0.4)} />
        ))}
        <path d={d} fill={color} />
      </g>
    </svg>
  );
}

const PAWN =
  "M50 8a14 14 0 1 1 0 28a14 14 0 1 1 0-28z M50 36C41 36 37 45 39 52C32 67 28 76 26 84H74C72 76 68 67 61 52C63 45 59 36 50 36z M20 84h60a6 6 0 0 1 6 6v0a6 6 0 0 1-6 6H20a6 6 0 0 1-6-6v0a6 6 0 0 1 6-6z";

export function Pawn({ color = "#dc6c70", size = 36, className }: { color?: string; size?: number; className?: string }) {
  return <Token d={PAWN} color={color} size={size} className={className} />;
}

// An isometric wooden cube, like a resource cube.
export function WoodCube({ color = "#d9a066", size = 34, className }: { color?: string; size?: number; className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 100 100" width={size} height={size} className={cn("overflow-visible drop-shadow-[0_3px_2px_rgb(var(--shadow-color)/0.35)]", className)}>
      <g filter="url(#wood)">
        <path d="M50 8 88 28 50 48 12 28z" fill={shade(color, 0.18)} />
        <path d="M12 28 50 48 50 92 12 72z" fill={color} />
        <path d="M88 28 50 48 50 92 88 72z" fill={shade(color, -0.35)} />
      </g>
      <path d="M50 8 88 28 88 72 50 92 12 72 12 28z M12 28 50 48 88 28 M50 48 50 92" fill="none" stroke="var(--meeple-outline)" strokeWidth={4} strokeLinejoin="round" />
    </svg>
  );
}

// A playing card with a hand-drawn heart.
export function Card({ size = 44, className }: { size?: number; className?: string }) {
  const heart = "M0 4C0-1 6-3 8 1C10-3 16-1 16 4C16 9 8 13 8 15C8 13 0 9 0 4z";
  return (
    <svg aria-hidden viewBox="0 0 70 100" width={size * 0.7} height={size} className={cn("overflow-visible drop-shadow-[0_3px_2px_rgb(var(--shadow-color)/0.35)]", className)}>
      <rect x="3" y="3" width="64" height="94" rx="9" fill="#fff6ef" stroke="var(--meeple-outline)" strokeWidth={3.5} />
      <rect x="10" y="10" width="50" height="80" rx="5" fill="none" stroke="#dc6c70" strokeWidth={1.5} strokeDasharray="3 3" />
      <path d={heart} transform="translate(23 40) scale(1.5)" fill="#dc6c70" stroke="var(--meeple-outline)" strokeWidth={1.4} />
      <text x="13" y="24" fontSize="13" fontWeight="800" fill="#dc6c70" fontFamily="var(--font-display)">A</text>
    </svg>
  );
}

// A hex terrain tile with a number token.
export function HexTile({ size = 52, className }: { size?: number; className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 100 100" width={size} height={size} className={cn("overflow-visible drop-shadow-[0_3px_2px_rgb(var(--shadow-color)/0.35)]", className)}>
      <path d="M50 4 90 27 90 73 50 96 10 73 10 27z" fill="#e8ab8c" stroke="var(--meeple-outline)" strokeWidth={4} strokeLinejoin="round" />
      <path d="M50 14 81 32 81 68 50 86 19 68 19 32z" fill="none" stroke="#ae6377" strokeWidth={2} strokeDasharray="4 4" />
      <circle cx="50" cy="50" r="15" fill="#fff6ef" stroke="var(--meeple-outline)" strokeWidth={3} />
      <text x="50" y="57" textAnchor="middle" fontSize="20" fontWeight="800" fill="#dc6c70" fontFamily="var(--font-display)">8</text>
    </svg>
  );
}
