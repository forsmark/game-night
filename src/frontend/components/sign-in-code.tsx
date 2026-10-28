import { useEffect, useState, type ReactNode } from "react";
import { Copy, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useMakeSignInCode } from "@/lib/queries/codes";

import { formatCode } from "@/lib/code-format";

export function BigCode({ code, label }: { code: string; label: string }) {
  return (
    <p
      aria-label={`${label}: ${code.split("").join(" ")}`}
      className="paper-well py-4 text-center font-data text-4xl font-semibold tracking-[0.2em] tabular-nums sm:text-5xl"
    >
      {formatCode(code)}
    </p>
  );
}

function useSecondsLeft(expiresAt: string | undefined) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!expiresAt) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [expiresAt]);
  return expiresAt ? Math.max(0, Math.round((new Date(expiresAt).getTime() - now) / 1000)) : 0;
}

// Opens a dialog with a fresh one-time code. Without `member`, the code is for the signed-in person.
// The host passes a player to make a code for them.
export function SignInCodeDialog({
  member,
  open,
  onOpenChange,
}: {
  member?: { id: string; name: string };
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const make = useMakeSignInCode(member?.id);
  const secondsLeft = useSecondsLeft(make.data?.expiresAt);
  const expired = make.isSuccess && secondsLeft === 0;

  // A new code every time the dialog opens. The server drops the previous unused one.
  const { mutate, reset } = make;
  useEffect(() => {
    if (open) mutate();
    else reset();
  }, [open, mutate, reset]);

  const copy = () =>
    make.data && navigator.clipboard.writeText(make.data.code).then(() => toast.success("Copied the code"));
  const minutes = Math.floor(secondsLeft / 60);
  const seconds = String(secondsLeft % 60).padStart(2, "0");

  let body: ReactNode = <p className="py-6 text-center text-sm text-muted-foreground">Making a code…</p>;
  if (make.isError) body = <p className="text-sm text-destructive">{make.error.message}</p>;
  else if (make.data && !expired) {
    body = (
      <>
        <BigCode code={make.data.code} label="Sign-in code" />
        <p className="text-center text-sm text-muted-foreground">
          Works once, for <span className="font-data text-foreground">{minutes}:{seconds}</span> more.
        </p>
      </>
    );
  } else if (expired) {
    body = <p className="py-6 text-center text-sm text-muted-foreground">This code has expired. Make a new one.</p>;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">
            {member ? `Sign-in code for ${member.name}` : "Sign in on another device"}
          </DialogTitle>
          <DialogDescription>
            {member
              ? `Read it out to ${member.name}. On the welcome page, they type it into the code box and are signed in as themselves.`
              : "On the other device, open Game Night and type this code into the code box. It signs you in as yourself. Keep it to yourself."}
          </DialogDescription>
        </DialogHeader>
        {body}
        <div className="flex flex-wrap justify-end gap-2">
          {expired ? (
            <Button className="rounded-full" onClick={() => make.mutate()} disabled={make.isPending}>
              <RefreshCw /> Make a new code
            </Button>
          ) : (
            <Button className="rounded-full" onClick={copy} disabled={!make.data}>
              <Copy /> Copy code
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
