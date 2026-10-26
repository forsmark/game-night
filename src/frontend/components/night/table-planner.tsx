import { useMemo, useState, type ReactNode } from "react";
import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import { Star } from "lucide-react";
import { Meeple } from "@/components/pieces/meeple";
import { GameTile } from "@/components/game-tile";
import { TableDisc } from "@/components/paper";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { formatPlayersWithExpansions, formatTime } from "@/lib/format";
import type { EventDetail, EventMember, Nomination, PlanTable } from "@/lib/queries/events";

type Layout = "one" | "two";

function Seat({
  member,
  x,
  y,
  voted,
}: {
  member: EventMember;
  x: number;
  y: number;
  voted: boolean;
}) {
  // Each meeple fidgets on its own schedule, so the table never moves in sync.
  const idle = useMemo(() => ({ delay: Math.random() * 5, repeatDelay: 4 + Math.random() * 7 }), []);

  return (
    <motion.div
      layoutId={`seat-${member.id}`}
      transition={{ type: "spring", stiffness: 260, damping: 26 }}
      className="absolute flex w-16 -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-0.5"
      style={{ left: x, top: y }}
    >
      <motion.div
        animate={{ y: [0, -7, 0], rotate: [0, -10, 10, 0] }}
        transition={{ duration: 0.8, repeat: Infinity, ...idle }}
        whileHover={{ y: -14, rotate: 20, scale: 1.15, transition: { type: "spring", stiffness: 500, damping: 10 } }}
      >
        <Meeple
          color={member.color}
          size={30}
          className={cn(!voted && "opacity-45 saturate-50")}
          title={voted ? `${member.name} voted for this` : `${member.name} didn't vote for this`}
        />
      </motion.div>
      <span
        className={cn(
          "max-w-full truncate rounded-[var(--wobble-sm)] border-[1.5px] border-ink bg-card px-1.5 text-[11px] leading-4 font-semibold",
          !voted && "text-muted-foreground",
        )}
      >
        {member.name}
      </span>
    </motion.div>
  );
}

function Table({
  table,
  nomination,
  members,
  size,
}: {
  table: PlanTable;
  nomination: Nomination;
  members: Map<string, EventMember>;
  size: number;
}) {
  // Room around the felt for the name labels.
  const pad = 34;
  const box = size + pad * 2;
  const centre = box / 2;
  const radius = size / 2 - 2;
  const voters = new Set(nomination.voters);
  const { game } = nomination;
  const time = formatTime(game);

  return (
    <motion.figure
      layout
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      className="flex flex-col items-center"
    >
      <div className="relative" style={{ width: box, height: box }}>
        <div className="absolute" style={{ left: pad, top: pad }}>
          <TableDisc size={size} />
        </div>
        <div className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: centre, top: centre }}>
          <motion.div key={game.bggId} initial={{ rotate: -8, scale: 0.8 }} animate={{ rotate: -4, scale: 1 }}>
            <GameTile game={game} size={Math.round(size * 0.3)} className="shadow-lg" />
          </motion.div>
        </div>
        {table.players.map((id, i) => {
          const member = members.get(id);
          if (!member) return null;
          const angle = (2 * Math.PI * i) / table.players.length - Math.PI / 2;
          return (
            <Seat
              key={id}
              member={member}
              voted={voters.has(id)}
              x={centre + radius * Math.cos(angle)}
              y={centre + radius * Math.sin(angle)}
            />
          );
        })}
      </div>
      <figcaption className="-mt-2 max-w-64 text-center">
        <div className="font-display text-xl leading-tight">{game.name}</div>
        <div className="font-data text-xs text-muted-foreground">
          {table.players.length} seated · {formatPlayersWithExpansions(game)}
          {time && ` · ${time}`}
        </div>
      </figcaption>
    </motion.figure>
  );
}

function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="paper-well inline-flex p-1">
      {options.map((option) => (
        <button
          key={option.value}
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "relative px-3 py-1 text-sm font-semibold focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
            value === option.value ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {value === option.value && (
            <motion.span
              layoutId={`segment-${label}`}
              className="paper-piece absolute inset-0 bg-primary"
              transition={{ type: "spring", duration: 0.4 }}
            />
          )}
          <span className="relative flex items-center gap-1">{option.label}</span>
        </button>
      ))}
    </div>
  );
}

function EmptyTables({ detail, attending }: { detail: EventDetail; attending: number }) {
  let message = `None of the suggested games seat ${attending} players, at one table or split in two. Suggest a game for more players.`;
  if (attending < 2) message = "The tables appear when two or more people say they're in.";
  else if (detail.nominations.length === 0) message = "Suggest a game below to see who sits where.";

  return (
    <div className="paper-hole flex flex-col items-center gap-4 px-6 py-10 text-center">
      <TableDisc size={112} className="opacity-60" />
      <p className="max-w-sm text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

export function TablePlanner({
  detail,
  includeMaybes,
  onIncludeMaybesChange,
}: {
  detail: EventDetail;
  includeMaybes: boolean;
  onIncludeMaybesChange: (value: boolean) => void;
}) {
  const { plan } = detail;
  const [chosenLayout, setChosenLayout] = useState<Layout | null>(null);
  // A picked plan belongs to one layout. It resets when the layout changes.
  const [chosenPlan, setChosenPlan] = useState<{ layout: Layout; index: number } | null>(null);

  const members = useMemo(() => new Map(detail.members.map((m) => [m.id, m])), [detail.members]);
  const nominations = useMemo(
    () => new Map(detail.nominations.map((n) => [n.game.bggId, n])),
    [detail.nominations],
  );

  const maybes = detail.rsvps.filter((r) => r.status === "maybe").length;
  const attending = detail.rsvps.filter((r) => r.status === "yes" || (includeMaybes && r.status === "maybe")).length;

  // Follow the recommendation until the viewer picks a layout, and fall back
  // to it if the picked layout stops being possible.
  const recommended = plan.recommended === "none" ? null : plan.recommended;
  const available: Layout[] = [];
  if (plan.oneTable.length) available.push("one");
  if (plan.twoTables.length) available.push("two");
  const layout = chosenLayout && available.includes(chosenLayout) ? chosenLayout : recommended;
  const options = layout === "two" ? plan.twoTables : plan.oneTable;
  const optionIndex = chosenPlan?.layout === layout ? Math.min(chosenPlan.index, options.length - 1) : 0;
  const option = options[optionIndex];

  return (
    <section aria-labelledby="tables-heading" className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="tables-heading" className="font-display text-3xl">
            The tables
          </h2>
          <p className="text-sm text-muted-foreground">
            {option
              ? `${option.happy} of ${attending} sit at a game they voted for.`
              : `${attending} ${attending === 1 ? "player" : "players"} so far.`}
          </p>
        </div>
        {maybes > 0 && (
          <div className="flex items-center gap-2">
            <Switch id="count-maybes" checked={includeMaybes} onCheckedChange={onIncludeMaybesChange} />
            <Label htmlFor="count-maybes" className="text-sm font-normal">
              Count {maybes === 1 ? "the maybe" : `the ${maybes} maybes`}
            </Label>
          </div>
        )}
      </div>

      {layout && (
        <div className="flex flex-wrap items-center gap-2">
          {available.length > 1 && (
            <Segmented<Layout>
              label="Tables"
              value={layout}
              onChange={setChosenLayout}
              options={available.map((value) => ({
                value,
                label: (
                  <>
                    {value === "one" ? "One table" : "Two tables"}
                    {value === recommended && <Star aria-label="recommended" className="size-3 fill-current" />}
                  </>
                ),
              }))}
            />
          )}
          {options.length > 1 && (
            <Segmented<number>
              label="Plan"
              value={optionIndex}
              onChange={(index) => layout && setChosenPlan({ layout, index })}
              options={options.map((_, i) => ({ value: i, label: `Plan ${i + 1}` }))}
            />
          )}
        </div>
      )}

      {option ? (
        <LayoutGroup id="tables">
          <div className="flex flex-col items-center justify-center gap-2 sm:flex-row sm:items-start sm:gap-6">
            <AnimatePresence mode="popLayout" initial={false}>
              {option.tables.map((table, i) => {
                const nomination = nominations.get(table.bggId);
                if (!nomination) return null;
                return (
                  <Table
                    key={`table-${i}`}
                    table={table}
                    nomination={nomination}
                    members={members}
                    size={option.tables.length > 1 ? 200 : 236}
                  />
                );
              })}
            </AnimatePresence>
          </div>
          <p className="text-center text-xs text-muted-foreground">
            Faded meeples sit at a game they didn't vote for. Seats change as people vote.
          </p>
        </LayoutGroup>
      ) : (
        <EmptyTables detail={detail} attending={attending} />
      )}
    </section>
  );
}
