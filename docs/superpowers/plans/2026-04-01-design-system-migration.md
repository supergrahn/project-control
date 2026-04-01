# Design System Migration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate all 76 existing files from inline styles and raw Tailwind colors to the design system tokens and shared components.

**Architecture:** Each task targets a group of related files. The migration is mechanical: replace inline `style={{}}` objects with Tailwind token classes, swap raw Tailwind colors (zinc-*, violet-*, emerald-*) for semantic tokens (bg-bg-primary, text-text-secondary, etc.), and replace raw HTML elements with design system components (Button, Input, Modal, etc.).

**Tech Stack:** Tailwind CSS v4.2, React, design system components at `components/ui/`

---

## Migration Rules

Every task follows these transformation rules. The agent must read each file, apply ALL applicable rules, and verify the result.

### Color Token Mapping

| Inline / Raw Tailwind | Design System Token |
|---|---|
| `#0c0e10`, `#0d0e10`, `bg-zinc-950` | `bg-bg-base` |
| `#0e1012`, `bg-zinc-900` | `bg-bg-primary` |
| `#141618` | `bg-bg-secondary` |
| `#1a1d20` | `bg-bg-tertiary` |
| `#00000088`, `rgba(0,0,0,0.53)` | `bg-bg-overlay` |
| `#1c1f22`, `border-zinc-800` | `border-border-default` |
| `#1e2124` | `border-border-subtle` |
| `#2a2f35` | `border-border-hover` |
| `#2e3338`, `border-zinc-700` | `border-border-strong` |
| `#e2e6ea`, `#e8eaed`, `#c8ced6`, `text-zinc-100`, `text-zinc-200` | `text-text-primary` |
| `#8a9199`, `text-zinc-400` | `text-text-secondary` |
| `#5a6370`, `text-zinc-500` | `text-text-muted` |
| `#454c54`, `text-zinc-600` | `text-text-faint` |
| `#2e3338` (text context) | `text-text-disabled` |
| `#5b9bd5`, `text-violet-400`, `bg-violet-500/*` | `text-accent-blue` / `bg-accent-blue/*` |
| `#3a8c5c`, `text-emerald-400`, `bg-emerald-500/*` | `text-accent-green` / `bg-accent-green/*` |
| `#8f77c9` | `text-accent-purple` / `bg-accent-purple/*` |
| `#c97e2a`, `text-amber-400`, `bg-amber-500/*` | `text-accent-orange` / `bg-accent-orange/*` |
| `#c04040`, `text-red-400`, `bg-red-500/*` | `text-accent-red` / `bg-accent-red/*` |
| `#3a8c5c` (success context) | `text-status-success` |
| `#c9a227` | `text-status-warning` |
| `#d94747` | `text-status-error` |
| `#5b9bd5` (info context) | `text-status-info` |

### Spacing Token Mapping

| Inline Value | Tailwind Token |
|---|---|
| `padding: 24` / `padding: 28` | `p-[var(--spacing-section)]` or `p-6` |
| `padding: 16` | `p-[var(--spacing-card)]` or `p-4` |
| `padding: 14` | `p-[var(--spacing-card-sm)]` |
| `gap: 12` | `gap-[var(--spacing-group)]` or `gap-3` |
| `gap: 8` | `gap-[var(--spacing-element)]` or `gap-2` |
| `borderRadius: 10` | `rounded-[var(--radius-card)]` |
| `borderRadius: 6` | `rounded-[var(--radius-control)]` |

### Component Replacement Rules

1. **Buttons**: Any `<button style={{...}}>` → `<Button variant="primary|secondary|danger|ghost">`. Import from `@/components/ui`.
2. **Inputs**: Any `<input style={{...}}>` → `<Input label="..." />`. Import from `@/components/ui`.
3. **Textareas**: Any `<textarea style={{...}}>` → `<Textarea label="..." />`.
4. **Selects**: Any `<select style={{...}}>` → `<Select label="..." options={[...]} />`.
5. **Modals**: Any `<div style={{position:'fixed',inset:0,...}}>` overlay pattern → `<Modal open={...} onClose={...} title="...">`.
6. **Empty states**: Any centered "No items yet" / "Nothing here" text → `<EmptyState title="..." />`.
7. **Status badges**: Any `<span style={{...badge styles...}}>Active</span>` → `<Badge color="accent-green">Active</Badge>`.
8. **Section headers**: Any `<div style={{color:'#5a6370',fontSize:11,...uppercase}}>LABEL</div>` → `<SectionHeader title="Label" />`.
9. **Cards**: Any `<div style={{background:'#141618',border:'1px solid #1e2124',borderRadius:10,...}}>` → `<Card>`.
10. **Drawers**: Any fixed right/left panel pattern → `<Drawer>`.

### Inline Style → className Conversion

For elements that don't map to a design system component, convert inline styles to Tailwind:
- `style={{ display: 'flex', gap: 8 }}` → `className="flex gap-2"`
- `style={{ fontSize: 13, color: '#8a9199' }}` → `className="text-[13px] text-text-secondary"`
- `style={{ background: '#141618', border: '1px solid #1c1f22', borderRadius: 6, padding: '8px 12px' }}` → `className="bg-bg-secondary border border-border-default rounded-[var(--radius-control)] px-3 py-2"`

### Test Verification

After migrating each batch of files, run:
```
npx vitest run
```
All existing tests must continue to pass. If a test checks for specific inline styles (e.g., `toHaveStyle`), update the test to check for className instead.

---

### Task 1: Layout Chrome

**Files:**
- Modify: `components/layout/Sidebar.tsx`
- Modify: `components/layout/TopBar.tsx`
- Modify: `components/layout/ProjectRail.tsx`
- Modify: `app/(dashboard)/layout.tsx`

- [ ] **Step 1: Read all 4 files**

- [ ] **Step 2: Migrate Sidebar.tsx**

Replace all inline `style={{}}` with Tailwind token classes. The sidebar uses:
- `width: 240px` → `w-[240px]`
- `background: #0c0e10` → `bg-bg-base`
- `borderRight: 1px solid #1c1f22` → `border-r border-border-default`
- All nav item colors, font sizes, spacing → token classes
- Replace any raw button elements with `<Button variant="ghost">`

- [ ] **Step 3: Migrate TopBar.tsx**

Replace all inline styles. The top bar uses:
- `height: 38px` → `h-[38px]`
- Similar color/border patterns → token classes
- Settings gear icon → `<IconButton>`

- [ ] **Step 4: Migrate ProjectRail.tsx**

Replace inline styles:
- `width: 44px` → `w-[44px]`
- Dot colors use phase constants — import from `lib/constants/phases.ts`

- [ ] **Step 5: Migrate layout.tsx inline styles**

The layout has 4 inline style objects on container divs. Convert to Tailwind:
- `style={{ display: 'flex', height: '100vh', background: '#0e1012', overflow: 'hidden' }}` → `className="flex h-screen bg-bg-primary overflow-hidden"`
- Similarly for the other flex containers

- [ ] **Step 6: Run tests**

Run: `npx vitest run`
Expected: All tests pass. Fix any test failures caused by the migration (e.g., tests checking for inline styles).

- [ ] **Step 7: Commit**

```bash
git commit -am "refactor: migrate layout chrome to design system tokens"
```

---

### Task 2: Task Components

**Files:**
- Modify: `components/tasks/TaskCard.tsx`
- Modify: `components/tasks/TaskDetailView.tsx`
- Modify: `components/tasks/PropertiesPanel.tsx`
- Modify: `components/tasks/CreateTaskModal.tsx`
- Modify: `components/tasks/LiveRunsSection.tsx`
- Modify: `components/tasks/SessionInput.tsx`
- Delete: `components/tasks/RightDrawer.tsx` (replaced by `components/ui/layout/Drawer.tsx`)

- [ ] **Step 1: Read all files**

- [ ] **Step 2: Migrate TaskCard.tsx**

This is the most-used card component. Replace:
- Card container → `<Card accentColor={PHASE_COLORS[task.status]}>`
- Status badge → `<Badge variant="phase" color={PHASE_COLORS[task.status]}>`
- Priority chip → `<Badge variant="priority" color={PRIORITY_COLORS[task.priority]}>`
- Action buttons → `<Button variant="primary" size="sm">`
- Import PHASE_COLORS, PRIORITY_COLORS from `@/lib/constants/phases`
- All inline font sizes, colors, spacing → token classes

- [ ] **Step 3: Migrate TaskDetailView.tsx**

Replace inline styles with token classes. Use `<SectionHeader>` for section labels, `<Button>` for actions.

- [ ] **Step 4: Migrate PropertiesPanel.tsx**

Replace:
- Select dropdowns → `<Select>`
- Input fields → `<Input>`
- Badge styles → `<Badge>`
- All inline colors/spacing → token classes

- [ ] **Step 5: Migrate CreateTaskModal.tsx**

Replace the entire modal overlay pattern with `<Modal>`:
- The fixed overlay div → `<Modal open={...} onClose={...} title="New Task" width="md">`
- Input fields → `<Input>`, `<Textarea>`
- Select fields → `<Select>`
- Buttons → `<Button>`

- [ ] **Step 6: Migrate LiveRunsSection.tsx and SessionInput.tsx**

Replace inline styles with token classes. Use `<Badge>` for status indicators, `<Button>` for actions, `<Input>` for session input.

- [ ] **Step 7: Handle RightDrawer.tsx**

Check if any file imports `RightDrawer`. If so, update those imports to use `<Drawer>` from `@/components/ui`. Then delete `components/tasks/RightDrawer.tsx`.

- [ ] **Step 8: Run tests and fix**

Run: `npx vitest run`

The task component tests (`components/__tests__/TaskCard.test.tsx`, `TaskDetailView*.test.tsx`, `PropertiesPanel.test.tsx`, `CreateTaskModal.test.tsx`, etc.) may need updates if they check for inline styles or specific HTML structure. Update test assertions to match the new component-based markup.

- [ ] **Step 9: Commit**

```bash
git commit -am "refactor: migrate task components to design system"
```

---

### Task 3: Dashboard & Agent Components

**Files:**
- Modify: `components/dashboard/SessionAgentCard.tsx`
- Modify: `components/dashboard/ActivityPanel.tsx`
- Modify: `components/agents/AgentCard.tsx`
- Modify: `components/agents/CreateAgentModal.tsx`
- Modify: `components/agents/SkillsTab.tsx`
- Modify: `app/(dashboard)/projects/[projectId]/page.tsx`
- Modify: `app/(dashboard)/projects/[projectId]/agents/page.tsx`
- Modify: `app/(dashboard)/projects/[projectId]/agents/[agentId]/page.tsx`

- [ ] **Step 1: Read all files**

- [ ] **Step 2: Migrate SessionAgentCard.tsx**

Replace:
- Card container → `<Card padding="sm">`
- Status dots → `<Badge variant="status" color={...}>`
- All inline colors → token classes

- [ ] **Step 3: Migrate ActivityPanel.tsx**

Replace:
- Panel container: `width: 248px` → `w-[248px]`, background/border → token classes
- Section labels → `<SectionHeader>`
- Dividers → `<Divider>`
- All inline colors → token classes

- [ ] **Step 4: Migrate AgentCard.tsx**

Replace card container → `<Card variant="interactive">`, status dots → `<Badge>`, all inline styles → tokens.

- [ ] **Step 5: Migrate CreateAgentModal.tsx**

Replace overlay pattern → `<Modal>`, inputs → `<Input>`, selects → `<Select>`, buttons → `<Button>`.

- [ ] **Step 6: Migrate SkillsTab.tsx**

Replace inline styles with token classes. Use `<Card>`, `<Badge>`, `<Button>`.

- [ ] **Step 7: Migrate project dashboard page and agent pages**

For each page:
- Replace inline grid styles → `className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3"`
- Replace empty state text → `<EmptyState>`
- Replace buttons → `<Button>`
- Replace all inline colors → token classes

- [ ] **Step 8: Run tests and fix**

Run: `npx vitest run`
Fix any failures in `AgentCard.test.tsx`, `CreateAgentModal.test.tsx`, `SessionAgentCard.test.tsx`, `ActivityPanel.test.tsx`.

- [ ] **Step 9: Commit**

```bash
git commit -am "refactor: migrate dashboard and agent components to design system"
```

---

### Task 4: Pipeline Pages

**Files:**
- Modify: `app/(dashboard)/projects/[projectId]/ideas/page.tsx`
- Modify: `app/(dashboard)/projects/[projectId]/specs/page.tsx`
- Modify: `app/(dashboard)/projects/[projectId]/plans/page.tsx`
- Modify: `app/(dashboard)/projects/[projectId]/developing/page.tsx`
- Modify: `app/(dashboard)/projects/[projectId]/done/page.tsx`

- [ ] **Step 1: Read all 5 files**

These pages follow the same pattern — a grid of TaskCards with a "Create Task" button and empty state.

- [ ] **Step 2: Migrate all 5 pages**

For each:
- Replace `style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}` → `className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-2.5"`
- Replace inline padding/colors → token classes
- Replace "Create Task" button → `<Button variant="primary">`
- Replace empty state text → `<EmptyState title="No tasks in this stage" />`
- Replace any inline header styles → token classes

- [ ] **Step 3: Run tests**

Run: `npx vitest run`

- [ ] **Step 4: Commit**

```bash
git commit -am "refactor: migrate pipeline pages to design system"
```

---

### Task 5: Settings Pages

**Files:**
- Modify: `app/(dashboard)/settings/page.tsx`
- Modify: `app/(dashboard)/settings/providers/page.tsx`
- Modify: `app/(dashboard)/projects/[projectId]/settings/page.tsx`
- Modify: `app/(dashboard)/projects/[projectId]/skills/page.tsx`

- [ ] **Step 1: Read all files**

- [ ] **Step 2: Migrate global settings page**

Replace:
- Input fields → `<Input>`
- Select dropdowns → `<Select>`
- Save buttons → `<Button>`
- Section headers → `<SectionHeader>`
- All inline colors/spacing → token classes

- [ ] **Step 3: Migrate providers page**

This is a large file (43 inline styles). Replace:
- Provider cards → `<Card>`
- Config inputs → `<Input>`
- Test button → `<Button>`
- Status badges → `<Badge>`
- Modal patterns → `<Modal>`
- All inline styles → token classes

- [ ] **Step 4: Migrate project settings page**

Replace:
- "Run Migration" button → `<Button variant="secondary">`
- `<TaskSourceSettings>` section wrapper → token classes
- Success message → toast or inline with token classes

- [ ] **Step 5: Migrate skills page**

Replace inline styles with token classes. Use `<Card>`, `<Badge>`, `<Button>`.

- [ ] **Step 6: Run tests and fix**

Run: `npx vitest run`

- [ ] **Step 7: Commit**

```bash
git commit -am "refactor: migrate settings and skills pages to design system"
```

---

### Task 6: Modal Components

**Files:**
- Modify: `components/IdeaCaptureModal.tsx`
- Modify: `components/DailyPlanModal.tsx`
- Modify: `components/PasteModal.tsx`
- Modify: `components/StandupModal.tsx`
- Modify: `components/WeeklyReviewModal.tsx`
- Modify: `components/ShortcutGuide.tsx`
- Modify: `components/ProjectSwitcherModal.tsx`
- Modify: `components/NewFileDialog.tsx`

- [ ] **Step 1: Read all files**

- [ ] **Step 2: Migrate each modal**

Each of these follows a similar pattern: a fixed overlay with a content box. For each:
- Replace the overlay `<div className="fixed inset-0 z-50 bg-black/50...">` → use `<Modal open={isOpen} onClose={onClose} title="...">`
- Move content inside `<Modal>` as children
- Replace input fields → `<Input>`, `<Textarea>`
- Replace buttons → `<Button>`
- Replace raw Tailwind colors (zinc-*, violet-*) → token classes
- Ensure Escape key handling is removed (Modal handles it)

- [ ] **Step 3: Run tests**

Run: `npx vitest run`

- [ ] **Step 4: Commit**

```bash
git commit -am "refactor: migrate modal components to design system Modal"
```

---

### Task 7: Drawer Components

**Files:**
- Modify: `components/DiffDrawer.tsx`
- Modify: `components/FileDrawer.tsx`
- Modify: `components/MemoryDrawer.tsx`
- Modify: `components/OrchestratorDrawer.tsx`
- Modify: `components/nav/NavDrawer.tsx`
- Modify: `components/AssistantPanel.tsx`

- [ ] **Step 1: Read all files**

- [ ] **Step 2: Migrate each drawer**

For each file that implements a sliding panel:
- If the component uses its own fixed positioning and overlay, replace with `<Drawer open={...} onClose={...} title="..." width="lg">`
- If the component is a simple panel (no overlay), just convert inline styles / raw Tailwind to token classes
- Replace raw zinc-*/violet-* colors → token classes
- Replace buttons → `<Button>`

Note: Some of these may not be pure drawer patterns (e.g., AssistantPanel has its own complex layout). For those, just do the color/spacing token swap without forcing a Drawer component.

- [ ] **Step 3: Run tests**

Run: `npx vitest run`

- [ ] **Step 4: Commit**

```bash
git commit -am "refactor: migrate drawer components to design system"
```

---

### Task 8: Navigation Components

**Files:**
- Modify: `components/nav/TopNav.tsx`
- Modify: `components/nav/ProjectTabs.tsx`
- Modify: `components/nav/ProjectPicker.tsx`
- Modify: `components/CommandPalette.tsx`

- [ ] **Step 1: Read all files**

- [ ] **Step 2: Migrate each navigation component**

These use raw Tailwind colors extensively. Replace:
- `zinc-950` → `bg-bg-base`
- `zinc-900` → `bg-bg-primary`
- `zinc-800` → `border-border-default`
- `zinc-700` → `border-border-strong`
- `zinc-500` → `text-text-muted`
- `zinc-400` → `text-text-secondary`
- `zinc-300` → `text-text-primary`
- `zinc-100` → `text-text-primary`
- `violet-400` → `text-accent-blue`
- `violet-500/20` → `bg-accent-blue/20`
- `emerald-400` → `text-accent-green`
- `amber-400` → `text-accent-orange`
- `red-400` → `text-accent-red`
- `green-400` / `green-600` → `text-accent-green`

Replace buttons → `<Button>`, inputs → `<Input>`.

- [ ] **Step 3: Run tests**

Run: `npx vitest run`

- [ ] **Step 4: Commit**

```bash
git commit -am "refactor: migrate navigation components to design system tokens"
```

---

### Task 9: Session & Card Components

**Files:**
- Modify: `components/FloatingSessionWindow.tsx`
- Modify: `components/SessionPillBar.tsx`
- Modify: `components/SessionCard.tsx`
- Modify: `components/cards/MarkdownCard.tsx`
- Modify: `components/cards/SessionCard.tsx`

- [ ] **Step 1: Read all files**

- [ ] **Step 2: Migrate each component**

Replace raw Tailwind colors with tokens:
- `emerald-500/30` → `accent-green/30`
- `emerald-400` → `accent-green`
- `emerald-500/10` → `accent-green/10`
- `zinc-*` → appropriate token
- `violet-*` → `accent-blue/*`
- `red-*` → `accent-red/*`

Use `<Card>` where card patterns exist. Use `<Badge>` for status indicators.

- [ ] **Step 3: Run tests**

Run: `npx vitest run`

- [ ] **Step 4: Commit**

```bash
git commit -am "refactor: migrate session and card components to design system"
```

---

### Task 10: Remaining Miscellaneous Components

**Files:**
- Modify: `components/ClaudeNotFound.tsx`
- Modify: `components/SetupPrompt.tsx`
- Modify: `components/QuickCapture.tsx`
- Modify: `components/OrchestratorFeed.tsx`
- Modify: `components/DevelopingView.tsx`
- Modify: `components/CardGrid.tsx`

- [ ] **Step 1: Read all files**

- [ ] **Step 2: Migrate each component**

Replace raw Tailwind colors (zinc-*, violet-*, etc.) with token classes. Use `<Button>`, `<Card>`, `<Badge>` where applicable.

- [ ] **Step 3: Run tests**

Run: `npx vitest run`

- [ ] **Step 4: Commit**

```bash
git commit -am "refactor: migrate miscellaneous components to design system"
```

---

### Task 11: External Task Source Components

**Files:**
- Modify: `components/projects/DynamicConfigForm.tsx`
- Modify: `components/projects/TaskSourceSettings.tsx`
- Modify: `components/projects/NewProjectWizard.tsx`

- [ ] **Step 1: Read all 3 files**

- [ ] **Step 2: Migrate DynamicConfigForm.tsx**

This component currently uses inline styles for form elements. Replace:
- Input fields → `<Input>` from design system
- Textarea → `<Textarea>`
- Password fields → `<PasswordInput>`
- Submit button → `<Button variant="primary">`
- The local ConfigField type can remain (it's a prop type, not a UI type)
- All inline style objects → remove entirely, use token classes

- [ ] **Step 3: Migrate TaskSourceSettings.tsx**

Replace:
- Service picker buttons → `<Button variant="secondary">`
- Status badges → `<Badge>`
- Error/warning messages → token classes
- "Sync Now" → `<Button variant="primary">`
- "Pause"/"Resume"/"Edit"/"Remove" → `<Button variant="secondary">` / `<Button variant="danger">`
- Confirmation dialog → could use `<Card>` with token classes, or `<Modal>`
- Checkbox → `<Checkbox>`
- All inline style objects → token classes

- [ ] **Step 4: Migrate NewProjectWizard.tsx**

This is the largest file (61 inline styles). Replace:
- Modal overlay → `<Modal>`
- Step indicators → `<Badge>`
- Input fields → `<Input>`, `<Select>`
- Buttons → `<Button>`
- All inline styles → token classes

- [ ] **Step 5: Run tests**

Run: `npx vitest run`
Fix any failures in `DynamicConfigForm.test.tsx`, `TaskSourceSettings.test.tsx`, `NewProjectWizard.test.tsx`.

- [ ] **Step 6: Commit**

```bash
git commit -am "refactor: migrate external task source components to design system"
```

---

### Task 12: Remaining Dashboard Pages (Token Swap)

**Files:**
- Modify: `app/(dashboard)/bookmarks/page.tsx`
- Modify: `app/(dashboard)/compare/page.tsx`
- Modify: `app/(dashboard)/context/page.tsx`
- Modify: `app/(dashboard)/git-activity/page.tsx`
- Modify: `app/(dashboard)/insights/page.tsx`
- Modify: `app/(dashboard)/kanban/page.tsx`
- Modify: `app/(dashboard)/memory/page.tsx`
- Modify: `app/(dashboard)/search/page.tsx`
- Modify: `app/(dashboard)/tech-audit/page.tsx`
- Modify: `app/(dashboard)/templates/page.tsx`
- Modify: `app/(dashboard)/timeline/page.tsx`
- Modify: `app/(dashboard)/usage/page.tsx`
- Modify: `app/(dashboard)/projects/[projectId]/reports/page.tsx`

- [ ] **Step 1: Read all files**

These pages already use Tailwind but with raw color classes.

- [ ] **Step 2: Token swap all 13 pages**

For each file, find-and-replace:
- `zinc-950` → `bg-base`
- `zinc-900` → `bg-primary`
- `zinc-800` → `border-default`
- `zinc-700` → `border-strong`
- `zinc-600` → `text-faint`
- `zinc-500` → `text-muted`
- `zinc-400` → `text-secondary`
- `zinc-300` → `text-primary`
- `zinc-200` → `text-primary`
- `zinc-100` → `text-primary`
- `violet-400` → `accent-blue`
- `violet-300` → `accent-blue`
- `violet-500` → `accent-blue`
- `emerald-400` → `accent-green`
- `emerald-300` → `accent-green`
- `emerald-500` → `accent-green`
- `amber-400` → `accent-orange`
- `amber-300` → `accent-orange`
- `amber-500` → `accent-orange`
- `red-400` → `accent-red`
- `red-500` → `accent-red`
- `green-400` → `accent-green`
- `green-600` → `accent-green`
- `blue-400` → `accent-blue`

Also replace any `<button>` elements with `<Button>` and empty state text with `<EmptyState>` where applicable.

- [ ] **Step 3: Run tests**

Run: `npx vitest run`

- [ ] **Step 4: Commit**

```bash
git commit -am "refactor: token-swap remaining dashboard pages to design system"
```

---

## Summary

| Task | Files | Scope |
|------|-------|-------|
| 1 | 4 | Layout chrome (Sidebar, TopBar, ProjectRail, layout) |
| 2 | 7 | Task components (TaskCard, detail, modal, etc.) |
| 3 | 8 | Dashboard + agent components |
| 4 | 5 | Pipeline pages (ideas through done) |
| 5 | 4 | Settings + skills pages |
| 6 | 8 | Modal components |
| 7 | 6 | Drawer components |
| 8 | 4 | Navigation components |
| 9 | 5 | Session + card components |
| 10 | 6 | Miscellaneous components |
| 11 | 3 | External task source components |
| 12 | 13 | Remaining pages (token swap) |

**Total: 12 tasks, 73 files migrated**
