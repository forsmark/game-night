import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Copy, KeyRound, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { Popover } from "radix-ui";
import { toast } from "sonner";
import { Meeple } from "@/components/pieces/meeple";
import { BigCode, SignInCodeDialog } from "@/components/sign-in-code";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { InviteButton } from "@/components/invite-button";
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
import { useBggStatus, useImportCatalogue } from "@/lib/queries/games";
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

// iOS Safari draws date and time fields centred, ignores their width and lets an empty one
// collapse. Left-align the value and give it a line of height so they line up with the other fields.
const IOS_DATE = "appearance-none text-left [&::-webkit-date-and-time-value]:min-h-[1.5em] [&::-webkit-date-and-time-value]:text-left";

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
        <Input id="night-date" type="date" className={IOS_DATE} value={date} onChange={(e) => setDate(e.target.value)} required />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="night-time">Start time</Label>
        <Input id="night-time" type="time" className={IOS_DATE} value={time} onChange={(e) => setTime(e.target.value)} required />
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
  const { link, code, used, night } = invite.data;
  const shownLimit = limit ?? invite.data.limit;
  const copy = () => navigator.clipboard.writeText(link).then(() => toast.success("Copied the group link"));
  const copyCode = () => navigator.clipboard.writeText(code).then(() => toast.success("Copied the group code"));

  return (
    <section className="paper flex flex-col gap-3 p-4">
      <h2 className="font-display text-2xl">Group link</h2>
      <p className="text-sm text-muted-foreground">
        Share this one link in the group chat. New players enter their name and answer for the next night.
      </p>
      <InviteButton className="self-start rounded-full" />
      <div className="flex gap-2">
        {/* text-base on phones: iOS zooms in on any input under 16px. */}
        <Input readOnly value={link} aria-label="Group link" className="font-data md:text-xs" onFocus={(e) => e.target.select()} />
        <Button variant="outline" className="rounded-full" onClick={copy}>
          <Copy /> Copy
        </Button>
      </div>
      <div className="grid gap-2">
        <h3 className="font-semibold">Group code</h3>
        <p className="text-sm text-muted-foreground">
          The same as the link, for typing in. Links don't open in the app on an iPhone home screen, so people type this
          into the code box on the welcome page there.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <BigCode code={code} label="Group code" />
          </div>
          <Button variant="outline" className="self-end rounded-full sm:self-auto" onClick={copyCode}>
            <Copy /> Copy code
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <form
          className="flex flex-wrap items-center gap-2 text-sm"
          onSubmit={(e) => {
            e.preventDefault();
            setLimit.mutate(shownLimit, { onSuccess: () => (setLimitValue(null), toast.success("Limit saved")) });
          }}
        >
          {night && (
            <>
              <span className="font-data">{used}</span>
              <span className="text-muted-foreground">of</span>
            </>
          )}
          {!night && <span className="text-muted-foreground">Up to</span>}
          <Input
            type="number"
            min={2}
            max={50}
            value={shownLimit}
            onChange={(e) => setLimitValue(Number(e.target.value))}
            aria-label="Most players per night"
            className="h-8 w-16 font-data"
          />
          <span className="text-muted-foreground">{night ? "places taken on the next night" : "people per night"}</span>
          {limit !== null && limit !== invite.data.limit && (
            <Button type="submit" size="sm" variant="outline" disabled={setLimit.isPending}>
              Save
            </Button>
          )}
        </form>
        <Button
          variant="ghost"
          size="sm"
          title="The old link and code stop working. Players who already joined stay signed in."
          onClick={() =>
            newLink.mutate(undefined, {
              onSuccess: () => toast.success("New group link and code made. The old ones no longer work."),
            })
          }
        >
          <RefreshCw /> New link and code
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        The limit is per night. It counts everyone who says yes or maybe. You can always say yes yourself.
      </p>
      {night && used >= invite.data.limit && (
        <p className="text-sm text-destructive">
          The next night is full. Nobody else can say yes or maybe until you raise the limit or someone says they can't make it.
        </p>
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
  const [codeFor, setCodeFor] = useState<Member | null>(null);

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
        <div className="flex flex-col gap-2 sm:flex-row">
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
                title="A one-time code that signs them in, for the app on their home screen"
                onClick={() => setCodeFor(member)}
              >
                <KeyRound /> <span className="sr-only sm:not-sr-only">Sign-in code</span>
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
      <SignInCodeDialog
        member={codeFor ?? undefined}
        open={codeFor !== null}
        onOpenChange={(open) => !open && setCodeFor(null)}
      />
    </div>
  );
}

// BGG's ranks file, the list of games that search runs on. Details and box images come from
// BGG when someone picks a game, so the file only needs names and ids.
function GamesTab() {
  const status = useBggStatus();
  const importCatalogue = useImportCatalogue();
  const [file, setFile] = useState<File | null>(null);
  const info = status.data?.catalogue;

  return (
    <section className="paper flex flex-col gap-3 p-4">
      <h2 className="font-display text-2xl">BoardGameGeek game list</h2>
      <p className="text-sm text-muted-foreground">
        Search for games runs on BGG's list of every game. Load it once, and again now and then to pick up new games.
      </p>
      <p className="text-sm">
        {info?.games
          ? `${info.games.toLocaleString()} games, loaded ${new Date(info.importedAt!).toLocaleDateString()}.`
          : "Not loaded yet. Search only finds games already added here."}
      </p>
      <form
        className="flex flex-col gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          const form = e.currentTarget;
          if (!file) return;
          importCatalogue.mutate(await file.text(), {
            onSuccess: ({ games }) => {
              toast.success(`Loaded ${games.toLocaleString()} games`);
              setFile(null);
              form.reset();
            },
          });
        }}
      >
        <ol className="list-decimal pl-5 text-sm text-muted-foreground">
          <li>Sign in to BoardGameGeek and open boardgamegeek.com/data_dumps/bg_ranks.</li>
          <li>Download the file and unzip it.</li>
          <li>Choose boardgames_ranks.csv here.</li>
        </ol>
        <Label htmlFor="ranks-file">Ranks file</Label>
        <Input id="ranks-file" type="file" accept=".csv,text/csv" onChange={(e) => setFile(e.target.files?.[0] ?? null)} required />
        <Button type="submit" disabled={!file || importCatalogue.isPending} className="self-start rounded-full">
          {importCatalogue.isPending ? (
            <>
              <Loader2 className="animate-spin" /> Loading the list
            </>
          ) : (
            "Load game list"
          )}
        </Button>
      </form>
    </section>
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
          <TabsTrigger value="games">Games</TabsTrigger>
        </TabsList>
        <TabsContent value="nights" className="pt-4">
          <NightsTab />
        </TabsContent>
        <TabsContent value="players" className="pt-4">
          <PlayersTab />
        </TabsContent>
        <TabsContent value="games" className="pt-4">
          <GamesTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
