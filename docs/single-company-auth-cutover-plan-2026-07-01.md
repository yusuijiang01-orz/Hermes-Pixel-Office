# Hermes Single-Company Auth Cutover Plan

生成时间：2026-07-01

目标：

- 把当前生产环境正式收口到 `单老板公司模式`
- 不破坏当前公司电脑生产链路
- 为后续 `P0 聊天实时性 / 公司状态一致性 / 任务看板一致性` 提供稳定前提

## 1. 当前现状

从当前本地文件和运行态可以确认：

- 生产主账号来自环境变量：
  - `HERMES_WEB_USER=admin`
  - `HERMES_WEB_PASSWORD=Ww123456.`
- 当前 `auth.users.json` 中除主账号外，还存在额外账号：
  - `laowu`
- 当前额外账号已经绑定：
  - 独立 `board`
  - 独立 `company_state.laowu.json`

这说明：

- 当前生产代码仍然处于“主公司 + 多用户独立公司能力并存”的状态
- 但上一轮已经明确，当前公开生产应按 `单老板公司模式` 处理

## 2. 收口目标

这次 cutover 的目标不是“删除多账号能力”，而是：

- 让当前公开生产链路只服务老板主公司
- 让主账号的聊天、看板、公司状态路径唯一且稳定
- 让多账号逻辑退回为非主路径，不再影响当前恢复工作

## 3. 本次 cutover 应该做什么

### 3.1 在代码层面固定当前生产默认用户

目标：

- 当前公开请求默认只落到老板主账号

建议动作：

- 明确 `default_auth_username()` 在生产模式下应稳定返回主账号
- 避免由 `auth.users.json` 的顺序间接决定当前默认用户

原因：

- 现在默认用户不能依赖字典合并顺序
- 生产模式已经被定义为单老板公司，不应再让扩展账号影响默认落点

### 3.2 把注册能力降级为非主路径

目标：

- 当前公开生产不再把“注册独立公司”作为默认能力暴露

建议动作：

- 登录页可继续保留
- 注册页与注册提交逻辑应默认关闭、隐藏或只在显式开发模式下开放

原因：

- 当前恢复重点不是拉新用户
- 注册会继续制造新的 `board` 和 `company_state.*.json`
- 这会直接扩大状态分叉

### 3.3 明确 `auth.users.json` 的生产角色

目标：

- `auth.users.json` 在当前生产中只能作为扩展配置，不得决定主公司路径

建议动作：

- 主公司仍以环境变量为权威
- 扩展账号仅在未来重新启用多公司模式时再参与主链路

### 3.4 明确状态文件唯一落点

目标：

- 当前生产主账号的公司状态必须稳定落到：
  - `company_state.json`

建议动作：

- 验证主账号登录后：
  - `/api/state`
  - `/api/events`
  - `/api/message`
  - `/api/scene/load`
  - `/api/scene/save`

全部只读写主公司状态

## 4. 本次 cutover 不应该做什么

### 4.1 不做聊天 UI 修复

原因：

- 当前阶段是在收口认证边界
- 把聊天 UI 修复混进来会污染问题定位

### 4.2 不做场景编辑功能修复

原因：

- `scripts/core.js / scripts/office-scene.js` 仍然是另一组独立脏改动
- 不应和认证收口绑在一起

### 4.3 不立即删除历史多公司文件

原因：

- 现阶段应先停止它们影响主路径
- 不应一边收口一边做破坏性清理

建议：

- `company_state.laowu.json` 和扩展账号先作为冷备 / 旁路文件保留

## 5. 具体代码触点

下一次真正实施 cutover 时，应优先检查这些点：

### 5.1 用户选择逻辑

- `configured_auth_users()`
- `default_auth_username()`
- `current_user_config()`
- `current_company_state_path()`

### 5.2 登录态解析

- `make_auth_cookie(username)`
- `verify_auth_cookie(cookie_header)`
- `web_username()`
- `request_username()`

### 5.3 页面与注册入口

- `login_page(...)`
- `register_page(...)`
- `validate_registration(...)`
- `register_auth_user(...)`

### 5.4 请求处理入口

- `do_GET()`
- `do_POST()`
- `cached_state(self.request_username())`
- `state_cache_key(self.request_username())`
- 所有 `load_company_state()` / `save_company_state()` 调用路径

## 6. 实施后的验收标准

只有全部满足，才算 cutover 合格。

### 6.1 登录一致性

- 用主账号登录后，进入的是老板主公司
- 刷新页面后不会跳到其他公司状态

### 6.2 状态一致性

- `/api/state` 返回的公司名、聊天、看板来自主公司
- PC 与手机访问同一域名时，看到的是同一家公司

### 6.3 聊天一致性

- 群聊和私聊不再因为用户路径切换而串台
- 任务、沉淀、最近交付不再混入其他公司状态

### 6.4 非主路径隔离

- 即使本地仍存在扩展账号文件，也不会影响当前公开生产

## 7. 推荐执行顺序

下一轮真正动 `server.py` 时，建议顺序如下：

1. 先固定默认生产用户逻辑
2. 再降级注册入口
3. 再验证 `/api/state` 与 `/api/message` 的主公司落点
4. 最后再做聊天与状态链路恢复

## 8. 一句话结论

`当前最该做的不是继续扩展账号体系，而是把公开生产链路重新钉死在老板主公司上。`
