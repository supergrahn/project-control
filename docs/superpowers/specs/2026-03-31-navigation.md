# Navigation (Track D)

**Goal:** Add a persistent project icon rail for fast project switching, and replace the `NewProjectModal` with a multi-step wizard that sets up a project, agent, and first task in one flow.

---

## Part 1: Project Icon Rail

### Layout

A 44px-wide icon rail is added to the left of the existing nav sidebar. The full layout becomes:

```
44px rail | 240px nav sidebar | main content
```

The rail is always visible. The "Projects" section currently at the bottom of the nav sidebar is removed.

### Rail items

Each project is a colored circle (36px diameter) containing the first letter of the project name in uppercase. Colors cycle through the existing `DOT_COLORS` palette (`['#5b9bd5', '#3a8c5c', '#8f77c9', '#c97e2a', '#c04040']`) keyed by project index.

| State | Style |
|---|---|
| Default | Circle with project letter, muted background |
| Active | Bright ring (`2px solid` in the project's dot color) |
| Hover | Slight brightness increase + tooltip showing full project name |

Tooltip appears to the right of the rail on hover (not a native browser title — a custom positioned div).

### Switching projects

Clicking a project circle:
1. Calls `openProject(project)` on `useProjectStore`
2. Navigates to `/projects/{id}`

### Add project

A `+` button at the bottom of the rail (same size as project circles, muted color). Clicking opens `NewProjectWizard`.

### Rail data

The rail reads from `useProjects()` (already loaded globally in the layout). No new API needed.

---

## Part 2: New Project Wizard

Replaces `NewProjectModal` everywhere it is used. Rendered as a centered modal overlay (max-width 600px). A step indicator at the top shows: **Project → Agent → Task → Launch**.

### Step 1 — Project

| Field | Notes |
|---|---|
| Project path | Text input with blur validation (existing `GET /api/projects/validate-path`). Shows error inline. |
| Project name | Auto-populated from git config on valid path, editable |

*Next →* disabled until path validates.

### Step 2 — Agent

"Create your first agent for this project"

| Field | Notes |
|---|---|
| Agent name | Text input, e.g. "Developer" |
| Title | Text input, optional, e.g. "Senior Developer" |
| Provider | Dropdown of active providers (Track B). Shows "No providers configured" with link to `/settings/providers` if empty. |
| Model | Text input, optional |

**Skip option:** "Set up later" — skips agent creation, moves to Step 3.

*← Back | Next →*

### Step 3 — Task

"Give the agent something to do"

| Field | Notes |
|---|---|
| Task title | Text input |
| Description | Textarea, optional |
| Priority | Segmented selector: Low / Medium / High / Urgent |

**Skip option:** "Add tasks later" — skips task creation, moves to Step 4.

Only shown if an agent was created in Step 2. If agent was skipped, this step is also skipped automatically.

*← Back | Next →*

### Step 4 — Launch

Summary card showing what will be created:
- Project name + path
- Agent name + provider (if created)
- First task title + priority (if created)

Two buttons:
- **Create & Open** — creates all configured entities, closes wizard, navigates to `/projects/{id}`
- **Start now** — same as above + immediately spawns a session for the task using the agent. Only shown if both agent and task were configured.

### Creation order on submit

1. `POST /api/projects` → get `projectId`
2. If agent configured: `POST /api/agents` with `projectId`
3. If task configured: `POST /api/tasks` with `projectId`, then if "Start now": spawn session with `agentId`
4. Navigate to `/projects/{projectId}`

---

## File Map

| Action | File |
|---|---|
| Create | `components/layout/ProjectRail.tsx` — icon rail component |
| Modify | `app/(dashboard)/layout.tsx` — insert `<ProjectRail />` left of `<SidebarWrapper />` |
| Modify | `components/layout/Sidebar.tsx` — remove projects section at bottom |
| Delete | `components/projects/NewProjectModal.tsx` |
| Create | `components/projects/NewProjectWizard.tsx` — 4-step wizard |
| Modify | `components/layout/Sidebar.tsx` — replace `+ Add Project` button → opens `NewProjectWizard` |
| Modify | `components/layout/ProjectRail.tsx` — `+` button opens `NewProjectWizard` |

---

## Testing

- ProjectRail: renders one circle per project, active project has ring, clicking switches project and navigates
- ProjectRail: `+` button opens wizard
- NewProjectWizard: Step 1 validates path, auto-populates name
- NewProjectWizard: Step 2 skip works, step 3 auto-skips when agent skipped
- NewProjectWizard: Step 4 "Create & Open" creates project only when agent/task skipped
- NewProjectWizard: Step 4 "Start now" only shown when both agent and task configured
- NewProjectWizard: creation order — project first, then agent, then task
