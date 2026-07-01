# Pixel Universe Weekly Development Plan

Week: 2026-07-01 to 2026-07-05

## North Star

Make a new user understand the fun within 30 seconds:

> This is a pixel game company that can turn your chats, memes, emotions, and ideas into a growing game universe.

## Primary Weekly Goal

Build and verify the first visible fun loop:

`User sends one game idea -> employees discuss it -> system creates a visible development task -> office shows development activity -> game universe shows a coming-soon/event entry -> chat reports progress back to the user`

## Non-Goals This Week

- Do not build a full automatic game generator.
- Do not add many new minigames before the main loop is understandable.
- Do not refactor the whole server or frontend.
- Do not change auth, deployment, state schema, or data migration without a confirmed plan.

## Daily Focus

### 2026-07-01: Product Map and First Fun Loop Design

- Write the GDD v0.1 for the pixel universe.
- Write the chat-to-game pipeline v0.1.
- Define the exact 30-second demo scenario.
- Identify the smallest files and UI surfaces needed for the first fun loop.

Acceptance:

- A developer can explain the MVP loop in one paragraph.
- The next code task has a small file list and a testable result.

### 2026-07-02: Chat Stability and Intent Capture

- Fix P0 chat bugs that block the front-door experience.
- Add or refine extraction rules for obvious game ideas, memes, emotional beats, and employee discussion outputs.
- Ensure a user message can become a traceable "game idea" record or task candidate.

Acceptance:

- Sending a message is stable.
- A demo prompt can be recognized as a game idea.
- The recognition result is visible in logs, state, or UI.

### 2026-07-03: Visible Development Task and Office Reaction

- Convert recognized game ideas into visible development task cards.
- Show office activity that makes employees feel like they are building something.
- Add clear progress/status feedback after the user sends a game idea.

Acceptance:

- User sees their idea become a task.
- The office visibly reacts within 30 seconds.
- The chat reports what changed.

### 2026-07-04: Game Universe Entry and Demo Route

- Add a universe/event/minigame entry generated from the demo idea.
- Build a "coming soon" or lightweight playable placeholder if full gameplay is too large.
- Connect the entry back to chat and office progress.

Acceptance:

- The game universe visibly grows after the idea.
- The user can open the generated entry or preview.
- The route does not feel like a dead end.

### 2026-07-05: Polish, Verification, and One-Minute Demo

- Run desktop and mobile smoke checks.
- Record screenshots or notes for before/after.
- Fix the most damaging clarity bugs.
- Prepare a one-minute demo script answering: "Why would anyone play this?"

Acceptance:

- A first-time user can see the product promise without verbal explanation.
- The weekly loop is demoable.
- Remaining issues are documented by priority.

## Hourly Execution Rule

Every hourly run should:

1. Read `AGENTS.md`, `codex_usage_guide.md`, and this plan.
2. Check current git status and avoid overwriting user changes.
3. Pick exactly one smallest useful task from today's focus.
4. If the task is high-risk or unclear, write a short plan instead of editing code.
5. If editing code, keep the change narrow and verify it.
6. Append a short progress note to `docs/pixel-universe-weekly-progress-2026-07-01.md`.

## First Demo Prompt

Use this as the canonical test idea:

> 做一个老板追着摸鱼员工跑的小游戏，员工边跑边甩锅，追上后变成需求评审 Boss 战。

Expected visible result:

- Employees discuss the idea.
- A development task appears.
- Office status changes to active development.
- Game universe shows a new event/minigame preview.
- Chat explains what the employees decided to build next.
