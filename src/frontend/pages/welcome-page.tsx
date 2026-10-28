import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { MeepleTrio } from "@/components/pieces/meeple-trio";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useEnterCode } from "@/lib/queries/codes";

// What people see before they are signed in. Links don't open inside an iPhone home-screen app,
// so the code box is the way in there: the group code joins, a sign-in code signs you in.
export default function WelcomePage() {
  const invalid = new URLSearchParams(window.location.search).get("link") === "invalid";
  const navigate = useNavigate();
  const enter = useEnterCode();
  const [code, setCode] = useState("");

  return (
    <main className="relative mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-6 px-6 py-12 text-center">
      <MeepleTrio />
      <h1 className="font-display text-5xl">Game Night</h1>
      <p className="text-muted-foreground">
        {invalid
          ? "That link no longer works. Ask the host for a new one, or type a code below."
          : "Open the group link from the chat, or your personal link if you already joined. Got a code? Type it below."}
      </p>

      <form
        className="paper flex w-full flex-col gap-3 p-4 text-left"
        onSubmit={(e) => {
          e.preventDefault();
          enter.mutate(code, {
            onSuccess: (result) => {
              setCode("");
              if (result.kind === "group") navigate({ to: "/i/$token", params: { token: result.token } });
              else navigate({ to: "/" });
            },
          });
        }}
      >
        <Label htmlFor="welcome-code">Code</Label>
        <Input
          id="welcome-code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="ABC 234"
          autoComplete="one-time-code"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          maxLength={12}
          required
          aria-invalid={enter.isError || undefined}
          aria-describedby="welcome-code-help"
          className="h-12 text-center font-data text-2xl tracking-[0.2em] uppercase md:text-2xl"
        />
        <p id="welcome-code-help" className="text-xs text-muted-foreground">
          The group code from the host, or a sign-in code from &ldquo;Sign in on another device&rdquo; in the menu
          under your meeple.
        </p>
        {enter.isError && (
          <p role="alert" className="text-sm text-destructive">
            {enter.error.message}
          </p>
        )}
        <Button type="submit" size="lg" className="h-12 rounded-full text-base" disabled={enter.isPending}>
          Continue
        </Button>
      </form>
    </main>
  );
}
