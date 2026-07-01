# Pixel Universe First Loop UI Surface Map

Date: 2026-07-01

## Purpose

This note identifies the smallest frontend surfaces for the first 30-second Pixel Universe fun loop. It is a handoff note for the next code task, not an implementation.

## Chosen Demo Slice

For the canonical input:

```text
做一个老板追着摸鱼员工跑的小游戏，员工边跑边甩锅，追上后变成需求评审 Boss 战。
```

The next safe code task should render a non-persistent demo preview that makes the loop legible:

- chat acknowledges the idea as a game pitch
- at least two employee lines discuss the hook
- a visible task candidate appears
- the office status text reacts
- the universe panel shows a coming-soon entry

## Smallest Safe File List

- `scripts/chat-ui.js`: best first target. It already renders desktop chat, mobile chat, mobile task board, and mobile universe board.
- `scripts/core.js`: use only if a tiny shared in-memory flag is required for scene/UI state.
- `styles/index.css`: use only if existing card styles cannot make the preview readable.

Avoid for this demo slice:

- `server.py`: message handling, Hermes task creation, and universe deposition are high-risk for this hourly loop.
- `company_state*.json`: do not create or migrate runtime state for a throwaway demo preview.
- `index.html`: currently minified in the worktree, so editing it risks unnecessary churn and merge conflict.
- `scripts/office-scene.js`: useful later for animation, but the first code step can update existing status text without touching canvas behavior.

## Existing UI Anchors

These anchors already exist and should be reused:

- `#chat` and `#mobileChatBody` for chat feedback.
- `#mobileTaskBoard` and `#mobileTaskSummary` for the task candidate.
- `#mobileUniverseBoard` and `#mobileUniverseSummary` for the coming-soon universe entry.
- `#sceneTip`, `#project`, or employee task labels for the office reaction.

## Suggested Next Code Task

Add a frontend-only recognizer for the canonical demo input inside the chat send/render path. When the outgoing message contains the boss-chase idea keywords, append a temporary client-side preview object that `renderChat`, `renderMobileCompany`, or a small helper can display.

Acceptance for that code task:

- no persistence or backend changes
- no schema changes
- no third-party dependencies
- desktop or mobile UI shows the task and universe preview after sending the canonical input
- a lightweight browser/API smoke check confirms the page still boots

## Risk Notes

The current worktree already has modified frontend files and a minified `index.html`. The next implementation should inspect diffs before editing and patch only stable function blocks, preferably in `scripts/chat-ui.js`.
