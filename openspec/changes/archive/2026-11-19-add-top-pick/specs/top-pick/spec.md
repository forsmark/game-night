# Spec Delta

## Purpose

Lets each member name the one suggested game they most want to play on a night, so the planner can seat as many members as possible at that game.

## ADDED Requirements

### Requirement: A member can make a suggestion their top pick
A member who has answered a night SHALL be able to make one of that night's suggestions their top pick. A member who has not answered the night SHALL be refused with `ANSWER_FIRST`. A game that is not suggested on the night SHALL be refused.

#### Scenario: A member picks a suggestion
- **WHEN** a member who answered the night makes a suggested game their top pick
- **THEN** the night's detail lists that member among the game's top pickers

#### Scenario: A member who hasn't answered
- **WHEN** a member who has not answered the night tries to make a suggested game their top pick
- **THEN** the request is refused with 403 and code `ANSWER_FIRST`, and no top pick is stored

#### Scenario: A game that isn't suggested
- **WHEN** a member tries to make a game their top pick that is not suggested on the night
- **THEN** the request is refused with 400, and no top pick is stored

### Requirement: A top pick is also a vote
Making a game your top pick SHALL also record your vote for that game.

#### Scenario: Top pick without an earlier vote
- **GIVEN** a member has not voted for a suggested game
- **WHEN** the member makes it their top pick
- **THEN** the night's detail lists the member among the game's voters and among its top pickers

### Requirement: One top pick per member per night
A member SHALL have at most one top pick on a night. Making a second game the top pick SHALL move the top pick to it and keep the vote for the first game.

#### Scenario: Picking another game moves the top pick
- **GIVEN** a member's top pick is game A
- **WHEN** the member makes game B their top pick
- **THEN** game B lists the member as a top picker, game A does not, and game A still lists the member as a voter

#### Scenario: Top picks on different nights
- **GIVEN** a member's top pick on one night is game A
- **WHEN** the member makes game B their top pick on another night
- **THEN** each night keeps its own top pick

### Requirement: Withdrawing the vote clears the top pick
When a member withdraws their vote for their top pick, the top pick SHALL be cleared. When the game is taken off the vote, every top pick on it SHALL be cleared.

#### Scenario: The member withdraws the vote
- **GIVEN** a member's top pick is game A
- **WHEN** the member withdraws their vote for game A
- **THEN** the member has no top pick on the night

#### Scenario: The game is taken off the vote
- **GIVEN** two members made game A their top pick
- **WHEN** game A is taken off the vote
- **THEN** neither member has a top pick on the night

### Requirement: Clearing a top pick keeps the vote
When a member clears their top pick, their vote for the game SHALL stay.

#### Scenario: The member clears the top pick
- **GIVEN** a member's top pick is game A
- **WHEN** the member clears their top pick
- **THEN** the member has no top pick on the night, and game A still lists the member as a voter

### Requirement: Top picks count only from the night's players
The night's detail SHALL list as top pickers only the night's players, the same members whose votes count.

#### Scenario: A top pick from someone who is not a night's player
- **GIVEN** older data holds a top pick from a member who has not answered the night
- **WHEN** anyone reads the night's detail
- **THEN** that member is not listed as a top picker

### Requirement: The viewer's own top pick is drawn with stars
The night page SHALL draw hand-drawn stars around the vote card of the viewer's own top pick, and around no other card.

#### Scenario: The viewer has a top pick
- **GIVEN** the viewer's top pick is game A
- **WHEN** the viewer opens the night page
- **THEN** game A's vote card has hand-drawn stars around it, and no other vote card does

#### Scenario: Another member's top pick
- **GIVEN** another member's top pick is game B and the viewer's is not
- **WHEN** the viewer opens the night page
- **THEN** game B's vote card has no hand-drawn stars

### Requirement: A star marks each top picker's meeple
Wherever a vote card shows a voter's meeple, a member whose top pick is that game SHALL have a small star on their meeple. In the table plan, a player seated at their top pick SHALL have a small star on their meeple.

#### Scenario: Meeples on a vote card
- **GIVEN** member M's top pick is game A, and member N voted for game A without making it their top pick
- **WHEN** anyone views game A's vote card
- **THEN** M's meeple has a star and N's meeple does not

#### Scenario: Meeples in the table plan
- **GIVEN** a plan seats member M at game A, which is M's top pick, and member N at game A, which is not N's top pick
- **WHEN** anyone views that table in the plan
- **THEN** M's meeple has a star and N's meeple does not
