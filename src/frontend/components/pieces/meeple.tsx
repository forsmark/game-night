import { MEEPLES, type MeepleColor } from "../../../shared/meeples";
import { cn } from "@/lib/utils";
import { shade } from "@/lib/color";

const PATH =
  "M50 6C59 6 66 13 66 22c0 6-3 10-6 13l28 9c7 2 8 12 1 14l-19 4 14 28c2 5-2 8-7 8H60L50 80 40 98H23c-5 0-9-3-7-8l14-28-19-4c-7-2-6-12 1-14l28-9c-3-3-6-7-6-13 0-9 7-16 16-16z";
// How far the wooden side shows below the top face, in viewBox units.
const DEPTH = 10;

// A wooden meeple seen from slightly above: a darker side for thickness,
// grain and a bevel highlight from the shared "wood" filter, and an ink outline.
export function Meeple({
  color,
  size = 24,
  className,
  title,
}: {
  color: MeepleColor;
  size?: number;
  className?: string;
  title?: string;
}) {
  const face = MEEPLES[color] ?? MEEPLES.grey;
  const side = shade(face, -0.42);

  return (
    <svg
      viewBox={`0 0 100 ${100 + DEPTH}`}
      width={size}
      height={size * ((100 + DEPTH) / 100)}
      className={cn("shrink-0 overflow-visible drop-shadow-[0_2px_1px_rgb(var(--shadow-color)/0.35)]", className)}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
    >
      {title && <title>{title}</title>}
      <path d={PATH} transform={`translate(0 ${DEPTH})`} fill="none" stroke="var(--meeple-outline)" strokeWidth={7} strokeLinejoin="round" />
      <path d={PATH} fill="none" stroke="var(--meeple-outline)" strokeWidth={7} strokeLinejoin="round" />
      <g filter="url(#wood)">
        {[DEPTH, DEPTH * 0.66, DEPTH * 0.33].map((dy) => (
          <path key={dy} d={PATH} transform={`translate(0 ${dy})`} fill={side} />
        ))}
        <path d={PATH} fill={face} />
      </g>
      <path d={PATH} fill="none" stroke="var(--meeple-outline)" strokeOpacity={0.55} strokeWidth={2.5} strokeLinejoin="round" />
    </svg>
  );
}
