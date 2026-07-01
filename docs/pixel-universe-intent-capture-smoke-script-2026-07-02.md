# Pixel Universe Intent Capture Smoke Script

Date: 2026-07-02

## Purpose

Verify the smallest visible fun loop from today's focus without touching backend state or persistence:

> A first-time user sends a vivid game idea, and the UI clearly treats it as a game idea within 30 seconds.

## Canonical Prompt

```text
做一个老板追着摸鱼员工跑的小游戏，员工边跑边甩锅，追上后变成需求评审 Boss 战。
```

## Manual Smoke Path

1. Open `http://127.0.0.1:8777/`.
2. Open the mobile or desktop group chat.
3. Send the canonical prompt above.
4. Within 30 seconds, confirm these four signals are visible:
   - employee discussion or reaction appears in chat;
   - an idea/task candidate mentions `摸鱼追逐` or `需求评审 Boss 战`;
   - the office status/tip indicates active development;
   - the universe/company area shows a Coming Soon or preview-style entry.

## Pass Criteria

- The user does not need to inspect devtools, logs, JSON files, or docs to understand that the idea was recognized.
- The visible labels connect the original prompt to the generated work item.
- The UI does not imply the entry is a finished playable game unless it actually is.

## Fail Criteria

- The message sends but no visible game-idea signal appears.
- The preview appears only in one hidden/mobile-only panel.
- The generated copy is too generic to connect back to the user's prompt.
- The app requires a page refresh to show the recognition result.

## Light Verification Command

Use this only if the smoke check required a frontend script edit:

```powershell
node --check scripts\chat-ui.js
```

## Next Code Step

When the current dirty frontend files are isolated, add the smallest `scripts/chat-ui.js` helper that tags obvious game ideas and renders a visible temporary label such as:

```text
识别为游戏点子 · 摸鱼追逐 Boss 战
```
