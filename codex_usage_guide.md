## Preface
Core principle of saving quota: Not reduce usage times, but reduce model guesses and rework loss.
Three core mandatory operations: Write AGENTS.md, use lightweight model for simple tasks, create Plan first for complex tasks.
Final goal: Less rework, random modification and waste, sufficient long-term quota.

## Chapter 1 Root Cause of Fast Quota Consumption: Rework Wastes Massive Token
### 1.1 Four Typical Waste Scenarios (Wrong Operations)
1. Vague requirement description
    Missing clear target, modification scope and acceptance standard. Model keeps asking for confirmation, token of context expands continuously.
2. Auto read irrelevant files
    Auto scan log, backup archive, obsolete code, temporary test files. Irrelevant content pollutes context, core rules are covered.
3. Repeated modification for multiple rounds
    First plan does not meet expectation → second adjustment → still deviation → loop iteration. Each round consumes equal quota repeatedly.
4. Direct code modification without planning
    Modify multi-files without clear boundary, rollback with git after finishing, all previous quota consumption becomes invalid.

### 1.2 Comparison of Wrong & Standard Requirement
#### Wrong Requirement Demo
```
Optimize this project for me
```
Defect: No boundary, no index, no acceptance standard. Model guesses blindly, quota drops to 10% after repeated communication, poor delivery & long time cost.

#### Standard Clear Requirement Template (Copy Directly)
```
Task Target: Optimize response speed of /api/report interface
Modify Scope: Only adjust backend interface logic, forbid modifying frontend page & underlying database table structure
Mandatory Performance Requirement: Single interface response time <= 200ms
Acceptance Delivery Standard: Output pressure test log, comparison chart of performance before & after optimization
Forbidden Operation: Add new third-party middleware, restructure data table
```
Benefit: Model executes accurately once, rework probability drops sharply, save over 50% quota.

### 1.3 Core Conclusion
Every wrong guess from model causes meaningless quota loss.

---

## Chapter 2 First Mandatory Operation: Write AGENTS.md (Global Project Specification Doc)
### 2.1 Document Function
Write fixed project rules in advance, no need to repeat explanation in every dialogue.
4 core benefits: Save quota, reduce repeated questions, stable execution logic, improve work efficiency.

### 2.2 6 Mandatory Modules of AGENTS.md
1. Project Background
    Core business, solved pain points, target users, current development stage, business scope boundary.
    Function: Let Codex understand business context, avoid comprehension deviation fundamentally.
2. Tech Stack List
    Frontend framework & language, backend framework & language, database type, third-party dependencies, supporting tool chain.
    Function: Clear tech boundary, avoid incompatible & unreasonable code modification.
3. Common Project Commands
    Dependency install, local dev start, code lint, unit test, build compile, code format.
    Function: Codex can run operations autonomously, no repeated inquiry for execution commands.
4. Project File Structure
    Root directory explanation, core business folders, entry file path, config file location, data storage catalog.
    Function: Provide project map, avoid misread & misdelete irrelevant files.
5. Unified Work Rules
    Code writing standard, git commit message standard, branch management policy, log print requirement, unit test coverage standard.
    Function: Unify output specification, reduce secondary adjustment quota loss.
6. Forbidden Operation Red Line
    Forbid delete data table, forbid modify .env config, forbid hardcode secret credential, forbid unauthorized network request, forbid tamper git commit history.
    Function: Avoid irreversible high-risk operation, greatly reduce online failure risk.

### 2.3 Effect Comparison With/Without AGENTS.md
- Without AGENTS.md: Repeat communication about modify scope, run command, code standard every dialogue; redundant context, fast quota consumption, code modification easy to deviate.
- With AGENTS.md: Codex auto read global rules, understand all constraints at once; stable execution, higher delivery quality, no repeated communication loss.

### 2.4 Full Replicable AGENTS.md Template
```markdown
# Project Name
Brief description of core business, product value, target user group

## Tech Stack
- Frontend:
- Backend:
- Database:
- Third-party Tools & Dependencies:

## General Work Rules
Follow all below processes for every task:
1. Output full change plan, modify code file only after manual confirmation
2. Execute minimal scope modification, never expand requirement boundary without permission
3. Explain impact range & potential risk before code change
4. Ask for confirmation in advance for uncertain implementation scheme, forbid blind trial & error

## Common Project Commands
# Local Dev Start
npm run dev
# Code Grammar & Format Lint
npm run lint
# Run Unit Test
npm run test
# Project Build Compile
npm run build

## Directory Structure Description
- app/: Page route & business logic entry
- components/: General UI component library
- lib/: Low-level general tool function
- data/: Data model & interface request encapsulation
- utils.ts: Auxiliary general method

## Forbidden Operation List
1. Forbid delete any business code file directly
2. Forbid modify .env & environment config file
3. Forbid add new third-party dependency without pre-communication
4. Forbid hardcode account, secret & online credential info
5. Forbid adjust database table structure & batch delete data without authorization
```

---

## Chapter 3 Second Mandatory Operation: Match Model Configuration By Task Risk Level
### 3.1 Task Level Judgment Standard
| Task Level | Judgment Condition | Typical Task Case | Quota Consumption Ratio | Recommended Model Config |
|------------|--------------------|-------------------|------------------------|--------------------------|
| Light Task | Single file minor change, ultra-low risk, fast rollback support | Modify button text, comment translation, organize README, file search, typo correction | 10% | Lightweight small model |
| Medium Task | Involve few files/modules, controllable function impact, manual review required | Add new field to page, batch data process, partial function optimization | 40% | Medium computing power model |
| Heavy Task | Cross multi-module/service, impact core business data, easy to trigger online bug | Project architecture refactor, database migration, payment/permission logic reconstruction | 90% | High-performance heavy model |

### 3.2 Execution Specification
1. All light tasks use small model: Faster running speed, ultra-low quota consumption, no occupation of heavy model quota pool.
2. Heavy model only for architecture refactor, complex bug fix, data migration & other high-risk complex scenarios.
3. Forbid use highest heavy model for all tasks, which will exhaust available quota rapidly.

### 3.3 Mandatory High-Risk Rule
Any task involving fund transaction, user permission, data table delete/migration, online production service, no matter modification range size, must run Plan planning process first, execute only after manual scheme confirmation.

---

## Chapter 4 Third Mandatory Operation: Create Plan First For Complex Tasks, Forbid Direct File Modification
### 4.1 Hazard of Wrong Operation
Direct modification without planning: Blind batch change multi-files, fully out of control modification range; rollback with git after mismatch expectation, all previous quota consumption invalid.
Typical wrong requirement: Refactor the whole project for me → Codex batch modify all code files directly.

### 4.2 Fixed Output Content of Plan Mode (Only Output Scheme, No File Modification)
1. Full disassemble & understand business requirement
2. Sort out full file list to read & modify
3. Step-by-step implementation process
4. Risk prompt & rollback scheme brought by change
5. Minimum viable delivery solution
6. Questions need manual confirmation

### 4.3 Standard 5-Step Execution Flow
1. Submit full requirement: Clear modify scope, acceptance standard, forbidden operation
2. Launch Plan mode, generate full refactor scheme
3. Manual review scheme, confirm file range, risk boundary & execution steps are correct
4. Execute code modification by Codex after manual confirmation
5. Auto verify function after execution, output change summary, iterate & optimize as needed

### 4.4 Core Benefit of Plan Mode
Confirm scheme before modification, rework probability reduce by 50%, eliminate quota waste from large-scale rework.

---

## Chapter 5 Global Optimal 6-Step Standard Flow (Quota Positive Cycle)
1. Preparatory Step: Write complete AGENTS.md
Input all fixed project rules at one time, reuse long-term, eliminate repeated communication cost.
2. Task Level Judgment
Distinguish light/medium/heavy task according to modification range, risk & business impact, match corresponding model computing power.
3. Run Plan For Heavy Tasks
Generate full scheme for high-risk & large-range modification task, no file modification in whole process.
4. Execute After Manual Scheme Confirmation
Review modify file list, risk boundary & delivery standard, run modify command only after confirmation.
5. Output Change Summary After Execution
Record modified file list, change content, test result & follow-up optimization suggestion, convenient for review & trace.
6. Sink Experience & Update AGENTS.md
Supplement task processing specification & pitfall avoidance scheme to rule file, no repeated communication for similar tasks.

### Cycle Gain Logic
Perfect rules → Less communication → Lower rework → Quota saved → Continuous rule precipitation, form positive cycle.

---

## Chapter 6 Core Summary: 3 Key Methods To Save Quota
1. Complete AGENTS.md Project Rules
Reduce model guess for requirements, compress redundant context, write once & reuse long-term, save massive communication token.
2. Match Corresponding Model By Task Level
Run light tasks with lightweight model, reserve heavy model quota for core complex tasks, maximize quota utilization.
3. Create Plan First For Complex Tasks
Confirm full refactor scheme in advance, eliminate invalid quota consumption from large-scale rework.

### 6.1 Comparison Of Two Working Flow
#### Low-Efficiency Quota Consumption Flow (Wrong Demo)
Vague requirement description → Use heavy model for all tasks → Direct code modification without planning → Multi-round iteration rework & rollback → Quota exhausted rapidly

#### High-Efficiency Quota Saving Flow (Standard Spec)
Clear full requirement + Global project rules → Match corresponding model by level → Create Plan & confirm first for heavy tasks → One-time completion without rework → Sufficient long-term quota

### 6.2 Core Formula
Complete Project Rules(AGENTS) + Reasonable Model Allocation(MODEL) + Pre-Scheme Planning(PLAN) = Efficient Execution & Durable Quota
---
# File End
## Usage Instruction
1. Save full content as `codex_usage_guide.md` under project root directory
2. Codex will auto load & parse all rules when starting task
3. Update AGENTS.md & this guide document synchronously after new task processing experience accumulated