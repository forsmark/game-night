import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useCreateManualGame, type Game } from "@/lib/queries/games";

// BGG weight is 1 (light) to 5 (heavy). These sit in the middle of each band used on the cards.
const WEIGHTS = [
  { label: "Light", value: 1.5 },
  { label: "Medium", value: 2.8 },
  { label: "Heavy", value: 3.9 },
];

const toNumber = (value: string) => (value.trim() === "" ? null : Number(value));

// Type in a game BGG can't look up. Calls onSaved with the game's id, new or already known.
export function ManualGameForm({
  submitLabel,
  onSaved,
  bases,
  initialName = "",
}: {
  submitLabel: string;
  onSaved: (bggId: number, name: string) => void;
  // What the person searched for, so they don't type it twice.
  initialName?: string;
  // Shown only to the host on the shelf: lets the game be saved as an expansion.
  bases?: Game[];
}) {
  const create = useCreateManualGame();
  const [name, setName] = useState(initialName);
  const [minPlayers, setMinPlayers] = useState("2");
  const [maxPlayers, setMaxPlayers] = useState("4");
  const [minTime, setMinTime] = useState("");
  const [maxTime, setMaxTime] = useState("");
  const [weight, setWeight] = useState<number | null>(null);
  const [bggLink, setBggLink] = useState("");
  const [baseId, setBaseId] = useState("");

  return (
    <form
      className="grid grid-cols-2 gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        create.mutate(
          {
            name,
            minPlayers: Number(minPlayers),
            maxPlayers: Number(maxPlayers),
            minTime: toNumber(minTime),
            maxTime: toNumber(maxTime),
            weight,
            bggLink: bggLink.trim() || null,
            baseId: baseId ? Number(baseId) : null,
          },
          { onSuccess: ({ bggId }) => onSaved(bggId, name) },
        );
      }}
    >
      <div className="col-span-2 grid gap-1.5">
        <Label htmlFor="manual-name">Name</Label>
        <Input id="manual-name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} autoFocus />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="manual-min">Fewest players</Label>
        <Input id="manual-min" type="number" min={1} max={99} value={minPlayers} onChange={(e) => setMinPlayers(e.target.value)} required />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="manual-max">Most players</Label>
        <Input id="manual-max" type="number" min={1} max={99} value={maxPlayers} onChange={(e) => setMaxPlayers(e.target.value)} required />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="manual-min-time">Shortest game (min)</Label>
        <Input id="manual-min-time" type="number" min={1} max={1440} value={minTime} onChange={(e) => setMinTime(e.target.value)} placeholder="Optional" />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="manual-max-time">Longest game (min)</Label>
        <Input id="manual-max-time" type="number" min={1} max={1440} value={maxTime} onChange={(e) => setMaxTime(e.target.value)} placeholder="Optional" />
      </div>
      <fieldset className="col-span-2 grid gap-1.5">
        <legend className="mb-1.5 text-sm font-medium">How heavy is it?</legend>
        <div className="flex flex-wrap gap-1.5">
          {WEIGHTS.map((w) => (
            <button
              key={w.label}
              type="button"
              aria-pressed={weight === w.value}
              onClick={() => setWeight(weight === w.value ? null : w.value)}
              className={cn(
                "rounded-[var(--wobble-sm)] border-2 px-3 py-1 text-sm",
                weight === w.value ? "border-ink bg-primary text-primary-foreground shadow-[0_2px_0_var(--ink)]" : "border-ink/40 bg-card hover:bg-muted",
              )}
            >
              {w.label}
            </button>
          ))}
        </div>
      </fieldset>
      <div className="col-span-2 grid gap-1.5">
        <Label htmlFor="manual-link">BoardGameGeek link</Label>
        <Input
          id="manual-link"
          value={bggLink}
          onChange={(e) => setBggLink(e.target.value)}
          placeholder="Optional, e.g. boardgamegeek.com/boardgame/13/catan"
        />
        <p className="text-xs text-muted-foreground">With a link, the box image can be added later.</p>
      </div>
      {bases && bases.length > 0 && (
        <div className="col-span-2 grid gap-1.5">
          <Label htmlFor="manual-base">Expansion of</Label>
          <select
            id="manual-base"
            value={baseId}
            onChange={(e) => setBaseId(e.target.value)}
            className="h-10 rounded-[var(--wobble-sm)] border-2 border-input/80 bg-card px-2 text-sm"
          >
            <option value="">Nothing. It's a game of its own.</option>
            {bases.map((base) => (
              <option key={base.bggId} value={base.bggId}>
                {base.name}
              </option>
            ))}
          </select>
        </div>
      )}
      {create.isError && <p className="col-span-2 text-sm text-destructive">{create.error.message}</p>}
      <Button type="submit" className="col-span-2 rounded-full" disabled={create.isPending}>
        {submitLabel}
      </Button>
    </form>
  );
}
