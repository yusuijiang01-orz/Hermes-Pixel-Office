# Pixel Universe 30-Second Demo Scenario

Date: 2026-07-01

## Purpose

This document defines the first-time user demo target for the Pixel Universe loop. It is a product and implementation guide, not a promise that the full loop is already automated.

## Demo Promise

Within 30 seconds of sending one vivid game idea, the user should understand:

> Hermes is a pixel game company where employee chats can become visible development work and future game-universe content.

## Canonical Input

```text
做一个老板追着摸鱼员工跑的小游戏，员工边跑边甩锅，追上后变成需求评审 Boss 战。
```

## 30-Second User Timeline

### 0-3 seconds: user sends the idea

Visible result:
- The chat message appears immediately with a sending or received state.
- The interface does not look frozen.

Minimum implementation target:
- Preserve stable chat send feedback before adding extra universe behavior.

### 3-10 seconds: employees discuss the pitch

Visible result:
- At least two employees react in character.
- The discussion mentions a concrete playable hook: chase, blame-dodging, and review Boss phase.

Minimum implementation target:
- Discussion can be scripted or rule-assisted for the first demo, as long as it is visibly tied to the user's idea.

### 10-18 seconds: a development task appears

Visible result:
- A task card appears with a clear title, owner, and next step.
- Suggested title: `Prototype: 摸鱼追逐 Boss 战`.

Minimum implementation target:
- The task can be a visible task candidate before it becomes a full Hermes task workflow item.
- Do not change task persistence or schema without a confirmed plan.

### 18-24 seconds: the office reacts

Visible result:
- The office shows an active development state.
- One or more employees look busy, move, display status text, or otherwise signal that the idea is being worked on.

Minimum implementation target:
- Prefer a narrow UI state fed by existing frontend data over new backend state.

### 24-30 seconds: universe preview and chat progress report

Visible result:
- The game universe gains a coming-soon/event entry for the pitch.
- Chat reports what the team decided to build next.

Minimum implementation target:
- The universe entry may be a preview card, not a playable game.
- The progress report must name the task and the next deliverable.

## Required Demo Surfaces

Smallest likely file surfaces for implementation:
- `scripts/chat-ui.js`: show idea recognition, progress copy, or task creation feedback.
- `scripts/core.js`: connect visible state into existing app data if needed.
- `scripts/office-scene.js`: show office active-development reaction.
- `index.html`: only if an existing panel lacks a place to show the preview.
- `styles/index.css`: only for the smallest styling needed for a visible card/state.

High-risk surfaces to avoid without a confirmed plan:
- `server.py` task creation and Hermes CLI integration.
- `company_state*.json` schema or migration.
- Auth, deployment, or persistence changes.

## Acceptance Checklist

- The user sees their own idea echoed back in visible product language.
- At least two employees discuss the idea.
- A visible task or task candidate appears.
- The office visibly enters active development.
- A universe preview or coming-soon entry appears.
- Chat reports the next build step in one concise message.
- The loop is understandable without verbal explanation.

## Next Small Code Task

Add a frontend-only demo recognition path for the canonical input that renders a non-persistent "idea accepted" task preview and office activity state. This should be implemented only after checking current frontend changes carefully, because several UI files are already modified in the worktree.
