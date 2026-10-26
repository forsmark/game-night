import { cn } from "@/lib/utils";

// Box-lid colours for games without a BGG thumbnail, from the paper palette.
const LIDS = [
  { bg: "#e8ab8c", fg: "#3a2b3e" },
  { bg: "#dc968c", fg: "#3a2b3e" },
  { bg: "#dc6c70", fg: "#fff6ef" },
  { bg: "#ae6377", fg: "#fff6ef" },
  { bg: "#8d5f7b", fg: "#fff6ef" },
  { bg: "#6c587b", fg: "#fff6ef" },
];

// Hand-typed games have negative ids. A plain % would give a negative index for them.
function pick<T>(list: T[], bggId: number) {
  return list[((bggId % list.length) + list.length) % list.length];
}

// Each game keeps its own small tilt, as if placed by hand.
function tilt(bggId: number) {
  return ((Math.abs(bggId) * 37) % 7) - 3;
}

function initials(name: string) {
  const words = name.replace(/[^\p{L}\p{N} ]/gu, " ").split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? "?").slice(0, 2)).toUpperCase();
}

export function GameTile({
  game,
  size = 64,
  className,
}: {
  game: { bggId: number; name: string; thumbnail: string | null };
  size?: number;
  className?: string;
}) {
  const style = { width: size, height: size, rotate: `${tilt(game.bggId)}deg` };
  const lid = pick(LIDS, game.bggId);
  if (game.thumbnail) {
    return (
      <img
        src={game.thumbnail}
        alt=""
        loading="lazy"
        style={style}
        className={cn(
          "shrink-0 rounded-[var(--wobble-sm)] border-2 border-ink object-cover shadow-[0_3px_0_var(--ink)]",
          className,
        )}
      />
    );
  }
  return (
    <div
      aria-hidden
      style={{ ...style, backgroundColor: lid.bg, color: lid.fg, backgroundImage: "var(--grain)", fontSize: size * 0.36 }}
      className={cn(
        "flex shrink-0 items-center justify-center rounded-[var(--wobble-sm)] border-2 border-ink font-display shadow-[0_3px_0_var(--ink)]",
        className,
      )}
    >
      {initials(game.name)}
    </div>
  );
}
