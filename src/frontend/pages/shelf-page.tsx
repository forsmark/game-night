import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Download, Loader2, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { GameTile } from "@/components/game-tile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { bggUrl, expansionName, formatBestWith, formatPlayersWithExpansions, formatTime } from "@/lib/format";
import { Complexity } from "@/components/complexity";
import { useAuth } from "@/lib/auth-context";
import {
  useAddToShelf,
  useBggStatus,
  useImportCsv,
  useImportShelf,
  useRemoveFromShelf,
  useSetExpansionBase,
  useShelf,
  type Game,
} from "@/lib/queries/games";
import { useEvent, useNextEventId, useNominate, useRemoveNomination } from "@/lib/queries/events";
import { GamePicker } from "@/components/game-picker";

const PLAYER_FILTERS = [2, 3, 4, 5, 6, 7, 8];

function AddGameDialog({ owned, bases }: { owned: Set<number>; bases: Game[] }) {
  const [open, setOpen] = useState(false);
  const add = useAddToShelf();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="rounded-full">
          <Plus /> Add a game
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-display text-2xl font-normal">Add a game to the shelf</DialogTitle>
          <DialogDescription>Search for it, or add it by hand.</DialogDescription>
        </DialogHeader>
        <GamePicker
          actionLabel="Add"
          taken={owned}
          takenLabel="on the shelf"
          pending={add.isPending}
          bases={bases}
          onPick={(bggId, name) =>
            add.mutate(bggId, {
              onSuccess: () => {
                toast.success(`Added ${name}`);
                setOpen(false);
              },
            })
          }
        />
      </DialogContent>
    </Dialog>
  );
}

function CsvImport({ onDone }: { onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [replace, setReplace] = useState(true);
  const importCsv = useImportCsv();

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!file) return;
        importCsv.mutate(
          { csv: await file.text(), replace },
          {
            onSuccess: (result) => {
              const parts = [`${result.baseGames} games and ${result.expansions} expansions on the shelf`];
              if (result.removed) parts.push(`${result.removed} removed`);
              toast.success(parts.join(". ") + ".");
              if (result.unmatched.length) {
                toast.warning(`Pick a base game for: ${result.unmatched.join(", ")}. They're listed at the bottom of the shelf.`);
              }
              onDone();
            },
          },
        );
      }}
    >
      <p className="text-sm text-muted-foreground">
        On your BGG collection page, choose Export, then Download CSV. Owned games are imported. Expansions are attached to
        their base game.
      </p>
      <Label htmlFor="csv-file">Collection file</Label>
      <Input id="csv-file" type="file" accept=".csv,text/csv" onChange={(e) => setFile(e.target.files?.[0] ?? null)} required />
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} className="mt-0.5 size-4 accent-[var(--primary)]" />
        <span>
          Replace the shelf
          <span className="block text-muted-foreground">Games that aren't in the file leave the shelf.</span>
        </span>
      </label>
      {importCsv.isError && <p className="text-sm text-destructive">{importCsv.error.message}</p>}
      <Button type="submit" disabled={!file || importCsv.isPending} className="rounded-full">
        Import file
      </Button>
    </form>
  );
}

function UsernameImport({ onDone }: { onDone: () => void }) {
  const [username, setUsername] = useState("");
  const importShelf = useImportShelf();
  const status = useBggStatus();

  if (!status.data?.bgg) {
    return (
      <p className="text-sm text-muted-foreground">
        Importing by username needs a BGG API token on the server, and this server doesn't have one yet. Use the CSV file
        for now.
      </p>
    );
  }

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        importShelf.mutate(username, {
          onSuccess: ({ added, total }) => {
            toast.success(`Imported ${total} games and expansions. ${added} were new.`);
            onDone();
          },
        });
      }}
    >
      <p className="text-sm text-muted-foreground">
        Reads your owned games straight from BoardGameGeek, with box images. This needs the BGG token on the server.
      </p>
      <Label htmlFor="bgg-username">BGG username</Label>
      <Input id="bgg-username" value={username} onChange={(e) => setUsername(e.target.value)} required />
      <Button type="submit" disabled={importShelf.isPending} className="rounded-full">
        {importShelf.isPending ? (
          <>
            <Loader2 className="animate-spin" /> Importing. Large collections take a minute.
          </>
        ) : (
          "Import collection"
        )}
      </Button>
    </form>
  );
}

function ImportDialog() {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="rounded-full">
          <Download /> Import collection
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-display text-2xl font-normal">Import your BGG collection</DialogTitle>
          <DialogDescription>Bring in every game you own on BoardGameGeek.</DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="csv">
          <TabsList className="w-full">
            <TabsTrigger value="csv">From a CSV file</TabsTrigger>
            <TabsTrigger value="username">By username</TabsTrigger>
          </TabsList>
          <TabsContent value="csv" className="pt-3">
            <CsvImport onDone={() => setOpen(false)} />
          </TabsContent>
          <TabsContent value="username" className="pt-3">
            <UsernameImport onDone={() => setOpen(false)} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

// Expansions the import couldn't attach to a base game. The host picks one.
function LooseExpansions({ expansions, bases, isHost }: { expansions: Game[]; bases: Game[]; isHost: boolean }) {
  const setBase = useSetExpansionBase();
  const remove = useRemoveFromShelf();
  if (expansions.length === 0) return null;

  return (
    <section className="paper flex flex-col gap-3 p-4">
      <h2 className="font-display text-2xl">Expansions without a base game</h2>
      <p className="text-sm text-muted-foreground">
        {isHost
          ? "Pick the game each one belongs to. Until then, they can't be played."
          : "The host hasn't said which game these belong to yet."}
      </p>
      <ul className="flex flex-col divide-y divide-dashed divide-ink/25">
        {expansions.map((expansion) => (
          <li key={expansion.bggId} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2">
            <span className="min-w-0 flex-1 font-medium">{expansion.name}</span>
            {isHost && (
              <>
                <select
                  aria-label={`Base game for ${expansion.name}`}
                  defaultValue=""
                  onChange={(e) => e.target.value && setBase.mutate({ bggId: expansion.bggId, baseId: Number(e.target.value) })}
                  className="h-9 rounded-[var(--wobble-sm)] border-2 border-input/80 bg-card px-2 text-sm"
                >
                  <option value="" disabled>
                    Belongs to…
                  </option>
                  {bases.map((base) => (
                    <option key={base.bggId} value={base.bggId}>
                      {base.name}
                    </option>
                  ))}
                </select>
                <Button variant="ghost" size="icon-sm" aria-label={`Remove ${expansion.name} from the shelf`} onClick={() => remove.mutate(expansion.bggId)}>
                  <Trash2 />
                </Button>
              </>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

type SuggestState =
  | { state: "none" }
  | { state: "available"; onSuggest: () => void }
  | { state: "suggested"; canTakeOff: boolean; suggestedBy: string; otherVotes: number; onTakeOff: () => void };

// "Suggest for next night" and "On the vote" are one toggle. Taking a game off also drops its votes,
// so when other people voted for it, the first tap asks and the second confirms.
function VoteToggle({ suggest, gameName }: { suggest: SuggestState; gameName: string }) {
  const [armed, setArmed] = useState(false);
  if (suggest.state === "none") return <span />;
  if (suggest.state === "available") {
    return (
      <Button variant="outline" size="sm" className="rounded-full" onClick={suggest.onSuggest}>
        Suggest for next night
      </Button>
    );
  }
  if (!suggest.canTakeOff) {
    return (
      <span className="inline-flex items-center gap-1 text-sm text-primary" title={`Suggested by ${suggest.suggestedBy}`}>
        <Check className="size-4" /> On the vote
      </span>
    );
  }
  const votes = suggest.otherVotes;
  return (
    <Button
      variant={armed ? "destructive" : "secondary"}
      size="sm"
      className="rounded-full"
      aria-label={armed ? `Confirm: take ${gameName} off the vote` : `${gameName} is on the vote. Take it off`}
      onBlur={() => setArmed(false)}
      onClick={() => {
        if (votes > 0 && !armed) return setArmed(true);
        setArmed(false);
        suggest.onTakeOff();
      }}
    >
      {armed ? (
        `Take off? ${votes} ${votes === 1 ? "vote goes" : "votes go"} too`
      ) : (
        <>
          <Check /> On the vote <X className="opacity-60" />
        </>
      )}
    </Button>
  );
}

function ShelfCard({
  game,
  isHost,
  suggest,
}: {
  game: Game;
  isHost: boolean;
  suggest: SuggestState;
}) {
  const remove = useRemoveFromShelf();
  const best = formatBestWith(game.bestWith);

  return (
    <motion.li
      layout
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      className="paper flex flex-col gap-3 p-3"
    >
      <div className="flex gap-3">
        <GameTile game={game} size={64} />
        <div className="min-w-0 flex-1">
          {bggUrl(game.bggId) ? (
            <a href={bggUrl(game.bggId)!} target="_blank" rel="noreferrer" className="font-display text-lg leading-tight hover:underline">
              {game.name}
            </a>
          ) : (
            <span className="font-display text-lg leading-tight">{game.name}</span>
          )}
          <div className="font-data text-xs text-muted-foreground">
            {[formatPlayersWithExpansions(game), formatTime(game)].filter(Boolean).join(" · ")}
          </div>
          {best && <div className="font-data text-xs text-muted-foreground">{best}</div>}
          <Complexity weight={game.weight} className="mt-1" />
        </div>
      </div>
      {game.expansions.length > 0 && (
        <ul aria-label={`Expansions for ${game.name}`} className="flex flex-wrap gap-1.5 text-xs">
          {game.expansions.map((expansion) => (
            <li key={expansion.bggId} className="paper-chip">
              + {expansionName(expansion.name, game.name)}
              {isHost && (
                <button
                  aria-label={`Remove ${expansion.name} from the shelf`}
                  onClick={() => remove.mutate(expansion.bggId)}
                  className="-mr-1 rounded-full p-0.5 text-muted-foreground hover:text-foreground"
                >
                  <X className="size-3" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-auto flex items-center justify-between gap-2">
        <VoteToggle suggest={suggest} gameName={game.name} />
        {isHost && (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Remove ${game.name} from the shelf`}
            className="text-muted-foreground"
            onClick={() => remove.mutate(game.bggId)}
          >
            <Trash2 />
          </Button>
        )}
      </div>
    </motion.li>
  );
}

export default function ShelfPage() {
  const { member } = useAuth();
  const shelf = useShelf();
  const [players, setPlayers] = useState<number | null>(null);
  const [filter, setFilter] = useState("");
  const nextId = useNextEventId().data?.id ?? null;
  const next = useEvent(nextId ?? "", false);
  const nominate = useNominate(nextId ?? "");
  const takeOff = useRemoveNomination(nextId ?? "");
  const isHost = member?.role === "host";

  const all = shelf.data ?? [];
  const owned = new Set(all.map((g) => g.bggId));
  const games = all.filter((g) => g.kind === "base");
  const baseIds = new Set(games.map((g) => g.bggId));
  const expansionCount = all.length - games.length;
  // Expansions whose base game isn't known or isn't on the shelf.
  const loose = all.filter((g) => g.kind === "expansion" && (g.baseId === null || !baseIds.has(g.baseId)));
  const nominations = new Map((nextId ? next.data?.nominations ?? [] : []).map((n) => [n.game.bggId, n]));
  const names = new Map((next.data?.members ?? []).map((m) => [m.id, m.name]));

  const suggestState = (game: Game): SuggestState => {
    if (!nextId) return { state: "none" };
    const nomination = nominations.get(game.bggId);
    if (!nomination) {
      return {
        state: "available",
        onSuggest: () =>
          nominate.mutate({ bggId: game.bggId, bringing: false }, { onSuccess: () => toast.success(`${game.name} is on the vote`) }),
      };
    }
    return {
      state: "suggested",
      // The server allows the person who suggested it, or the host.
      canTakeOff: isHost || nomination.nominatedBy === member?.id,
      suggestedBy: names.get(nomination.nominatedBy) ?? "someone",
      otherVotes: nomination.voters.filter((id) => id !== member?.id).length,
      onTakeOff: () => takeOff.mutate(game.bggId, { onSuccess: () => toast.success(`${game.name} is off the vote`) }),
    };
  };
  const shown = games.filter(
    (g) =>
      (players === null || (g.minPlayers <= players && players <= g.maxWithExpansions)) &&
      g.name.toLowerCase().includes(filter.trim().toLowerCase()),
  );

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-5xl">The shelf</h1>
          <p className="text-muted-foreground">
            {games.length} {games.length === 1 ? "game" : "games"}
            {expansionCount > 0 && ` and ${expansionCount} ${expansionCount === 1 ? "expansion" : "expansions"}`} at the
            host's place.
          </p>
        </div>
        {isHost && (
          <div className="flex flex-wrap gap-2">
            <ImportDialog />
            <AddGameDialog owned={owned} bases={games} />
          </div>
        )}
      </header>

      <div className="flex flex-col gap-3">
        <Input placeholder="Find a game" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Find a game" className="max-w-sm bg-card" />
        <div role="radiogroup" aria-label="Players" className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-sm text-muted-foreground">Players</span>
          {[null, ...PLAYER_FILTERS].map((n) => (
            <button
              key={n ?? "any"}
              role="radio"
              aria-checked={players === n}
              onClick={() => setPlayers(n)}
              className={cn(
                "min-w-9 rounded-[var(--wobble-sm)] border-2 px-3 py-1 font-data text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                players === n
                  ? "border-ink bg-primary text-primary-foreground shadow-[0_2px_0_var(--ink)]"
                  : "border-ink/40 bg-card hover:bg-muted",
              )}
            >
              {n ?? "Any"}
            </button>
          ))}
        </div>
      </div>

      {shelf.isSuccess && games.length === 0 ? (
        <p className="paper-hole p-10 text-center text-muted-foreground">
          {isHost ? "The shelf is empty. Import your BGG collection or add games one by one." : "The host hasn't added any games yet."}
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <AnimatePresence initial={false}>
            {shown.map((game) => (
              <ShelfCard
                key={game.bggId}
                game={game}
                isHost={isHost}
                suggest={suggestState(game)}
              />
            ))}
          </AnimatePresence>
        </ul>
      )}
      {games.length > 0 && shown.length === 0 && (
        <p className="text-center text-muted-foreground">No game on the shelf matches. Try another player count.</p>
      )}
      <LooseExpansions expansions={loose} bases={games} isHost={isHost} />
    </div>
  );
}
