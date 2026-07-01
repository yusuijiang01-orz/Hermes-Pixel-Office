# Pixel Universe Intent Capture Visibility Checklist

Date: 2026-07-02

## Purpose

Make the next small implementation easy to verify without touching persistence, auth, deployment, or `server.py`.

Today's focus is chat stability and intent capture. The smallest safe target is:

> A demo prompt can be recognized as a game idea, and the recognition result is visible in the UI within 30 seconds.

## Canonical Demo Prompt

```text
做一个老板追着摸鱼员工跑的小游戏，员工边跑边甩锅，追上后变成需求评审 Boss 战。
```

## Minimum Visible Signals

When the canonical prompt appears in group chat, the UI should expose four readable signals:

1. Intent label: `游戏点子`
2. Extracted fantasy: `老板追着摸鱼员工跑`
3. Play verb: `跑 / 甩锅 / Boss 战`
4. Next production action: `生成任务候选` or `员工讨论中`

These signals can remain frontend-only until the user confirms that the 30-second loop reads clearly.

## Suggested Narrow File Scope

- `scripts/chat-ui.js`: add or refine the recognition helper and visible temporary preview.
- `styles/index.css`: only if the existing preview is hard to scan on mobile.
- `docs/pixel-universe-weekly-progress-2026-07-01.md`: append the hourly result.

Avoid `server.py`, state JSON, auth files, deployment files, and cache-buster churn for this step.

## Light Verification

Use the smallest check that matches the change:

```powershell
node --check scripts\chat-ui.js
```

If UI copy or layout changes, run one browser smoke check with the canonical prompt and confirm:

- the chat still sends or renders the prompt;
- `游戏点子` is visible;
- a task candidate or production action is visible;
- no console error appears during the first 30 seconds.

## Current Blocker

`index.html` is already dirty and minified relative to the repository baseline. Do not stage it for a version bump unless its unrelated pre-existing changes have been isolated or accepted.
