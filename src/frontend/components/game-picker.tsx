import { useState } from "react";
import { Check, Loader2, PenLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ManualGameForm } from "@/components/manual-game-form";
import { ApiError } from "@/lib/api-client";
import { bggUrl } from "@/lib/format";
import { GameTile } from "@/components/game-tile";
import { useGameImages, useGameSearch, type Game } from "@/lib/queries/games";

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
  pickError,
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
  // The error from the last pick. When BGG didn't send the game's details, the picker offers
  // to type them in, with the name and BGG link filled in.
  pickError?: Error | null;
}) {
  const [query, setQuery] = useState("");
  const [byHand, setByHand] = useState(false);
  const [picked, setPicked] = useState<{ bggId: number; name: string } | null>(null);
  const search = useGameSearch(query);
  const typed = query.trim();

  if (picked && pickError instanceof ApiError && pickError.code === "BGG") {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          BoardGameGeek didn't send the details for {picked.name}. Fill in the player count, and it's saved with its BGG link.
        </p>
        <ManualGameForm
          submitLabel={actionLabel}
          initialName={picked.name}
          initialLink={bggUrl(picked.bggId) ?? ""}
          bases={bases}
          onSaved={onPick}
        />
        <Button variant="link" className="self-center" onClick={() => setPicked(null)}>
          Back to search
        </Button>
      </div>
    );
  }

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
  // Images for the first results the server had none for. The rest keep the coloured box lid.
  const images = useGameImages(results.filter((r) => !r.thumbnail).map((r) => r.bggId));
  const searched = typed.length >= 2 && search.isSuccess && !search.isFetching;
  const nothingFound = searched && results.length === 0;

  return (
    // min-w-0: in a dialog this is a grid item, and long BGG names would otherwise widen it past the screen.
    <div className="flex min-w-0 flex-col gap-3">
      <Input placeholder="Search by the name on the box" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search for a game" autoFocus />
      {search.data?.bgg === "off" && !search.data.catalogue && (
        <p className="text-xs text-muted-foreground">
          The BoardGameGeek game list isn't loaded yet, so this searches games already added here. The host can load it on
          the Host page.
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
                  onClick={() => {
                    setPicked(result);
                    onPick(result.bggId, result.name);
                  }}
                  className="flex w-full items-center justify-between gap-3 rounded-lg p-2 text-left hover:bg-muted focus-visible:bg-muted focus-visible:outline-none disabled:opacity-60"
                >
                  <GameTile game={{ ...result, thumbnail: result.thumbnail ?? images.data?.images[result.bggId] ?? null }} size={40} />
                  <span className="min-w-0 flex-1">
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
