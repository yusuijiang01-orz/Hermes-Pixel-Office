# 聊天内容自动沉淀到像素宇宙的生长机制

## 设计目标

让聊天内容从"被动沉淀"升级为"主动生长"——任何有价值的聊天都会自动分类、进入宇宙事件/灵感/任务池，并在像素宇宙中以可见的方式呈现。

## 沉淀分类体系

每条聊天内容根据语义自动归类为以下类别之一：

| 类别 | 判定条件 | 落入字段 | 宇宙表现 |
|------|---------|---------|---------|
| company_life | 涉及公司日常、办公室物品、员工互动、奶茶/咖啡/鱼缸/柯基 | universe_events + universe_ideas | 办公室场景事件、NPC对话 |
| gameplay | 涉及玩法、关卡、手感、战斗、跳跃、平台 | universe_events + universe_tasks | 小游戏入口、Companyverse玩法 |
| world_area | 涉及地图、区域、入口、街区、公司外场景 | universe_events + universe_ideas | Companyverse 地图扩展 |
| narrative | 涉及角色对白、剧情、世界观、道具说明 | universe_events + universe_tasks | 角色互动、道具文本 |
| system_feature | 涉及功能开发、编辑器、系统改造 | universe_events + universe_tasks | 编辑器功能、系统面板 |
| universe_growth | 涉及沉淀机制、宇宙扩展、生长 | universe_events + universe_tasks | 本任务 |
| memory | 纯事实记录、状态查询、无行动指向 | universe_events | 宇宙记忆墙 |

## 自动沉淀触发器

### 1. 老板指令（即时）
- 老板发消息时，立即调用 deposit_chat_to_universe()
- 自动创建 Kanban 执行任务
- 在 index.html 宇宙面板实时更新

### 2. 员工承诺（即时）
- 检测到"我来做""我负责""我先出一版"等承诺语句
- 自动归入对应角色的 universe_events
- 自动关联执行任务

### 3. 任务完成扫描（定时）
- 服务器每 5 分钟扫描一次已完成的聊天任务
- 提取聊天内容，按分类规则沉淀
- 更新 sediment_cursors 避免重复

### 4. 灵感筛选（自动）
- 对 universe_ideas 中超过 24 小时未转为 candidate 的条目
- 自动标记为 "stale"
- 小韩可在宇宙面板查看并决定是否保留

### 5. 宇宙事件浏览（前端）
- Companyverse 增加宇宙事件浏览器页面
- 按时间线展示所有沉淀事件
- 可按类别筛选

## 文件改动清单

### 1. server.py — 增强沉淀管道
- 新增 classify_chat_message() 函数：按语义自动分类
- 新增 get_universe_summary() API：返回 universe_events/ideas/tasks 的聚合数据
- 新增沉淀定时扫描：在服务器后台线程中每 5 分钟检查已完成任务
- 新增 stale_idea_cleanup()：标记超时的灵感

### 2. company_state.json — 新增字段
- universe_categories: 预定义的分类规则表（供服务端参考）
- universe_stale_threshold_hours: 灵感过期时间（默认 24）
- universe_active_view: 最后展示的宇宙视图类型

### 3. index.html — 手机宇宙面板增强
- 宇宙沉淀面板增加分类筛选标签
- 待做进世界面板显示每个条目的优先级
- 增加"沉淀统计"小模块：显示各分类的事件数量

### 4. projects/companyverse/index.html — 宇宙事件浏览器
- 新增完整的事件时间线视图
- 支持按类别、时间、来源筛选
- 点击事件可查看原文和关联任务

### 5. docs/ 新增沉淀规则文档
- 沉淀分类规则详细说明
- 各类别的宇宙表现形式
- 灵感生命周期管理

## 验收标准

1. 老板发消息后，universe_events 中立即出现对应条目
2. 员工承诺执行后，universe_tasks 中出现 candidate 条目
3. 手机公司页面宇宙面板显示分类后的事件
4. Companyverse 可访问宇宙事件浏览器
5. 已完成聊天任务自动沉淀，不重复
6. 灵感超过 24 小时未被采纳自动标记 stale

## 分工

- 小韩（planner）：定义分类体系和验收标准
- 阿默（default/implementer）：修改 server.py 和前端文件
- 小研（researcher）：验证分类规则覆盖度，检查与现有世界规则冲突
- 小文（writer）：把沉淀事件转为公司日常叙事素材
