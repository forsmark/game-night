import { formatCode } from "./code-format";
import { formatNight } from "./format";

export type InviteNight = { startsAt: string; location: string | null };

// What the host sends to the group chat. The link is for people new to the app, and the code is for
// people who already have it on their home screen, where links don't open.
export function inviteMessage(link: string, code: string, night?: InviteNight | null) {
  let intro = "Join our game night group and say if you're coming:";
  if (night) {
    const { weekday, day, time } = formatNight(night.startsAt);
    const place = night.location ? ` at ${night.location}` : "";
    intro = `Game night ${weekday} ${day}, ${time}${place}. Say if you're coming:`;
  }
  return `${intro}\n${link}\n\nGot Game Night on your home screen? Type the code ${formatCode(code)} instead.`;
}
