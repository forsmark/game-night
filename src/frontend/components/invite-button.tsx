import { Share2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { inviteMessage, type InviteNight } from "@/lib/invite-message";
import { useInviteSettings } from "@/lib/queries/invite";

// For the host: opens the phone's share sheet with the group link and code, ready for the group chat.
// Where there's no share sheet (most desktops), the message is copied instead.
export function InviteButton({ night, className }: { night?: InviteNight | null; className?: string }) {
  const invite = useInviteSettings();
  if (!invite.data) return null;
  const text = inviteMessage(invite.data.link, invite.data.code, night);

  async function share() {
    if (navigator.share) {
      try {
        await navigator.share({ text });
        return;
      } catch (error) {
        // Closing the share sheet isn't an error worth showing.
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }
    await navigator.clipboard.writeText(text);
    toast.success("Copied the invite. Paste it in the group chat.");
  }

  return (
    <Button className={className ?? "rounded-full"} onClick={() => share().catch(() => toast.error("Couldn't share the invite"))}>
      <Share2 /> Invite
    </Button>
  );
}
