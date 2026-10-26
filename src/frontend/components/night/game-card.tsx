import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { Check, ExternalLink, X } from "lucide-react";
import { Meeple } from "@/components/pieces/meeple";
import { GameTile } from "@/components/game-tile";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { bggUrl, expansionName, formatBestWith, formatPlayersWithExpansions, formatTime } from "@/lib/format";
import { Complexity } from "@/components/complexity";
import type { EventMember, Nomination } from "@/lib/queries/events";

export function GameCard({
  nomination,
  members,
  attending,
  myId,
  canRemove,
  onVote,
  onRemove,
}: {
  nomination: Nomination;
  members: Map<string, EventMember>;
  attending: number;
  myId: string;
  canRemove: boolean;
  onVote: (approve: boolean) => void;
  onRemove: () => void;
}) {
  const { game, voters, broughtBy } = nomination;
  const voted = voters.includes(myId);
  const otherVotes = voters.filter((id) => id !== myId).length;
  // Taking a game off drops its votes too, so ask first when other people voted for it.
  const [armed, setArmed] = useState(false);
  const bringer = broughtBy ? members.get(broughtBy) : null;
  const fitsEveryone = attending >= 2 && game.minPlayers <= attending && attending <= game.maxWithExpansions;
  const meta = [formatPlayersWithExpansions(game), formatTime(game)].filter(Boolean).join(" · ");
  const best = formatBestWith(game.bestWith);

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0 }}
      className={cn(
        "paper flex gap-3 p-3 sm:gap-4 sm:p-4",
        voted && "[--paper-bg:color-mix(in_oklab,var(--vote)_16%,var(--card))]",
      )}
    >
      <GameTile game={game} size={72} />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-start justify-between gap-2">
          {bggUrl(game.bggId) ? (
            <a
              href={bggUrl(game.bggId)!}
              target="_blank"
              rel="noreferrer"
              className="group font-display text-xl leading-tight hover:underline focus-visible:underline focus-visible:outline-none"
            >
              {game.name}
              <ExternalLink aria-label="on BoardGameGeek" className="ml-1 inline size-3.5 align-baseline opacity-40 group-hover:opacity-80" />
            </a>
          ) : (
            <span className="font-display text-xl leading-tight">{game.name}</span>
          )}
          {canRemove &&
            (armed ? (
              <Button variant="destructive" size="xs" className="-mt-1 -mr-1 shrink-0 rounded-full" onBlur={() => setArmed(false)} onClick={onRemove} autoFocus>
                Take off? {otherVotes} {otherVotes === 1 ? "vote goes" : "votes go"} too
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Take ${game.name} off the vote`}
                title="Take it off the vote. It stays on the shelf."
                onClick={() => (otherVotes > 0 ? setArmed(true) : onRemove())}
                className="-mt-1 -mr-1 text-muted-foreground"
              >
                <X />
              </Button>
            ))}
        </div>
        <div className="font-data text-xs text-muted-foreground">{meta}</div>
        <Complexity weight={game.weight} />
        {game.expansions.length > 0 && (
          <div className="text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">+ Expansions:</span>{" "}
            {game.expansions.map((e) => expansionName(e.name, game.name)).join(", ")}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          {bringer ? (
            <span className="paper-chip">
              <Meeple color={bringer.color} size={12} /> {bringer.name} brings it
            </span>
          ) : (
            <span className="paper-chip">From the shelf</span>
          )}
          {best && <span className="paper-chip">{best}</span>}
          {fitsEveryone && (
            <span className="paper-chip border-primary bg-card font-semibold text-primary">Seats all {attending}</span>
          )}
        </div>
        <div className="mt-1 flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className="font-data text-sm font-medium tabular-nums">{voters.length}</span>
            <div className="flex -space-x-1" aria-label={`${voters.length} votes`}>
              <AnimatePresence initial={false}>
                {voters.map((id) => {
                  const member = members.get(id);
                  return member ? (
                    <motion.span
                      key={id}
                      initial={{ y: -28, rotate: -50, opacity: 0 }}
                      animate={{ y: 0, rotate: 0, opacity: 1 }}
                      exit={{ y: -16, rotate: 30, opacity: 0 }}
                      transition={{ type: "spring", stiffness: 420, damping: 14 }}
                    >
                      <Meeple color={member.color} size={18} title={member.name} />
                    </motion.span>
                  ) : null;
                })}
              </AnimatePresence>
            </div>
          </div>
          <Button
            size="sm"
            variant={voted ? "default" : "outline"}
            aria-pressed={voted}
            onClick={() => onVote(!voted)}
            className={cn("min-w-28 rounded-full", voted && "bg-vote text-vote-foreground hover:bg-vote/85")}
          >
            {voted ? (
              <>
                <Check /> I'd play this
              </>
            ) : (
              "I'd play this"
            )}
          </Button>
        </div>
      </div>
    </motion.li>
  );
}
