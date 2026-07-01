# Pixel Universe Intent Capture Rules v0.1

Date: 2026-07-02

## Goal

Make the chat front door reliably notice when a first-time user is giving Hermes a game idea, meme premise, or emotional beat that should become a visible Pixel Universe candidate.

This document is intentionally narrow: it defines the smallest recognition rules for the first fun loop before touching backend state, task creation, or persistence.

## MVP Recognition Targets

### Game Idea

Recognize a message as a game idea when it contains at least one play-action signal and one game-output signal.

Play-action signals:

- chase, run, jump, dodge, fight, collect, build, defend, escape
- 追, 跑, 跳, 躲, 打, 收集, 建造, 防守, 逃

Game-output signals:

- game, minigame, level, boss, battle, prototype
- 游戏, 小游戏, 关卡, Boss, boss, 战, 原型

The canonical demo prompt must match:

> 做一个老板追着摸鱼员工跑的小游戏，员工边跑边甩锅，追上后变成需求评审 Boss 战。

### Meme Premise

Recognize a message as a meme premise when it combines a recognizable role/object with an absurd or repeatable gag.

Role/object signals:

- boss, employee, client, PM, bug, meeting, deadline
- 老板, 员工, 客户, 产品, Bug, bug, 会议, 截止

Gag signals:

- blame, slack, overtime, explode, transform, loop, ridiculous
- 甩锅, 摸鱼, 加班, 爆炸, 变成, 循环, 离谱

### Emotional Beat

Recognize a message as an emotional beat when it describes a strong mood that can become a world event or character reaction.

Mood signals:

- anxious, angry, tired, excited, lonely, relieved
- 焦虑, 生气, 累, 兴奋, 孤独, 松一口气

World-action signals:

- office reacts, employees discuss, becomes event, becomes task
- 办公室反应, 员工讨论, 变成事件, 变成任务

## Minimum Visible Result

When a message matches any target, the user should see one visible confirmation within 30 seconds:

- Chat: a short progress line explaining what was recognized.
- Company board: a candidate task or idea card.
- Universe area: a Coming Soon, idea, or event entry.
- Office: a status tip that implies employees started discussing or building it.

The first implementation can be non-persistent if it is clearly marked as a candidate. Persistent task/state writes should wait for a confirmed backend plan.

## Non-Matches

Do not treat ordinary operations requests as Pixel Universe ideas:

- "帮我修这个 bug"
- "总结这段聊天"
- "今天有什么任务"
- "打开公司页"

Do not create universe candidates from auth, deployment, secrets, uploads, or state-repair messages.

## Suggested Next Patch

Add a single frontend helper near the current chat preview logic:

- input: latest boss group-chat prompt
- output: `{ kind, title, evidence, confidence } | null`
- first supported kind: `game_idea`
- first smoke check: canonical demo prompt renders the existing temporary task and Coming Soon preview

