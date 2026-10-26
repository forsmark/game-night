import { useState } from "react";
import { Check, Loader2, PenLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ManualGameForm } from "@/components/manual-game-form";
import { useGameSearch, type Game } from "@/lib/queries/games";

// Find a game by searching first. Typing it in by hand is the fallback, offered under the
// results and as the main action when nothing matches.
export function GamePicker({
  actionLabel,
  taken,
  takenLabel,
  onPick,
  pending,
  baseGamesOnly = false,
  bases,
}: {
  // What happens to a picked game, e.g. "I'll bring it" or "Add".
  actionLabel: string;
  // Games that can't be picked again, and why.
  taken: Set<number>;
  takenLabel: string;
  onPick: (bggId: number, name: string) => void;
  pending: boolean;
  // When suggesting a game, expansions can't be picked.
  baseGamesOnly?: boolean;
  // For the shelf: lets a hand-typed game be saved as an expansion.
  bases?: Game[];
}) {
  const [query, setQuery] = useState("");
  const [byHand, setByHand] = useState(false);
  const search = useGameSearch(query);
  const typed = query.trim();

  if (byHand) {
    return (
      <div className="flex flex-col gap-3">
        <ManualGameForm submitLabel={actionLabel} initialName={typed} bases={bases} onSaved={onPick} />
        <Button variant="link" className="self-center" onClick={() => setByHand(false)}>
          Back to search
        </Button>
      </div>
    );
  }

  const results = (search.data?.results ?? []).filter((r) => !baseGamesOnly || r.kind !== "expansion");
  const searched = typed.length >= 2 && search.isSuccess && !search.isFetching;
  const nothingFound = searched && results.length === 0;

  return (
    <div className="flex flex-col gap-3">
      <Input placeholder="Search by the name on the box" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search for a game" autoFocus />
      {search.data?.bgg === "off" && (
        <p className="text-xs text-muted-foreground">
          BoardGameGeek search isn't set up on this server yet, so this searches games already added here.
        </p>
      )}
      {search.data?.bgg === "error" && (
        <p className="text-xs text-muted-foreground">
          BoardGameGeek didn't answer ({search.data.message}). Showing games already added here.
        </p>
      )}
      {search.isFetching && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Searching
        </p>
      )}
      {search.isError && <p className="text-sm text-destructive">{search.error.message}</p>}

      {results.length > 0 && (
        <ul className="flex max-h-72 flex-col gap-1 overflow-y-auto">
          {results.map((result) => {
            const isTaken = taken.has(result.bggId);
            return (
              <li key={result.bggId}>
                <button
                  disabled={pending || isTaken}
                  onClick={() => onPick(result.bggId, result.name)}
                  className="flex w-full items-center justify-between gap-3 rounded-lg p-2 text-left hover:bg-muted focus-visible:bg-muted focus-visible:outline-none disabled:opacity-60"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{result.name}</span>
                    <span className="font-data text-xs text-muted-foreground">
                      {/* A Set drops "on the shelf" twice when that is also why it can't be picked. */}
                      {[
                        ...new Set([
                          result.year,
                          result.kind === "expansion" && "expansion",
                          result.onShelf && "on the shelf",
                          isTaken && takenLabel,
                        ]),
                      ]
                        .filter(Boolean)
                        .join(" · ") || "Added by hand"}
                    </span>
                  </span>
                  {isTaken ? (
                    <Check className="size-4 shrink-0 text-primary" aria-label={takenLabel} />
                  ) : (
                    <span className="shrink-0 text-sm font-medium text-primary">{actionLabel}</span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {nothingFound ? (
        <div className="flex flex-col items-center gap-2 py-2 text-center">
          <p className="text-sm text-muted-foreground">No game called "{typed}" found.</p>
          <Button className="rounded-full" onClick={() => setByHand(true)}>
            <PenLine /> Add "{typed}" by hand
          </Button>
        </div>
      ) : (
        <Button variant="link" className="self-center" onClick={() => setByHand(true)}>
          Can't find it? Add it by hand
        </Button>
      )}
    </div>
  );
}
