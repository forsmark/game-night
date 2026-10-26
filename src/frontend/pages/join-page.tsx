import { useState, type ReactNode } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";
import { Clock, MapPin } from "lucide-react";
import { MeepleTrio } from "@/components/pieces/meeple-trio";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { formatNight } from "@/lib/format";
import { useInviteInfo, useJoin } from "@/lib/queries/invite";
import type { RsvpStatus } from "@/lib/queries/events";

const ANSWERS: { value: RsvpStatus; label: string }[] = [
  { value: "yes", label: "I'm in" },
  { value: "maybe", label: "Maybe" },
  { value: "no", label: "Can't make it" },
];

function Shell({ children }: { children: ReactNode }) {
  return (
    <main className="relative mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-6 py-12">
      <MeepleTrio />
      {children}
    </main>
  );
}

export default function JoinPage() {
  const { token } = useParams({ from: "/i/$token" });
  const navigate = useNavigate();
  const info = useInviteInfo(token);
  const join = useJoin(token);
  const [name, setName] = useState("");
  const [status, setStatus] = useState<RsvpStatus>("yes");

  if (info.isLoading) return null;
  if (info.isError || !info.data) {
    return (
      <Shell>
        <h1 className="font-display text-4xl">This link no longer works</h1>
        <p className="text-muted-foreground">Ask the host for the new group link.</p>
      </Shell>
    );
  }
  if (info.data.full) {
    return (
      <Shell>
        <h1 className="font-display text-4xl">The group is full</h1>
        <p className="text-muted-foreground">Every place is taken. Ask the host to make room.</p>
      </Shell>
    );
  }

  const night = info.data.night ? formatNight(info.data.night.startsAt) : null;

  return (
    <Shell>
      <div>
        <h1 className="font-display text-5xl leading-none">Join Game Night</h1>
        {night ? (
          <div className="paper mt-4 p-4">
            <p className="text-sm text-muted-foreground">Next night</p>
            <p className="font-display text-3xl">
              {night.weekday} {night.day}
            </p>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm">
              <span className="inline-flex items-center gap-1.5">
                <Clock className="size-4 text-muted-foreground" /> {night.time}
              </span>
              {info.data.night?.location && (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="size-4 text-muted-foreground" /> {info.data.night.location}
                </span>
              )}
            </div>
          </div>
        ) : (
          <p className="mt-3 text-muted-foreground">No night is planned yet. Join now and you'll see the next one here.</p>
        )}
      </div>

      <form
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          join.mutate({ name, status }, { onSuccess: () => navigate({ to: "/" }) });
        }}
      >
        <div className="grid gap-2">
          <Label htmlFor="join-name">Your name</Label>
          <Input
            id="join-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="given-name"
            maxLength={40}
            required
            className="h-11 bg-card text-base"
          />
          <p className="text-xs text-muted-foreground">The name your friends know you by. Everyone in the group sees it.</p>
        </div>

        {night && (
          <div role="radiogroup" aria-label="Are you coming?" className="paper-well grid grid-cols-3 gap-1 p-1">
            {ANSWERS.map((answer) => (
              <button
                key={answer.value}
                type="button"
                role="radio"
                aria-checked={status === answer.value}
                onClick={() => setStatus(answer.value)}
                className={cn(
                  "border-2 border-transparent px-2 py-3 text-sm font-semibold focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  status === answer.value ? "paper-piece bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {answer.label}
              </button>
            ))}
          </div>
        )}

        {join.isError && <p className="text-sm text-destructive">{join.error.message}</p>}

        <Button type="submit" size="lg" className="h-12 rounded-full text-base" disabled={join.isPending}>
          Join
        </Button>
      </form>
    </Shell>
  );
}
