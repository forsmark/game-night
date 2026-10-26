import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Copy, RefreshCw, Trash2 } from "lucide-react";
import { Popover } from "radix-ui";
import { toast } from "sonner";
import { Meeple } from "@/components/pieces/meeple";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { formatNight } from "@/lib/format";
import { useAuth } from "@/lib/auth-context";
import {
  useCreateEvent,
  useDeleteEvent,
  useEvent,
  useEvents,
  useUpdateEvent,
  type EventInput,
} from "@/lib/queries/events";
import {
  useAddMember,
  useMembers,
  useNewLink,
  useRemoveMember,
  useUpdateMember,
  type Member,
} from "@/lib/queries/members";
import { useInviteSettings, useNewInviteLink, useSetInviteLimit } from "@/lib/queries/invite";
import { MEEPLE_COLORS } from "../../shared/meeples";

// A destructive button that asks "Sure?" on the first press instead of opening a browser dialog.
function ConfirmButton({ label, onConfirm }: { label: string; onConfirm: () => void }) {
  const [armed, setArmed] = useState(false);
  return (
    <Button
      variant={armed ? "destructive" : "ghost"}
      size="sm"
      aria-label={armed ? `Confirm: ${label}` : label}
      onBlur={() => setArmed(false)}
      onClick={() => (armed ? onConfirm() : setArmed(true))}
      className={cn(!armed && "text-muted-foreground")}
    >
      <Trash2 /> {armed ? "Sure?" : <span className="sr-only sm:not-sr-only">{label}</span>}
    </Button>
  );
}

async function copyLink(member: Pick<Member, "name" | "link">) {
  await navigator.clipboard.writeText(member.link);
  toast.success(`Copied ${member.name}'s link`);
}

const EMPTY_NIGHT: EventInput = { startsAt: "", location: "", note: "", splitAt: 7 };

function NightForm({ editing, onDone }: { editing: (EventInput & { id: string }) | null; onDone: () => void }) {
  const events = useEvents();
  const create = useCreateEvent();
  const update = useUpdateEvent();
  // New nights start at the last night's place and time.
  const last = events.data?.[0];
  const initial = editing ?? { ...EMPTY_NIGHT, location: last?.location ?? "" };
  const [date, setDate] = useState(initial.startsAt.split("T")[0] ?? "");
  const [time, setTime] = useState(initial.startsAt.split("T")[1] ?? last?.startsAt.split("T")[1] ?? "18:30");
  const [location, setLocation] = useState(initial.location);
  const [note, setNote] = useState(initial.note);
  const [splitAt, setSplitAt] = useState(initial.splitAt);

  return (
    <form
      className="paper grid gap-4 p-4 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        const input = { startsAt: `${date}T${time}`, location, note, splitAt };
        if (editing) {
          update.mutate({ id: editing.id, ...input }, { onSuccess: () => (toast.success("Changes saved"), onDone()) });
        } else {
          create.mutate(input, { onSuccess: () => (toast.success("Night planned"), onDone()) });
        }
      }}
    >
      <h2 className="font-display text-2xl sm:col-span-2">{editing ? "Change the night" : "Plan a night"}</h2>
      <div className="grid gap-2">
        <Label htmlFor="night-date">Date</Label>
        <Input id="night-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="night-time">Start time</Label>
        <Input id="night-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} required />
      </div>
      <div className="grid gap-2 sm:col-span-2">
        <Label htmlFor="night-location">Place</Label>
        <Input id="night-location" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Your place" />
      </div>
      <div className="grid gap-2 sm:col-span-2">
        <Label htmlFor="night-note">Note to everyone</Label>
        <Textarea id="night-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Food, door code, what to bring" />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="night-split">Two tables from</Label>
        <div className="flex items-center gap-2">
          <Input
            id="night-split"
            type="number"
            min={4}
            max={20}
            value={splitAt}
            onChange={(e) => setSplitAt(Number(e.target.value))}
            className="w-20 font-data"
          />
          <span className="text-sm text-muted-foreground">players</span>
        </div>
      </div>
      <div className="flex items-end justify-end gap-2">
        {editing && (
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        )}
        <Button type="submit" className="rounded-full" disabled={create.isPending || update.isPending}>
          {editing ? "Save changes" : "Plan night"}
        </Button>
      </div>
    </form>
  );
}

function NightsTab() {
  const events = useEvents();
  const remove = useDeleteEvent();
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = useEvent(editingId ?? "", false).data?.event ?? null;

  return (
    <div className="flex flex-col gap-6">
      {/* key remounts the form so its fields load the night being edited. */}
      <NightForm key={editing?.id ?? "new"} editing={editingId ? editing : null} onDone={() => setEditingId(null)} />
      <ul className="paper flex flex-col divide-y divide-dashed divide-ink/25">
        {(events.data ?? []).map((event) => {
          const night = formatNight(event.startsAt);
          return (
            <li key={event.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 p-3">
              <Link to="/nights/$id" params={{ id: event.id }} className="min-w-0 flex-1 hover:underline">
                <span className="font-medium">{night.full}</span>
                <span className="text-muted-foreground"> · {night.time}</span>
                {event.location && <span className="block truncate text-sm text-muted-foreground">{event.location}</span>}
              </Link>
              <span className="font-data text-sm text-muted-foreground">{event.going} going</span>
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" onClick={() => setEditingId(event.id)}>
                  Change
                </Button>
                <ConfirmButton label="Delete" onConfirm={() => remove.mutate(event.id)} />
              </div>
            </li>
          );
        })}
        {events.isSuccess && events.data.length === 0 && (
          <li className="p-6 text-center text-sm text-muted-foreground">No nights yet. Plan the first one above.</li>
        )}
      </ul>
    </div>
  );
}

function ColorPicker({ member }: { member: Member }) {
  const [open, setOpen] = useState(false);
  const update = useUpdateMember();

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        aria-label={`Change ${member.name}'s colour`}
        className="rounded-full p-1 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <Meeple color={member.color} size={28} />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={4}
          className="paper z-50 grid w-48 grid-cols-6 gap-1 p-2"
        >
          {MEEPLE_COLORS.map((color) => (
            <button
              key={color}
              aria-label={color}
              aria-pressed={member.color === color}
              onClick={() => update.mutate({ id: member.id, color }, { onSuccess: () => setOpen(false) })}
              className={cn("rounded-md p-0.5 hover:bg-muted", member.color === color && "bg-muted ring-2 ring-ring")}
            >
              <Meeple color={color} size={22} />
            </button>
          ))}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function GroupLinkCard() {
  const invite = useInviteSettings();
  const setLimit = useSetInviteLimit();
  const newLink = useNewInviteLink();
  const [limit, setLimitValue] = useState<number | null>(null);

  if (!invite.data) return null;
  const { link, used } = invite.data;
  const shownLimit = limit ?? invite.data.limit;
  const copy = () => navigator.clipboard.writeText(link).then(() => toast.success("Copied the group link"));

  return (
    <section className="paper flex flex-col gap-3 p-4">
      <h2 className="font-display text-2xl">Group link</h2>
      <p className="text-sm text-muted-foreground">
        Share this one link in the group chat. New players enter their name and answer for the next night.
      </p>
      <div className="flex gap-2">
        <Input readOnly value={link} aria-label="Group link" className="font-data text-xs" onFocus={(e) => e.target.select()} />
        <Button className="rounded-full" onClick={copy}>
          <Copy /> Copy
        </Button>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <form
          className="flex items-center gap-2 text-sm"
          onSubmit={(e) => {
            e.preventDefault();
            setLimit.mutate(shownLimit, { onSuccess: () => (setLimitValue(null), toast.success("Limit saved")) });
          }}
        >
          <span className="font-data">{used}</span>
          <span className="text-muted-foreground">of</span>
          <Input
            type="number"
            min={2}
            max={50}
            value={shownLimit}
            onChange={(e) => setLimitValue(Number(e.target.value))}
            aria-label="Most players in the group"
            className="h-8 w-16 font-data"
          />
          <span className="text-muted-foreground">places taken</span>
          {limit !== null && limit !== invite.data.limit && (
            <Button type="submit" size="sm" variant="outline" disabled={setLimit.isPending}>
              Save
            </Button>
          )}
        </form>
        <Button
          variant="ghost"
          size="sm"
          title="The old link stops working. Players who already joined stay signed in."
          onClick={() => newLink.mutate(undefined, { onSuccess: () => toast.success("New group link made. The old one no longer works.") })}
        >
          <RefreshCw /> New link
        </Button>
      </div>
      {used >= invite.data.limit && (
        <p className="text-sm text-destructive">The group is full. Nobody new can join until you raise the limit or remove a player.</p>
      )}
    </section>
  );
}

function PlayersTab() {
  const { member: me } = useAuth();
  const members = useMembers();
  const add = useAddMember();
  const newLink = useNewLink();
  const remove = useRemoveMember();
  const [name, setName] = useState("");

  return (
    <div className="flex flex-col gap-6">
      <GroupLinkCard />
      <form
        className="paper flex flex-col gap-2 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          add.mutate(name, {
            onSuccess: (member) => {
              setName("");
              copyLink(member).catch(() => toast.success(`Added ${member.name}`));
            },
          });
        }}
      >
        <h2 className="font-display text-2xl">Add a player yourself</h2>
        <p className="text-sm text-muted-foreground">For someone who isn't in the group chat. Send them the personal link.</p>
        <div className="flex gap-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" aria-label="Name" required maxLength={40} />
          <Button type="submit" className="rounded-full" disabled={add.isPending}>
            Add and copy link
          </Button>
        </div>
      </form>

      <ul className="paper flex flex-col divide-y divide-dashed divide-ink/25">
        {(members.data ?? []).map((member) => (
          <li key={member.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 p-3">
            <ColorPicker member={member} />
            <span className="min-w-0 flex-1 truncate font-medium">
              {member.name}
              {member.role === "host" && <span className="ml-2 text-xs text-muted-foreground">host</span>}
            </span>
            <div className="flex gap-1">
              <Button variant="ghost" size="sm" onClick={() => copyLink(member)}>
                <Copy /> <span className="sr-only sm:not-sr-only">Copy link</span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                title="Makes the old link stop working and signs them out"
                onClick={() =>
                  newLink.mutate(member.id, { onSuccess: (updated) => copyLink(updated).catch(() => undefined) })
                }
              >
                <RefreshCw /> <span className="sr-only sm:not-sr-only">New link</span>
              </Button>
              {member.id !== me?.id && <ConfirmButton label="Remove" onConfirm={() => remove.mutate(member.id)} />}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function HostPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-5xl">Host</h1>
      <Tabs defaultValue="nights">
        <TabsList>
          <TabsTrigger value="nights">Nights</TabsTrigger>
          <TabsTrigger value="players">Players</TabsTrigger>
        </TabsList>
        <TabsContent value="nights" className="pt-4">
          <NightsTab />
        </TabsContent>
        <TabsContent value="players" className="pt-4">
          <PlayersTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
