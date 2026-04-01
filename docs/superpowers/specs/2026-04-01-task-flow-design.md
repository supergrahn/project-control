# Task Flow — Design Spec

**Goal:** Improve task pipeline management by adding validation, confirmation, audit trails, and dependency tracking. Prevent accidental status skips, provide visibility into status changes, and block dependent work.

**Principles:**
- Validate status transitions—forward-only by default, with explicit backward and jump-to-done paths
- Soft blocks, not hard blocks—dependencies and readiness checks warn the user but don't prevent action
- Audit everything—every status change is logged with context (who, why, when)
- Explicit confirmation—status changes via UI require confirmation before taking effect
- Priority drives ordering—tasks in pipeline views sort by urgency first, then recency
- API consistency—the backend validates the same rules as the UI

---

## 1. Status Change Validation

### Transition Rules

The task status pipeline is linear: `idea` → `speccing` → `planning` → `developing` → `done`.

**Forward (allowed by default):**
- `idea` → `speccing`
- `speccing` → `planning`
- `planning` → `developing`
- `developing` → `done`
- Any status → `done` (jump-to-done, requires confirmation and audit)

**Backward (allowed with confirmation and audit):**
- `speccing` → `idea`
- `planning` → `speccing`
- `developing` → `planning`
- `done` → `developing` (reopening)

**Invalid:**
- `idea` → `planning`, `developing`, or `done` (skip phases)
- `speccing` → `developing` or `done` (skip `planning`)
- `planning` → `done` (skip `developing`)

### UI Constraints

The status dropdown in `PropertiesPanel` shows only valid transitions:
- Current `idea` → shows: `speccing`, `done`
- Current `speccing` → shows: `planning`, `idea`, `done`
- Current `planning` → shows: `developing`, `speccing`, `done`
- Current `developing` → shows: `done`, `planning`
- Current `done` → shows: `developing`

Backward transitions are visually marked (e.g., red/orange instead of green).

### API Validation

`updateTask()` and a new `transitionTaskStatus()` function validate transitions:

```typescript
// lib/db/tasks.ts

const VALID_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  'idea': ['speccing', 'done'],
  'speccing': ['planning', 'idea', 'done'],
  'planning': ['developing', 'speccing', 'done'],
  'developing': ['done', 'planning'],
  'done': ['developing']
}

export function transitionTaskStatus(
  db: Database,
  id: string,
  newStatus: TaskStatus,
  reason?: string
): { task: Task; warning?: string } {
  const task = getTask(db, id)
  if (!task) throw new Error(`Task ${id} not found`)

  if (!VALID_TRANSITIONS[task.status].includes(newStatus)) {
    throw new Error(
      `Invalid transition: ${task.status} → ${newStatus}`
    )
  }

  // Check readiness (soft warnings)
  const warnings = checkReadiness(db, task, newStatus)

  const now = new Date().toISOString()
  db.prepare('UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?')
    .run(newStatus, now, id)

  // Log the transition
  logStatusChange(db, id, task.status, newStatus, 'user', reason)

  return {
    task: getTask(db, id)!,
    warning: warnings.length > 0 ? warnings.join('; ') : undefined
  }
}
```

The `updateTask()` function continues to allow direct status setting (for sync service and backward compat), but logs via `logStatusChange()` with `changed_by: 'sync'`.

---

## 2. Readiness Checks

Before advancing to the next phase, check if prerequisite files exist. These are **soft warnings**, not hard blocks—the user can confirm and proceed anyway.

### Rules

| Transition | Check | Behavior |
|---|---|---|
| → `speccing` | none | Always allowed |
| → `planning` | `spec_file` is set | Warn if missing, allow override |
| → `developing` | `plan_file` is set | Warn if missing, allow override |
| → `done` | none | Always allowed |
| backward | none | Always allowed |

### Implementation

```typescript
// lib/db/tasks.ts

function checkReadiness(db: Database, task: Task, newStatus: TaskStatus): string[] {
  const warnings: string[] = []

  if (newStatus === 'planning' && !task.spec_file) {
    warnings.push('Spec file not set. Moving to Planning anyway.')
  }
  if (newStatus === 'developing' && !task.plan_file) {
    warnings.push('Plan file not set. Moving to Developing anyway.')
  }

  // Check unfinished dependencies (see section 4)
  const blockedBy = getTaskDependencies(db, task.id, 'incoming')
  const unfinished = blockedBy.filter(dep => {
    const depTask = getTask(db, dep.depends_on_id)
    return depTask && depTask.status !== 'done'
  })
  if (unfinished.length > 0) {
    warnings.push(
      `${unfinished.length} unfinished dependencies. Proceeding anyway.`
    )
  }

  return warnings
}
```

The confirmation dialog shows these warnings to the user before they proceed.

---

## 3. Status Change Audit Log

Every status change is recorded for visibility and debugging.

### Database Schema

```sql
CREATE TABLE IF NOT EXISTS task_status_log (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id),
  from_status TEXT NOT NULL,
  to_status TEXT NOT NULL,
  changed_by TEXT NOT NULL DEFAULT 'user',
  reason TEXT,
  created_at TEXT NOT NULL
)
```

- `changed_by`: `'user'` (from UI), `'sync'` (from external sync), `'session'` (from session action)
- `reason`: optional human-readable explanation (e.g., "User moved to Planning after completing spec")

### CRUD Module

`lib/db/taskStatusLog.ts`:

```typescript
export type TaskStatusLogEntry = {
  id: string
  task_id: string
  from_status: TaskStatus
  to_status: TaskStatus
  changed_by: 'user' | 'sync' | 'session'
  reason: string | null
  created_at: string
}

export function logStatusChange(
  db: Database,
  taskId: string,
  fromStatus: TaskStatus,
  toStatus: TaskStatus,
  changedBy: 'user' | 'sync' | 'session' = 'user',
  reason?: string
): void {
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  db.prepare(`
    INSERT INTO task_status_log (id, task_id, from_status, to_status, changed_by, reason, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, taskId, fromStatus, toStatus, changedBy, reason ?? null, now)
}

export function getTaskStatusLog(db: Database, taskId: string): TaskStatusLogEntry[] {
  return db.prepare(
    'SELECT * FROM task_status_log WHERE task_id = ? ORDER BY created_at DESC'
  ).all(taskId) as TaskStatusLogEntry[]
}
```

### UI Display

In the task detail view, show a "Status Timeline" section at the bottom:

```
Status Changes
├─ Today at 2:34 PM   idea → speccing   (user)
├─ Yesterday at 10:12 AM   speccing → planning   (user)  [spec: completed]
└─ 2 days ago   planning → developing   (user)  [plan: completed]
```

Each entry shows:
- Time and date
- Status transition arrow
- Actor (`user`, `sync`, or `session`)
- Reason if provided (e.g., `[spec: completed]`)

---

## 4. Task Dependencies

Allow marking tasks as blocked by other tasks. A blocked task shows a warning in the UI and in the confirmation dialog, but can still be advanced.

### Database Schema

```sql
CREATE TABLE IF NOT EXISTS task_dependencies (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id),
  depends_on_id TEXT NOT NULL REFERENCES tasks(id),
  created_at TEXT NOT NULL,
  UNIQUE(task_id, depends_on_id)
)
```

- `task_id`: the task that is blocked
- `depends_on_id`: the task that must be done first

### CRUD Module

`lib/db/taskDependencies.ts`:

```typescript
export type TaskDependency = {
  id: string
  task_id: string
  depends_on_id: string
  created_at: string
}

export function addDependency(db: Database, taskId: string, dependsOnId: string): void {
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  db.prepare(`
    INSERT OR IGNORE INTO task_dependencies (id, task_id, depends_on_id, created_at)
    VALUES (?, ?, ?, ?)
  `).run(id, taskId, dependsOnId, now)
}

export function removeDependency(db: Database, taskId: string, dependsOnId: string): void {
  db.prepare('DELETE FROM task_dependencies WHERE task_id = ? AND depends_on_id = ?')
    .run(taskId, dependsOnId)
}

export function getTaskDependencies(
  db: Database,
  taskId: string,
  direction: 'incoming' | 'outgoing'
): TaskDependency[] {
  if (direction === 'incoming') {
    return db.prepare(
      'SELECT * FROM task_dependencies WHERE task_id = ? ORDER BY created_at DESC'
    ).all(taskId) as TaskDependency[]
  } else {
    return db.prepare(
      'SELECT * FROM task_dependencies WHERE depends_on_id = ? ORDER BY created_at DESC'
    ).all(taskId) as TaskDependency[]
  }
}

export function isTaskBlocked(db: Database, taskId: string): boolean {
  const blocked = db.prepare(
    `SELECT COUNT(*) as count FROM task_dependencies
     WHERE task_id = ? AND depends_on_id IN (
       SELECT id FROM tasks WHERE status != 'done'
     )`
  ).get(taskId) as { count: number }
  return blocked.count > 0
}
```

### UI

#### In `PropertiesPanel`

Add a "Blocked By" section showing:

```
Blocked By
├─ ☐ Task A: Write design spec   (speccing)
└─ ☒ Task B: Implement schema   (done)

Blocking
├─ Task C: Review implementation   (planning)
```

Unfinished dependencies are shown with a checkbox (unchecked). Finished dependencies are faded. The UI allows:
- Hover to see full task details
- Click the X to remove the dependency
- Click "Add dependency" to search and add new ones

#### In Task Cards

Tasks with unfinished dependencies show a "Blocked" badge or icon next to their status badge. Blocked tasks can be reordered but visually indicate they have prerequisites.

#### In Status Change Confirmation

When changing status, if the task has unfinished dependencies, the confirmation dialog shows:

```
Move "Task A" to Planning?

⚠ Warning: 2 unfinished dependencies:
  • Spec writing (speccing)
  • Arch review (speccing)

[Cancel]  [Proceed anyway]
```

---

## 5. Priority-Based Ordering

Task pipeline pages (`/ideas`, `/specs`, `/plans`, `/developing`, `/done`) currently sort by `updated_at DESC`. Change to sort by priority first, then recency.

### Sort Order

Within each status page:
1. Urgent (red)
2. High (orange)
3. Medium (yellow)
4. Low (blue)

Within each priority band, sort by `updated_at DESC`.

### Implementation

Update `getTasksByProject()` in `lib/db/tasks.ts`:

```typescript
const PRIORITY_ORDER: Record<TaskPriority, number> = {
  'urgent': 0,
  'high': 1,
  'medium': 2,
  'low': 3
}

export function getTasksByProject(
  db: Database,
  projectId: string,
  status?: TaskStatus
): Task[] {
  const sql = status
    ? `SELECT * FROM tasks
       WHERE project_id = ? AND status = ?
       ORDER BY 
         (CASE priority
           WHEN 'urgent' THEN 0
           WHEN 'high' THEN 1
           WHEN 'medium' THEN 2
           WHEN 'low' THEN 3
         END),
         updated_at DESC`
    : `SELECT * FROM tasks
       WHERE project_id = ?
       ORDER BY 
         (CASE priority
           WHEN 'urgent' THEN 0
           WHEN 'high' THEN 1
           WHEN 'medium' THEN 2
           WHEN 'low' THEN 3
         END),
         updated_at DESC`
  
  return status
    ? db.prepare(sql).all(projectId, status) as Task[]
    : db.prepare(sql).all(projectId) as Task[]
}
```

---

## 6. Status Change Confirmation Dialog

When the user clicks the status dropdown or a "Start X" action button, a confirmation dialog appears before the status changes.

### UI Component

`components/tasks/StatusConfirmationDialog.tsx`:

```typescript
interface StatusConfirmationDialogProps {
  isOpen: boolean
  task: Task
  targetStatus: TaskStatus
  warnings: string[]
  isBlocked: boolean
  blockedByTasks: Task[]
  onConfirm: () => void
  onCancel: () => void
}

export function StatusConfirmationDialog(props: StatusConfirmationDialogProps) {
  return (
    <Dialog open={props.isOpen} onOpenChange={(open) => !open && props.onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Move "{props.task.title}" to {formatStatus(props.targetStatus)}?
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Readiness warnings */}
          {props.warnings.length > 0 && (
            <Alert variant="warning">
              <AlertTitle>Readiness Check</AlertTitle>
              <AlertDescription>
                <ul className="list-disc pl-5 space-y-1">
                  {props.warnings.map((w, i) => <li key={i}>{w}</li>)}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {/* Dependency warnings */}
          {props.isBlocked && (
            <Alert variant="warning">
              <AlertTitle>Blocked By Dependencies</AlertTitle>
              <AlertDescription>
                <p className="mb-2">These tasks must be done first:</p>
                <ul className="space-y-1">
                  {props.blockedByTasks.map(t => (
                    <li key={t.id} className="text-sm">
                      {t.title} • <StatusBadge status={t.status} />
                    </li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {/* Backward transition warning */}
          {isBackwardTransition(props.task.status, props.targetStatus) && (
            <Alert variant="warning">
              <AlertTitle>Moving Backward</AlertTitle>
              <AlertDescription>
                This won't delete existing work in {formatStatus(props.task.status)},
                but it signals a change in direction.
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={props.onCancel}>
            Cancel
          </Button>
          <Button onClick={props.onConfirm}>
            {props.warnings.length > 0 ? 'Proceed Anyway' : 'Confirm'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

### Flow

1. User clicks status dropdown or action button
2. `StatusConfirmationDialog` opens with task details, transition rules, and any warnings
3. User clicks "Confirm" or "Proceed Anyway"
4. Frontend calls `PATCH /api/tasks/:id` with `status` and optional `reason`
5. Backend validates, logs, and returns updated task
6. Dialog closes, task card updates

### API Route

`app/api/tasks/[id]/route.ts` adds a PATCH handler:

```typescript
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const projectId = getProjectIdFromSession()
  const body = await req.json() as { status: TaskStatus; reason?: string }

  const db = getDb()
  const task = getTask(db, params.id)

  if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (task.project_id !== projectId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const result = transitionTaskStatus(db, params.id, body.status, body.reason)
    return NextResponse.json(result.task)
  } catch (e) {
    return NextResponse.json(
      { error: String(e) },
      { status: 400 }
    )
  }
}
```

---

## 7. File Structure

### Created

| File | Responsibility |
|------|----------------|
| `lib/db/taskStatusLog.ts` | CRUD for `task_status_log` table |
| `lib/db/taskDependencies.ts` | CRUD for `task_dependencies` table |
| `components/tasks/StatusConfirmationDialog.tsx` | Confirmation dialog for status changes |
| `components/tasks/StatusTimeline.tsx` | Timeline view of status changes in task detail |
| `components/tasks/DependencyPanel.tsx` | "Blocked By" and "Blocking" sections in PropertiesPanel |

### Modified

| File | Change |
|------|--------|
| `lib/db.ts` | Add `task_status_log` and `task_dependencies` tables in migration |
| `lib/db/tasks.ts` | Add `VALID_TRANSITIONS`, `transitionTaskStatus()`, `checkReadiness()`, update `getTasksByProject()` to sort by priority |
| `components/tasks/PropertiesPanel.tsx` | Update status dropdown to show only valid transitions; add `DependencyPanel` |
| `app/(dashboard)/projects/[projectId]/tasks/page.tsx` | Use new sort order in task grids |
| `app/api/tasks/[id]/route.ts` | Add PATCH handler for status transitions |

### Test Files

| File | Coverage |
|------|----------|
| `lib/__tests__/taskStatusLog.test.ts` | CRUD operations, logging |
| `lib/__tests__/taskDependencies.test.ts` | Add, remove, query dependencies |
| `lib/__tests__/tasks.test.ts` | Valid/invalid transitions, readiness checks, soft blocks |
| `components/__tests__/StatusConfirmationDialog.test.tsx` | Dialog rendering, warnings display, confirm/cancel |
| `components/__tests__/DependencyPanel.test.tsx` | Render blocked-by list, add/remove dependencies |

---

## 8. Data Flow

```
User clicks status dropdown
  → StatusConfirmationDialog opens
    → checkReadiness() → warnings
    → getTaskDependencies(..., 'incoming') → blocked-by list
    → isTaskBlocked() → render warning badge

User clicks "Confirm"
  → PATCH /api/tasks/:id { status, reason? }
    → transitionTaskStatus()
      → validate transition (VALID_TRANSITIONS)
      → checkReadiness() (soft warnings only)
      → UPDATE tasks SET status = ?, updated_at = ?
      → logStatusChange() → INSERT into task_status_log
    → Return updated task + warning messages
  → Dialog closes
  → Task card updates
  → Status timeline refreshes

Task detail view loads
  → getTaskStatusLog(taskId) → TaskStatusLogEntry[]
  → StatusTimeline renders chronological list
  → getTaskDependencies(taskId, 'incoming') / 'outgoing'
  → DependencyPanel renders blocked-by and blocking lists

Pipeline page loads (e.g., /plans)
  → getTasksByProject(projectId, 'planning')
  → ORDER BY priority, updated_at DESC
  → Tasks render in urgency order (urgent → high → medium → low)
```

---

## 9. Backward Compatibility

- The existing `setTaskStatus()` function (used by sync service) continues to work but logs with `changed_by: 'sync'`
- The `updateTask()` function with `status` field continues to work but logs with `changed_by: 'sync'`
- The `advanceTaskStatus()` function remains unchanged and is deprecated (UI uses `transitionTaskStatus()` instead)
- Old tasks without status log entries have no timeline—the timeline is optional in the UI
- Priority sorting is a display-only change; no data migration needed

