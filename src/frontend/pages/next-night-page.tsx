import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { TableDisc } from "@/components/paper";
import { NightView } from "@/components/night/night-view";
import { useAuth } from "@/lib/auth-context";
import { useNextEventId } from "@/lib/queries/events";

export default function NextNightPage() {
  const { member } = useAuth();
  const next = useNextEventId();

  if (next.isLoading) return <div className="p-8 text-center text-muted-foreground">Loading…</div>;
  if (next.data?.id) return <NightView eventId={next.data.id} />;

  return (
    <div className="flex flex-col items-center gap-4 py-16 text-center">
      <TableDisc size={128} />
      <h1 className="font-display text-4xl">No game night planned yet</h1>
      {member?.role === "host" ? (
        <Button asChild className="rounded-full">
          <Link to="/host">Plan the next night</Link>
        </Button>
      ) : (
        <p className="text-muted-foreground">The host hasn't set a date. Check back soon.</p>
      )}
    </div>
  );
}
