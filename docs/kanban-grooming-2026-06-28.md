# Kanban Grooming - 2026-06-28

- Board: relicbound-arpg
- Database: `C:\Users\admin\AppData\Local\hermes\kanban\boards\relicbound-arpg\kanban.db`
- Backup: `C:\Users\admin\AppData\Local\hermes\kanban\boards\relicbound-arpg\kanban.db.backup-20260628-115319`

## Rules Applied

- Archived blocked tasks whose worker process was already `not alive`.
- Archived old low-priority blocked tasks created before 2026-06-26, excluding explicit high-priority project execution cards.
- Moved old low-priority ready tasks created before 2026-06-26 back to todo for re-confirmation.
- Cleared stale claim/run pointers on non-running tasks.
- Pruned repetitive crashed/reclaimed/spawn lifecycle logs while preserving recent traces.

## Result

- Archived dead blocked tasks: 385
- Archived stale low-priority blocked tasks: 28
- Ready -> todo: 12
- Cleared stale task claim pointers: 15
- Deleted repetitive task_runs: 547479
- Deleted task_events linked to removed runs: 1642041
- Deleted extra lifecycle spam events: 820976
- Marked orphan running/scheduled task_runs as stale: 22

Note: after cleanup, the live dispatcher immediately claimed 3 real chat-related tasks. Those are legitimate active `running` tasks because they are referenced by `tasks.current_run_id`, unlike the old stale run/event pile.

## Counts

| Metric | Before | After |
|---|---:|---:|
| tasks.status=archived | 278 | 691 |
| tasks.status=blocked | 423 | 10 |
| tasks.status=completed | 4 | 4 |
| tasks.status=done | 864 | 864 |
| tasks.status=ready | 21 | 9 |
| tasks.status=todo | 6 | 18 |
| tasks rows | 1596 | 1596 |
| task_runs rows | 552385 | 4906 |
| task_events rows | 2484442 | 21425 |

## Remaining Blocked Sample

- `t_f5615621` p4970 planner 2026-06-25 10:21: [优化队列:P3] 群聊承诺追踪与超时催办 
- `t_97588040` p2000 writer 2026-06-26 19:23: [项目执行] 现在聊天怎么一卡一卡的了？ 群聊中已出现执行承诺或交付请求，不能继续停留在讨论： 小文：@老板 
- `t_6a1cbd93` p2000 default 2026-06-25 19:01: [项目执行] 兄弟姐妹们，我点厕所进入了游戏模式。但是我人呢？摇撼呢？我怎么操作啊，我都移动不了。好难啊！帮忙 
- `t_7b8bed8d` p2000 default 2026-06-25 12:36: [项目执行] 这个不行啊。你怎么把对话按钮和编辑模式搞成一个按钮了？我现在对话按钮用不了了。编辑模式需要放在右 
- `t_aaacce8a` p2000 default 2026-06-25 10:07: [项目执行] 编辑模式由阿默负责处理。 群聊中已出现执行承诺或交付请求，不能继续停留在讨论： 阿默：@老板 收 
- `t_55f15722` p2000 default 2026-06-25 09:59: [P0直达] 阿默立刻收尾编辑模式，不等旧任务 
- `t_63e2ea3d` p1270 default 2026-06-25 09:51: [Companyverse] 阿默：母世界入口与共享资产技术线 
- `t_b0198c36` p1200 default 2026-06-24 18:32: [项目执行] 下班了！回家了，你们改了一天，连我要的基本功能都还没交付给我。@阿默！！！ 就增加一个编辑模式， 
- `t_485c8424` p1200 default 2026-06-24 14:57: [项目执行] “C:\Users\admin\Documents\Hermes-Pixel-Office”，H 
- `t_c5ddd1ea` p850 planner 2026-06-26 09:08: [Universe Deposit] company_life 2c5eb6e4c0c8 
