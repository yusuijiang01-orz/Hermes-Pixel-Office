# Pixel Universe GDD v0.1

Date: 2026-07-01

## One Sentence

Hermes Pixel Office is a tiny playable game studio where a user can pitch a weird game idea and immediately watch agents debate it, turn it into work, and grow the shared game universe.

## Player Fantasy

The user is the creative boss of a pixel studio. They do not only chat with employees; they throw ideas into the office and see the company react like a living production team.

## First 30 Seconds

1. The user opens the group chat and sends the canonical pitch: "做一个老板追着摸鱼员工跑的小游戏，员工边跑边甩锅，追上后变成需求评审 Boss 战。"
2. The office treats it as a game pitch.
3. Employees answer in character with a small design discussion.
4. A visible task candidate appears on the company board.
5. The universe board gains a Coming Soon entry.
6. Chat reports the exact progress back to the user.

## MVP Loop

`Pitch -> discussion -> task candidate -> office activity -> universe entry -> progress report`

The MVP is successful when a first-time user can understand that chat is not decorative: it creates visible work and story state.

## Core Surfaces

- Group chat: the front door for game ideas and employee discussion.
- Mobile company board: the fastest place to show "your idea became work".
- Universe board: the proof that the world grows from chat.
- Office scene tip/status: the ambient signal that the studio is now building.

## Canonical Prototype

Title: `Prototype: 摸鱼追逐 Boss 战`

Premise: The boss chases slacking employees through the office. Employees throw excuse cards and responsibility-shifting props. When caught, the scene turns into a requirement-review boss fight.

First prototype slices:

- Chase rhythm: short loops, visible pursuit pressure, simple escape routes.
- Blame props: throwable excuses that slow or confuse the boss.
- Review battle: a short phase where vague requirements become attack patterns.

## Non-Goals For v0.1

- No full automatic game generation.
- No persistent state migration.
- No new backend schema.
- No new dependencies.
- No attempt to support every possible game pitch yet.

## Next Code Step

Browser-smoke the existing canonical-input preview and tune only the smallest confusing copy or spacing issue found in the first 30 seconds.
