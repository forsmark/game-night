# Glossary

The words of this domain. They are binding in code, specs, issues and commit
messages. One name per thing: when a word is here, use it and no synonym.

Each term is a line `**Term**:` followed by its definition. `spec-checks claims`
reads these lines to find the specs a change could contradict.

<!-- Add terms when a change introduces them. The domain-modeling skill helps. -->

**Group**:
The friends who play together. One app holds one group.

**Member**:
A person in the group, with a role of host or guest. The UI says "player". Code: `members`.

**Host**:
The member who runs the group: plans nights, keeps the shelf and manages members and links.

**Guest**:
Any member who is not the host.

**Night**:
One planned game night, with a start time, a place and a note. Code: `events`.

**Next night**:
The first night that has not started yet. Joining through the group link answers this night.

**Answer**:
A member's reply to a night: yes, maybe or no. Code: `rsvps`.

**Night's players**:
The members who answered a night, whatever the answer. Code: the night's `members`.

**Night limit**:
The most yes and maybe answers one night takes, from 2 to 50. The host counts toward it but is never refused.

**Full**:
A night whose yes and maybe answers have reached the night limit. It refuses new yes and maybe answers.

**Group link**:
The link that lets anyone join the group, meant for the group chat. Path `/i/<token>`.

**Group code**:
The group link in typeable form.

**Personal link**:
A member's own sign-in link, which works like a password. Path `/j/<token>`.

**Sign-in code**:
A one-time code that signs a member in, valid for 10 minutes.

**Game**:
A board game the app knows, identified by its BGG id. Code: `games`.

**Base game**:
A game that is not an expansion. Only base games can be suggested or voted on.

**Expansion**:
A game that adds to a base game. An owned expansion can raise its base game's player count.

**Manual game**:
A game typed in by hand without a BGG link. It has a negative id and is never sent to BGG.

**Shelf**:
The games and expansions the host owns.

**Catalogue**:
BGG's list of ranked games, imported from its ranks file. Search runs on it when there is no BGG token.

**Suggestion**:
A game a member puts up for a vote on one night. Code: `nominations`.

**Bringing**:
Whether the member who suggested a game brings their own copy. A game that nobody brings must be on the shelf.

**Vote**:
A member's approval or rejection of a suggestion on one night.

**Top pick**:
The one suggestion a member most wants to play on a night. It is also a vote, and each member has at most one per night.

**Plan**:
The planner's proposal for how to seat a night's players at tables, with options for one, two and three tables.

**Table**:
One game and the players seated at it, within a plan option.

**Option**:
One way to seat the players at a given number of tables. A plan holds up to three options per table count, best first.

**Happy**:
The number of players in an option who sit at a game they voted for. Options rank by it first.
