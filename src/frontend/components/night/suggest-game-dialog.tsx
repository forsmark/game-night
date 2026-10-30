import { useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { GameTile } from "@/components/game-tile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatPlayersWithExpansions, formatTime } from "@/lib/format";
import { Complexity } from "@/components/complexity";
import { useShelf } from "@/lib/queries/games";
import { GamePicker } from "@/components/game-picker";
import { useNominate } from "@/lib/queries/events";

function ShelfTab({ nominated, onPick, pending }: { nominated: Set<number>; onPick: (bggId: number) => void; pending: boolean }) {
  const [filter, setFilter] = useState("");
  const shelf = useShelf();
  const games = (shelf.data ?? []).filter(
    (g) => g.kind === "base" && !nominated.has(g.bggId) && g.name.toLowerCase().includes(filter.trim().toLowerCase()),
  );

  return (
    <div className="flex flex-col gap-3">
      <Input placeholder="Filter the shelf" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter the shelf" />
      <ul className="flex max-h-80 flex-col gap-1 overflow-y-auto">
        {games.map((game) => (
          <li key={game.bggId}>
            <button
              disabled={pending}
              onClick={() => onPick(game.bggId)}
              className="flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
            >
              <GameTile game={game} size={40} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{game.name}</span>
                <span className="font-data text-xs text-muted-foreground">
                  {[formatPlayersWithExpansions(game), formatTime(game)].filter(Boolean).join(" · ")}
                  {game.expansions.length > 0 &&
                    ` · +${game.expansions.length} ${game.expansions.length === 1 ? "expansion" : "expansions"}`}
                </span>
                <Complexity weight={game.weight} className="mt-0.5 flex" />
              </span>
              <Plus className="size-4 text-muted-foreground" />
            </button>
          </li>
        ))}
        {shelf.isSuccess && games.length === 0 && (
          <li className="p-4 text-center text-sm text-muted-foreground">
            {filter ? "No shelf game matches that name." : "Every game on the shelf is already suggested."}
          </li>
        )}
      </ul>
    </div>
  );
}

export function SuggestGameDialog({ eventId, nominated }: { eventId: string; nominated: Set<number> }) {
  const [open, setOpen] = useState(false);
  const nominate = useNominate(eventId);

  const pick = (bringing: boolean) => (bggId: number) =>
    nominate.mutate(
      { bggId, bringing },
      {
        onSuccess: () => {
          toast.success(bringing ? "Added. Thanks for bringing it." : "Added to the vote");
          setOpen(false);
        },
      },
    );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="rounded-full">
          <Plus /> Suggest a game
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-display text-2xl font-normal">Suggest a game</DialogTitle>
          <DialogDescription>Pick one from the shelf, or find a game you can bring. It counts as your vote.</DialogDescription>
        </DialogHeader>
        {/* min-w-0: the dialog is a grid, and long BGG names would otherwise widen it past the screen. */}
        <Tabs defaultValue="shelf" className="min-w-0">
          <TabsList className="w-full">
            <TabsTrigger value="shelf">From the shelf</TabsTrigger>
            <TabsTrigger value="bring">I'll bring one</TabsTrigger>
          </TabsList>
          <TabsContent value="shelf" className="pt-2">
            <ShelfTab nominated={nominated} onPick={pick(false)} pending={nominate.isPending} />
          </TabsContent>
          <TabsContent value="bring" className="pt-2">
            <GamePicker
              actionLabel="I'll bring it"
              taken={nominated}
              takenLabel="already suggested"
              onPick={pick(true)}
              pending={nominate.isPending}
              pickError={nominate.error}
              baseGamesOnly
            />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
