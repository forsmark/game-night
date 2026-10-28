import { useMemo, useState } from "react";
import { InviteButton } from "@/components/invite-button";
import { AnimatePresence, motion } from "framer-motion";
import { Clock, MapPin } from "lucide-react";
import { Meeple } from "@/components/pieces/meeple";
import { Burst } from "@/components/pieces/burst";
import { cn } from "@/lib/utils";
import { countdown, formatNight } from "@/lib/format";
import { useAuth } from "@/lib/auth-context";
import {
  useEvent,
  useRemoveNomination,
  useRsvp,
  useVote,
  type EventDetail,
  type EventMember,
  type RsvpStatus,
} from "@/lib/queries/events";
import { TablePlanner } from "./table-planner";
import { GameCard } from "./game-card";
import { SuggestGameDialog } from "./suggest-game-dialog";

const RSVP_OPTIONS: { value: RsvpStatus; label: string }[] = [
  { value: "yes", label: "I'm in" },
  { value: "maybe", label: "Maybe" },
  { value: "no", label: "Can't make it" },
];

function RsvpPicker({ eventId, current }: { eventId: string; current: RsvpStatus | undefined }) {
  const rsvp = useRsvp(eventId);
  const shown = rsvp.isPending ? rsvp.variables : current;
  const [burst, setBurst] = useState(0);

  return (
    <div role="radiogroup" aria-label="Are you coming?" className="paper-well grid grid-cols-3 gap-1 p-1">
      {RSVP_OPTIONS.map((option) => (
        <button
          key={option.value}
          role="radio"
          aria-checked={shown === option.value}
          onClick={() => {
            if (option.value === "yes" && shown !== "yes") setBurst((b) => b + 1);
            rsvp.mutate(option.value);
          }}
          className={cn(
            "relative px-2 py-3 text-sm font-semibold focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:text-base",
            shown === option.value ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {shown === option.value && (
            <motion.span
              layoutId="rsvp-pill"
              className="paper-piece absolute inset-0 bg-primary"
              transition={{ type: "spring", duration: 0.4 }}
            />
          )}
          <span className="relative">{option.label}</span>
          {option.value === "yes" && burst > 0 && <Burst key={burst} />}
        </button>
      ))}
    </div>
  );
}

function WhoList({ label, people }: { label: string; people: EventMember[] }) {
  if (people.length === 0) return null;
  return (
    <div className="flex gap-3 text-sm">
      <span className="w-24 shrink-0 text-muted-foreground">{label}</span>
      <div className="flex flex-wrap gap-x-3 gap-y-1.5">
        {people.map((m) => (
          <span key={m.id} className="inline-flex items-center gap-1">
            <Meeple color={m.color} size={16} />
            {m.name}
          </span>
        ))}
      </div>
    </div>
  );
}

// A night lists only the people who answered it. The rest of the group isn't on this night.
function Who({ detail }: { detail: EventDetail }) {
  const byId = new Map(detail.members.map((m) => [m.id, m]));
  const group = (status: RsvpStatus) =>
    detail.rsvps.filter((r) => r.status === status).map((r) => byId.get(r.memberId)!).filter(Boolean);

  return (
    <div className="flex flex-col gap-2">
      <WhoList label="Coming" people={group("yes")} />
      <WhoList label="Maybe" people={group("maybe")} />
      <WhoList label="Not coming" people={group("no")} />
    </div>
  );
}

export function NightView({ eventId }: { eventId: string }) {
  const { member } = useAuth();
  const [includeMaybes, setIncludeMaybes] = useState(false);
  const { data: detail } = useEvent(eventId, includeMaybes);
  const vote = useVote(eventId, member!.id);
  const removeNomination = useRemoveNomination(eventId);

  const members = useMemo(() => new Map((detail?.members ?? []).map((m) => [m.id, m])), [detail?.members]);
  const nominated = useMemo(
    () => new Set((detail?.nominations ?? []).map((n) => n.game.bggId)),
    [detail?.nominations],
  );

  if (!detail || !member) return <div className="p-8 text-center text-muted-foreground">Loading…</div>;

  const night = formatNight(detail.event.startsAt);
  const myRsvp = detail.rsvps.find((r) => r.memberId === member.id)?.status;
  const attending = detail.rsvps.filter((r) => r.status === "yes" || (includeMaybes && r.status === "maybe")).length;

  return (
    <div className="flex flex-col gap-12">
      <header className="flex flex-col gap-6">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Game night {countdown(detail.event.startsAt)}</p>
          <h1 className="font-display leading-[0.9] tracking-tight">
            <span className="block text-3xl text-primary sm:text-4xl">{night.weekday}</span>
            <span className="block text-7xl sm:text-8xl">{night.day}</span>
          </h1>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-base">
            <span className="inline-flex items-center gap-1.5">
              <Clock className="size-4 text-muted-foreground" /> {night.time}
            </span>
            {detail.event.location && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="size-4 text-muted-foreground" /> {detail.event.location}
              </span>
            )}
          </div>
          {detail.event.note && <p className="mt-3 max-w-prose whitespace-pre-line text-muted-foreground">{detail.event.note}</p>}
          {member.role === "host" && <InviteButton night={detail.event} className="mt-4 rounded-full" />}
        </div>
        <RsvpPicker eventId={eventId} current={myRsvp} />
        <Who detail={detail} />
      </header>

      <TablePlanner detail={detail} includeMaybes={includeMaybes} onIncludeMaybesChange={setIncludeMaybes} />

      <section aria-labelledby="vote-heading" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="vote-heading" className="font-display text-3xl">
              What should we play?
            </h2>
            <p className="text-sm text-muted-foreground">
              {myRsvp
                ? "Mark every game you'd play. The tables follow the votes."
                : "Say whether you're coming above. Then you can suggest games and vote."}
            </p>
          </div>
          {myRsvp && <SuggestGameDialog eventId={eventId} nominated={nominated} />}
        </div>
        {detail.nominations.length === 0 ? (
          <p className="paper-hole p-8 text-center text-sm text-muted-foreground">
            No games suggested yet. Pick one from the shelf or bring your own.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            <AnimatePresence initial={false}>
              {detail.nominations.map((nomination) => (
                <GameCard
                  key={nomination.game.bggId}
                  nomination={nomination}
                  members={members}
                  attending={attending}
                  myId={member.id}
                  canVote={Boolean(myRsvp)}
                  canRemove={member.role === "host" || nomination.nominatedBy === member.id}
                  onVote={(approve) => vote.mutate({ bggId: nomination.game.bggId, approve })}
                  onRemove={() => removeNomination.mutate(nomination.game.bggId)}
                />
              ))}
            </AnimatePresence>
          </ul>
        )}
      </section>
    </div>
  );
}
