# table-planner Specification

## Purpose
Proposes how to seat a night's players at one, two or three tables of the suggested games, so that as many players as possible play a game they want.

## Requirements

### Requirement: Top picks rank options first
For each table count, the planner SHALL rank options by the number of players seated at their top pick before it compares happy players.

#### Scenario: More top picks beat more happy players
- **GIVEN** two options for the same table count, where option X seats 2 players at their top pick with 4 happy players, and option Y seats 1 player at their top pick with 5 happy players
- **WHEN** the planner ranks them
- **THEN** option X ranks above option Y

### Requirement: Happy players decide between equal top picks
Between options that seat the same number of players at their top pick, the planner SHALL rank the option with more happy players first.

#### Scenario: Same top picks, different happy players
- **GIVEN** two options for the same table count that each seat 1 player at their top pick, with 3 and 5 happy players
- **WHEN** the planner ranks them
- **THEN** the option with 5 happy players ranks first

#### Scenario: Nobody has a top pick
- **GIVEN** no player has a top pick
- **WHEN** the planner ranks options
- **THEN** options rank by happy players first, as they did before top picks existed

### Requirement: Seating puts players at their top pick first
Within an option, the planner SHALL seat as many players at their top pick as the table sizes allow, before it seats players at other games they voted for.

#### Scenario: Two players want the same seat
- **GIVEN** an option with tables for game A and game B, one seat left at game A, player P whose top pick is game A, and player Q who voted for game A and game B with no top pick
- **WHEN** the planner seats the option
- **THEN** P sits at game A and Q sits at game B

### Requirement: The plan reports top picks
Each table and each option in the plan SHALL report how many of its players sit at their top pick.

#### Scenario: A table with one top pick
- **GIVEN** a plan seats three players at game A, and game A is the top pick of one of them
- **WHEN** anyone reads the plan
- **THEN** that table reports 1 top pick, and its option counts it in its total

### Requirement: The plan summary names the top picks
When any player at the night has a top pick, the plan summary on the night page SHALL say how many players sit at their top pick.

#### Scenario: Players with top picks
- **GIVEN** 6 players are coming, 3 of them have a top pick, and the shown option seats 2 of them at it
- **WHEN** anyone views the plan
- **THEN** the summary says 2 players sit at their top pick

#### Scenario: Nobody has a top pick
- **GIVEN** no player has a top pick
- **WHEN** anyone views the plan
- **THEN** the summary says nothing about top picks

### Requirement: Top picks do not change the table count
The recommended table count SHALL depend only on happy players. The planner SHALL recommend an extra table when the best option with it has at least one more happy player per four voters, rounded up, than the best option without it.

#### Scenario: More top picks at more tables, too few extra happy players
- **GIVEN** 8 voters, the best two-table option seats 3 more players at their top pick than the best one-table option, and 1 more happy player
- **WHEN** the planner recommends a table count
- **THEN** it recommends one table, because two tables need 2 more happy players

#### Scenario: Enough extra happy players
- **GIVEN** 8 voters, and the best two-table option has 2 more happy players than the best one-table option
- **WHEN** the planner recommends a table count
- **THEN** it recommends two tables
