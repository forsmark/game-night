import { cn } from "@/lib/utils";
import { formatWeight } from "@/lib/format";

// BGG weight as five steps, filled up to the game's weight. Helps new players spot an easy game.
export function Complexity({ weight, className }: { weight: number | null; className?: string }) {
  if (!weight) return <span className={cn("text-xs text-muted-foreground", className)}>Complexity not set</span>;
  const word = formatWeight(weight)!;
  const label = `Complexity ${weight.toFixed(1)} of 5: ${word.toLowerCase()}`;

  return (
    <span
      role="img"
      aria-label={label}
      title={`${label}. BGG players rate how hard a game is to learn and play, from 1 (easy) to 5 (heavy).`}
      className={cn("inline-flex max-w-full flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs", className)}
    >
      <span className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map((step) => {
          // How much of this step the weight fills: 2.3 fills steps 1-2 and a third of step 3.
          const fill = Math.max(0, Math.min(1, weight - (step - 1)));
          return (
            <span key={step} className="relative h-2.5 w-3 overflow-hidden rounded-[3px] border-[1.5px] border-ink/70 bg-card">
              <span className="absolute inset-y-0 left-0 bg-primary" style={{ width: `${fill * 100}%` }} />
            </span>
          );
        })}
      </span>
      {/* Kept together so a narrow card moves both below the meter instead of breaking "Medium-heavy". */}
      <span className="whitespace-nowrap">
        <span className="font-semibold">{word}</span>{" "}
        <span className="font-data text-muted-foreground">{weight.toFixed(1)}</span>
      </span>
    </span>
  );
}
