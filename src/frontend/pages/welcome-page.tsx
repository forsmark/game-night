import { MeepleTrio } from "@/components/pieces/meeple-trio";

export default function WelcomePage() {
  const invalid = new URLSearchParams(window.location.search).get("link") === "invalid";

  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center gap-6 px-6 text-center">
      <MeepleTrio />
      <h1 className="font-display text-5xl">Game Night</h1>
      <p className="max-w-sm text-muted-foreground">
        {invalid
          ? "That link no longer works. Ask the host for a new one."
          : "Open the group link from the chat to join, or your personal link if you already joined."}
      </p>
    </main>
  );
}
