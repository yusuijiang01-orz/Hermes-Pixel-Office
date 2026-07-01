# Pixel Universe Next Step

Updated: 2026-07-02

## Automation Read Rule

For the Pixel Universe hourly development loop, read this file immediately after:

1. `AGENTS.md`
2. `codex_usage_guide.md`
3. `docs/pixel-universe-weekly-plan-2026-07-01.md`
4. `docs/pixel-universe-weekly-progress-2026-07-01.md`

Treat this file as the current handoff recommendation. If it conflicts with a newer user message, follow the newer user message and update this file before finishing.

## Current Recommended Next Step

Run a real browser/manual smoke check for the canonical Pixel Universe prompt:

```text
做一个老板追着摸鱼员工跑的小游戏，员工边跑边甩锅，追上后变成需求评审 Boss 战。
```

Confirm these signals are visible within 30 seconds:

- The sent user message shows `识别为游戏点子 · 摸鱼追逐 Boss 战`.
- Employee discussion or reaction appears in chat.
- A visible task candidate mentions `摸鱼追逐` or `需求评审 Boss 战`.
- The company/universe area shows a Coming Soon or preview-style entry.

## If The Smoke Check Passes

Next code task: make the generated task card more prominent in the company view, using the existing temporary frontend preview path. Keep it frontend-only unless the user explicitly approves persistence.

## If The Smoke Check Fails

Fix only the first missing visible signal. Prefer `scripts/chat-ui.js` and `styles/index.css`; avoid `server.py`, state JSON, auth, deployment, or data migration.

## Current Boundaries

- Do not touch `server.py` or state JSON for this next step.
- Do not modify the isolated Amazon extension changes.
- Do not turn the temporary preview into persistent task state without a confirmed plan.
