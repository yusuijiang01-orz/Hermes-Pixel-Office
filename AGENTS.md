# Hermes Pixel Office

Local pixel office for operating real Hermes agents, chats, Kanban tasks, and company/world state through a Python web server and static browser UI.

This project is not a mock demo. Changes can affect real local task state, uploaded chat files, auth data, and Hermes agent workflows.

## Required Companion Rules

- Always read and follow `codex_usage_guide.md` before non-trivial work in this repository.
- For complex, high-risk, cross-module, auth, deployment, or data/state migration work, produce a plan first and wait for manual confirmation before editing files.
- Keep work scoped to the requested task. Avoid broad scans of backup/output/log folders unless the task specifically requires them.
- Prefer the smallest reversible change that satisfies the request.

## Tech Stack

- Backend: Python 3 standard-library HTTP server in `server.py`.
- Frontend: Static HTML/CSS/JavaScript served from the repository root.
- Primary UI entry: `index.html`.
- Frontend scripts: `scripts/*.js`.
- Styles: `styles/index.css`.
- Local state: JSON files such as `company_state.json`, `company_state.laowu.json`, and Hermes state accessed by `server.py`.
- Auth/local secrets: `auth.local.ps1`, `auth.users.json`, and environment variables consumed by `server.py`.
- Deployment: shell/systemd/Nginx assets under `deploy/`.
- Tests/checks: ad hoc Playwright scripts and screenshots under `output/playwright/`; no package-managed test suite is currently established.

## Common Commands

From the repository root:

```powershell
# Start local app and open browser
.\start-office.ps1

# Start local app server without opening the browser
.\start-office-server.ps1

# Run server directly with the configured Hermes Python if needed
C:\Users\admin\AppData\Local\hermes\hermes-agent\venv\Scripts\python.exe server.py
```

The app normally listens on:

- Local PC: `http://127.0.0.1:8777`
- Same Wi-Fi/LAN: `http://<computer-lan-ip>:8777`

Do not expose port `8777` directly to the public internet. For remote use, deploy behind Nginx/HTTPS as described in `DEPLOY.md`.

## Directory Map

- `server.py`: main backend server, API routes, auth, Hermes CLI integration, state loading/saving, scheduler/background logic.
- `index.html`: main desktop/mobile UI shell.
- `scripts/`: browser-side app logic split across shared, core, chat, office scene, dungeon lore, and network modules.
- `styles/`: main UI stylesheet.
- `projects/`: embedded project/game pages such as `companyverse` and `mushroom-runner`.
- `deploy/`: VPS install, systemd, and Nginx deployment files.
- `docs/`: project documentation.
- `uploads/`: user/chat uploaded files.
- `output/`: generated artifacts, especially Playwright screenshots and check scripts.
- `backups/`, `rollback-*`, `restore-*`, `before-restore-*`, `panic-*`, `.recovery-baselines/`: historical recovery snapshots. Read only when recovery/comparison is explicitly requested.
- `.tmp-build/`, `dist/`, `test-results/`, `__pycache__/`: generated or transient output.

## Work Rules

1. Before editing, identify the exact files needed for the task and avoid unrelated rewrites.
2. Treat `server.py`, auth, deployment, state persistence, and Hermes task creation logic as high risk.
3. Preserve user data and runtime state. Do not overwrite state JSON or uploaded files unless the user explicitly asks.
4. Keep frontend changes consistent with the existing pixel office/game UI and mobile shell patterns.
5. For UI work, verify with the running app and screenshots when practical, especially for mobile/desktop layout changes.
6. For backend work, prefer focused route/function tests or direct API smoke checks over full-system churn.
7. When adding docs or rules learned during work, update `AGENTS.md` and `codex_usage_guide.md` only when the new rule is durable and generally useful.
8. Do not add third-party dependencies without discussing the reason and impact first.
9. Avoid changing cache-buster query strings unless the asset content or deployment behavior needs it.
10. Keep comments concise and only where they clarify non-obvious behavior.

## Git Rules

- Never rewrite history or discard user changes unless explicitly requested.
- Check the worktree before broad edits or commits.
- Keep commits focused and describe user-visible behavior or risk clearly.
- Use the `codex/` branch prefix when creating a new branch unless the user requests another name.

## Forbidden Operations

- Do not delete business files, uploaded files, state JSON, auth files, or recovery snapshots without explicit user confirmation.
- Do not edit `.env`-style config, `auth.local.ps1`, credentials, or secrets unless explicitly requested.
- Do not hardcode accounts, passwords, API keys, cookies, tokens, or production URLs.
- Do not expose `8777` publicly or weaken auth/deployment safeguards.
- Do not change database/table/state schema, migrate data, or batch-delete data without a confirmed plan.
- Do not run destructive git commands such as `git reset --hard` or `git checkout --` to discard changes unless explicitly requested.
- Do not scan huge logs, backup folders, screenshots, or generated artifacts by default; use targeted reads.

## Acceptance Habit

At the end of work, report:

- Files changed.
- What behavior changed.
- Verification performed, including commands or screenshots when relevant.
- Any risk, skipped verification, or follow-up that matters.
