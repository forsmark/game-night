import { describe, expect, it } from "vitest";
import { inviteMessage } from "../src/frontend/lib/invite-message";

// The host pastes this into the group chat, so it has to work for both kinds of player: people new to
// the app follow the link, people with the home-screen app type the code (links don't open there).
describe("invite message", () => {
  const link = "https://forsmark.github.io/game-night/#i/abc";

  it("names the night, the place, the link and the code", () => {
    const text = inviteMessage(link, "BTFY97", { startsAt: "2026-11-13T18:30", location: "Marc's" });
    expect(text).toBe(
      "Game night Friday 13 Nov, 18:30 at Marc's. Say if you're coming:\n" +
        `${link}\n\nGot Game Night on your home screen? Type the code BTF Y97 instead.`,
    );
  });

  it("leaves out the place when there isn't one", () => {
    expect(inviteMessage(link, "BTFY97", { startsAt: "2026-11-13T18:30", location: "" })).toMatch(
      /^Game night Friday 13 Nov, 18:30\. Say/,
    );
  });

  it("still invites people when no night is planned", () => {
    const text = inviteMessage(link, "BTFY97");
    expect(text).toMatch(/^Join our game night group/);
    expect(text).toContain(link);
    expect(text).toContain("BTF Y97");
  });
});
