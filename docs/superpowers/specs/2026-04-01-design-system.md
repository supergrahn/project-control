# Design System — Spec

**Goal:** Replace all inline styles and ad-hoc Tailwind usage with a formal, token-driven design system. One source of truth for colors, spacing, typography. One set of shared components used everywhere. Full sweep — every page and component migrated.

**Principles:**
- Tokens first — every visual value comes from the theme, never hardcoded
- Swap the palette by editing one file
- Components enforce consistency — you can't accidentally use the wrong button style
- Tailwind CSS for all styling — no inline `style={{ }}` objects
- Grouped component library under `components/ui/`

---

## 1. Tailwind Configuration & Theme Tokens

### Setup

Install Tailwind CSS and configure `tailwind.config.ts` as the single source of design tokens. All existing hex values and spacing numbers move here.

```
npm install -D tailwindcss @tailwindcss/postcss postcss
```

`postcss.config.js`:
```js
module.exports = { plugins: { '@tailwindcss/postcss': {} } }
```

`app/globals.css`:
```css
@import "tailwindcss";
```

### Token Categories

#### Colors (by role)

```typescript
// tailwind.config.ts — theme.extend.colors
colors: {
  bg: {
    base:      'var(--color-bg-base)',       // #0c0e10 — app chrome, sidebars
    primary:   'var(--color-bg-primary)',     // #0e1012 — main content area
    secondary: 'var(--color-bg-secondary)',   // #141618 — cards, inputs
    tertiary:  'var(--color-bg-tertiary)',    // #1a1d20 — elevated surfaces
    overlay:   'var(--color-bg-overlay)',     // #00000088 — modal backdrop
  },
  border: {
    default:   'var(--color-border-default)', // #1c1f22
    subtle:    'var(--color-border-subtle)',  // #1e2124
    hover:     'var(--color-border-hover)',   // #2a2f35
    strong:    'var(--color-border-strong)',  // #2e3338
  },
  text: {
    primary:   'var(--color-text-primary)',   // #e2e6ea
    secondary: 'var(--color-text-secondary)', // #8a9199
    muted:     'var(--color-text-muted)',     // #5a6370
    faint:     'var(--color-text-faint)',     // #454c54
    disabled:  'var(--color-text-disabled)',  // #2e3338
  },
  accent: {
    blue:      'var(--color-accent-blue)',    // #5b9bd5
    green:     'var(--color-accent-green)',   // #3a8c5c
    purple:    'var(--color-accent-purple)',  // #8f77c9
    orange:    'var(--color-accent-orange)',  // #c97e2a
    red:       'var(--color-accent-red)',     // #c04040
  },
  status: {
    success:   'var(--color-status-success)', // #3a8c5c
    warning:   'var(--color-status-warning)', // #c9a227
    error:     'var(--color-status-error)',   // #d94747
    info:      'var(--color-status-info)',    // #5b9bd5
  },
}
```

CSS variables are defined in `app/globals.css` so the palette is swappable without touching Tailwind config:

```css
:root {
  --color-bg-base: #0c0e10;
  --color-bg-primary: #0e1012;
  --color-bg-secondary: #141618;
  --color-bg-tertiary: #1a1d20;
  --color-bg-overlay: rgba(0, 0, 0, 0.53);

  --color-border-default: #1c1f22;
  --color-border-subtle: #1e2124;
  --color-border-hover: #2a2f35;
  --color-border-strong: #2e3338;

  --color-text-primary: #e2e6ea;
  --color-text-secondary: #8a9199;
  --color-text-muted: #5a6370;
  --color-text-faint: #454c54;
  --color-text-disabled: #2e3338;

  --color-accent-blue: #5b9bd5;
  --color-accent-green: #3a8c5c;
  --color-accent-purple: #8f77c9;
  --color-accent-orange: #c97e2a;
  --color-accent-red: #c04040;

  --color-status-success: #3a8c5c;
  --color-status-warning: #c9a227;
  --color-status-error: #d94747;
  --color-status-info: #5b9bd5;
}
```

#### Phase Colors

Used throughout for task pipeline. Defined as a shared constant alongside the tokens since they map to domain concepts:

```typescript
// lib/constants/phases.ts
export const PHASE_COLORS = {
  idea:       'accent-blue',
  speccing:   'accent-green',
  planning:   'accent-purple',
  developing: 'accent-orange',
  done:       'accent-red',
} as const

export const PRIORITY_COLORS = {
  low:    'text-muted',
  medium: 'accent-blue',
  high:   'accent-orange',
  urgent: 'accent-red',
} as const
```

#### Typography

```typescript
// tailwind.config.ts — theme.extend.fontSize
fontSize: {
  heading:  ['16px', { lineHeight: '1.4', fontWeight: '700' }],
  label:    ['12px', { lineHeight: '1.4', fontWeight: '600' }],
  body:     ['13px', { lineHeight: '1.5', fontWeight: '400' }],
  caption:  ['11px', { lineHeight: '1.4', fontWeight: '400' }],
  tiny:     ['10px', { lineHeight: '1.3', fontWeight: '600' }],
}
```

#### Spacing

Use Tailwind's default spacing scale (multiples of 4px). Define semantic aliases for recurring layout patterns:

```typescript
// tailwind.config.ts — theme.extend.spacing
spacing: {
  'section': '24px',   // between major sections
  'card':    '16px',    // card internal padding
  'card-sm': '14px',    // compact card padding
  'group':   '12px',    // between related items
  'element': '8px',     // between sibling elements
  'tight':   '4px',     // tight inline spacing
}
```

#### Border Radius

```typescript
// tailwind.config.ts — theme.extend.borderRadius
borderRadius: {
  card: '10px',
  control: '6px',
  badge: '4px',
  pill: '9999px',
}
```

---

## 2. Component Library

### Structure

```
components/ui/
├── forms/
│   ├── Input.tsx
│   ├── Textarea.tsx
│   ├── Select.tsx
│   ├── Checkbox.tsx
│   └── PasswordInput.tsx
├── buttons/
│   ├── Button.tsx
│   └── IconButton.tsx
├── feedback/
│   ├── Badge.tsx
│   ├── EmptyState.tsx
│   ├── ErrorBoundary.tsx
│   ├── Skeleton.tsx
│   └── Toast.tsx
├── layout/
│   ├── Card.tsx
│   ├── Drawer.tsx
│   ├── Modal.tsx
│   ├── SectionHeader.tsx
│   └── Divider.tsx
├── data/
│   ├── Tooltip.tsx
│   └── KeyValue.tsx
└── index.ts
```

### Component Specs

#### Button (`components/ui/buttons/Button.tsx`)

Replaces 4+ inline button patterns used 50+ times across the codebase.

```typescript
type ButtonProps = {
  variant: 'primary' | 'secondary' | 'danger' | 'ghost'
  size?: 'sm' | 'md'
  loading?: boolean
  disabled?: boolean
  children: React.ReactNode
  onClick?: () => void
  type?: 'button' | 'submit'
  className?: string  // escape hatch for one-off adjustments
}
```

**Variant styles (Tailwind classes):**

| Variant | Default | Hover | Disabled |
|---------|---------|-------|----------|
| `primary` | `bg-accent-blue/15 text-accent-blue border border-accent-blue/15` | `bg-accent-blue/25` | `opacity-50 cursor-not-allowed` |
| `secondary` | `bg-bg-secondary text-text-secondary border border-border-default` | `bg-bg-tertiary text-text-primary` | `opacity-50 cursor-not-allowed` |
| `danger` | `bg-accent-red/10 text-accent-red border border-accent-red/15` | `bg-accent-red/20` | `opacity-50 cursor-not-allowed` |
| `ghost` | `bg-transparent text-text-muted border-none` | `text-text-secondary` | `opacity-50 cursor-not-allowed` |

**Sizes:**
- `sm`: `px-3 py-1 text-caption rounded-control`
- `md`: `px-3.5 py-1.5 text-body rounded-control`

**Loading state:** Shows `loading` text (passed via `children`), button is disabled. No spinner — text swap is the existing pattern.

**Focus:** `focus-visible:outline-2 focus-visible:outline-accent-blue/50 focus-visible:outline-offset-1` — solves the invisible focus state problem.

**All buttons rendered through this component.** No inline button styles anywhere.

#### IconButton (`components/ui/buttons/IconButton.tsx`)

For icon-only buttons (settings gear, close X, etc.). Wraps `Button` with square aspect ratio and requires a `tooltip` prop.

```typescript
type IconButtonProps = {
  icon: React.ReactNode
  tooltip: string
  variant?: 'secondary' | 'ghost'
  size?: 'sm' | 'md'
  onClick?: () => void
}
```

Renders `<Tooltip>` wrapper + `<Button>` with `p-1.5` padding and centered content.

#### Input (`components/ui/forms/Input.tsx`)

Replaces 15+ inline input patterns.

```typescript
type InputProps = {
  label?: string
  helpText?: string
  error?: string
  required?: boolean
} & React.InputHTMLAttributes<HTMLInputElement>
```

**Styles:**
- Container: label + input + helpText/error stacked with `gap-1`
- Label: `text-label text-text-secondary` with red `*` if required
- Input: `w-full bg-bg-secondary text-text-primary border border-border-default rounded-control px-3 py-2 text-body placeholder:text-text-faint focus:border-accent-blue/50 focus:outline-none transition-colors`
- Help text: `text-caption text-text-muted`
- Error: `text-caption text-status-error`

#### Textarea (`components/ui/forms/Textarea.tsx`)

Same interface as Input but renders `<textarea>` with `resize-y min-h-20`.

#### PasswordInput (`components/ui/forms/PasswordInput.tsx`)

Wraps Input with show/hide toggle button. Same pattern as current DynamicConfigForm but using the shared components.

#### Select (`components/ui/forms/Select.tsx`)

```typescript
type SelectProps = {
  label?: string
  options: Array<{ value: string; label: string }>
  helpText?: string
} & React.SelectHTMLAttributes<HTMLSelectElement>
```

Styled to match Input but with `appearance-none` and custom chevron via CSS.

#### Checkbox (`components/ui/forms/Checkbox.tsx`)

```typescript
type CheckboxProps = {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}
```

Custom styled checkbox with `accent-accent-blue`.

#### Badge (`components/ui/feedback/Badge.tsx`)

Replaces 10+ inline badge/chip patterns.

```typescript
type BadgeProps = {
  variant: 'status' | 'phase' | 'priority' | 'label'
  color?: string    // Tailwind color token (e.g., 'accent-blue')
  children: React.ReactNode
  size?: 'sm' | 'md'
}
```

**Variant styles:**

| Variant | Base | Size sm | Size md |
|---------|------|---------|---------|
| `status` | `rounded-pill font-semibold` | `text-tiny px-1.5 py-px` | `text-caption px-2 py-0.5` |
| `phase` | `rounded-badge` | `text-tiny px-1 py-px` | `text-caption px-1.5 py-0.5` |
| `priority` | `rounded-badge uppercase tracking-wide` | `text-tiny px-1 py-px` | `text-tiny px-1 py-px` |
| `label` | `rounded-badge bg-bg-tertiary text-text-secondary` | `text-caption px-1.5 py-0.5` | — |

Color is applied as `bg-{color}/15 text-{color} border border-{color}/20`.

#### EmptyState (`components/ui/feedback/EmptyState.tsx`)

Replaces 6+ different "nothing here" messages.

```typescript
type EmptyStateProps = {
  title: string
  description?: string
  action?: { label: string; onClick: () => void }
  icon?: React.ReactNode
}
```

Centered layout: icon (optional, muted) → title (`text-body text-text-muted`) → description (`text-caption text-text-faint`) → action button (optional, primary variant).

#### ErrorBoundary (`components/ui/feedback/ErrorBoundary.tsx`)

Class component (React requirement for error boundaries). Catches render errors and shows recovery UI.

```typescript
type ErrorBoundaryProps = {
  fallback?: React.ReactNode
  children: React.ReactNode
}
```

Default fallback: card with "Something went wrong" title, error message in `text-caption text-text-muted`, and "Try again" button that calls `setState({ hasError: false })`.

Wrap every page-level component in `app/(dashboard)/layout.tsx`.

#### Skeleton (`components/ui/feedback/Skeleton.tsx`)

Loading placeholder with pulse animation.

```typescript
type SkeletonProps = {
  variant: 'line' | 'card' | 'circle'
  width?: string
  height?: string
  className?: string
}
```

Base style: `bg-bg-tertiary animate-pulse rounded-control`. Variants set default dimensions:
- `line`: `h-3 w-full rounded`
- `card`: `h-32 w-full rounded-card`
- `circle`: `h-8 w-8 rounded-full`

#### Toast (`components/ui/feedback/Toast.tsx`)

Transient notification system replacing inline "Saved" / "Error" messages.

Two parts:
1. **`ToastProvider`** — wraps app in context, renders toast queue in fixed `bottom-6 right-6` position
2. **`useToast()`** — hook returning `toast({ message, variant, duration? })` function

```typescript
type ToastVariant = 'success' | 'error' | 'info'
```

Toast container: `bg-bg-secondary border border-border-default rounded-control px-4 py-3 shadow-lg` with left color bar matching variant. Auto-dismiss after 4 seconds.

#### Card (`components/ui/layout/Card.tsx`)

Replaces 4+ card container patterns.

```typescript
type CardProps = {
  children: React.ReactNode
  variant?: 'default' | 'interactive'
  accentColor?: string  // left border or top border color token
  padding?: 'sm' | 'md'
  className?: string
  onClick?: () => void
}
```

Base: `bg-bg-primary border border-border-default rounded-card`.
- `interactive`: adds `hover:border-border-hover cursor-pointer transition-colors`
- `accentColor`: applies `border-l-2 border-l-{color}` or `border border-{color}/25`
- `padding sm`: `p-card-sm` / `padding md`: `p-card`

#### Modal (`components/ui/layout/Modal.tsx`)

Replaces 5+ modal implementations.

```typescript
type ModalProps = {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  width?: 'sm' | 'md' | 'lg'   // 400px, 520px, 640px
  actions?: React.ReactNode     // footer buttons
}
```

Overlay: `fixed inset-0 bg-bg-overlay z-50 flex items-center justify-center`.
Content: `bg-bg-primary border border-border-default rounded-card p-section max-h-[85vh] overflow-y-auto`.
Header: title + close IconButton.
Footer: right-aligned action buttons with `gap-2`.

Closes on Escape key and backdrop click.

#### Drawer (`components/ui/layout/Drawer.tsx`)

Replaces RightDrawer, PropertiesPanel patterns.

```typescript
type DrawerProps = {
  open: boolean
  onClose: () => void
  title?: string
  width?: 'sm' | 'md' | 'lg'   // 210px, 260px, 420px
  children: React.ReactNode
  side?: 'left' | 'right'
}
```

Fixed positioning, `bg-bg-base border-{side} border-border-default`. Slides in with CSS transition.

#### SectionHeader (`components/ui/layout/SectionHeader.tsx`)

```typescript
type SectionHeaderProps = {
  title: string
  action?: React.ReactNode  // e.g., a Button or IconButton
}
```

`flex items-center justify-between` with title in `text-label text-text-secondary uppercase tracking-wide`.

#### Divider (`components/ui/layout/Divider.tsx`)

`<hr>` styled as `border-border-default my-section`.

#### Tooltip (`components/ui/data/Tooltip.tsx`)

Hover tooltip for icon buttons and truncated text.

```typescript
type TooltipProps = {
  content: string
  side?: 'top' | 'bottom' | 'left' | 'right'
  children: React.ReactNode
}
```

Pure CSS tooltip using `group` + `group-hover:visible`. No external library. Style: `bg-bg-tertiary text-text-primary text-caption px-2 py-1 rounded-badge shadow-lg whitespace-nowrap`.

#### KeyValue (`components/ui/data/KeyValue.tsx`)

```typescript
type KeyValueProps = {
  label: string
  value: React.ReactNode
}
```

Horizontal layout: label in `text-caption text-text-muted`, value in `text-body text-text-primary`.

#### Barrel Export (`components/ui/index.ts`)

Re-exports all components for clean imports:

```typescript
export { Button } from './buttons/Button'
export { IconButton } from './buttons/IconButton'
// ... etc
```

---

## 3. Migration Plan

### Phase 1: Foundation (no visual changes)

1. Install Tailwind CSS + PostCSS
2. Create `tailwind.config.ts` with all tokens
3. Add CSS variables to `globals.css`
4. Create `lib/constants/phases.ts`
5. Create all 17 components in `components/ui/`
6. Add `ToastProvider` to app layout
7. Add `ErrorBoundary` to app layout
8. Create barrel export

### Phase 2: Layout Components

Migrate the structural chrome — these affect every page:

| Component | Changes |
|-----------|---------|
| `components/layout/TopBar.tsx` | Replace inline styles with token classes |
| `components/layout/Sidebar.tsx` | Replace inline styles, use `SectionHeader`, `Badge` |
| `components/layout/ProjectRail.tsx` | Replace inline styles with token classes |
| `app/(dashboard)/layout.tsx` | Wrap children in `ErrorBoundary`, add `ToastProvider` |

### Phase 3: Shared Task Components

Migrate the most-used components:

| Component | Changes |
|-----------|---------|
| `components/tasks/TaskCard.tsx` | Use `Card`, `Badge`, `Button` — remove all inline styles |
| `components/tasks/TaskDetailView.tsx` | Use `Card`, `SectionHeader`, `Button`, `Drawer` |
| `components/tasks/PropertiesPanel.tsx` | Use `Select`, `Input`, `Badge`, `KeyValue` — replace inline styles |
| `components/tasks/CreateTaskModal.tsx` | Use `Modal`, `Input`, `Select`, `Button` |
| `components/tasks/LiveRunsSection.tsx` | Use `Card`, `Badge`, `Button`, `EmptyState` |
| `components/tasks/SessionInput.tsx` | Use `Input`, `Button` |
| `components/tasks/RightDrawer.tsx` | Replace with `Drawer` component — delete this file |

### Phase 4: Dashboard & Agent Components

| Component | Changes |
|-----------|---------|
| `components/dashboard/ActivityPanel.tsx` | Use `SectionHeader`, `Card`, `Badge`, `EmptyState` |
| `components/dashboard/SessionAgentCard.tsx` | Use `Card`, `Badge`, `Button` |
| `components/agents/AgentCard.tsx` | Use `Card`, `Badge` |
| `components/agents/CreateAgentModal.tsx` | Use `Modal`, `Input`, `Select`, `Button` |

### Phase 5: Pages with Inline Styles

| Page | Changes |
|------|---------|
| `app/(dashboard)/projects/[projectId]/page.tsx` | Use `Card`, `Badge`, `EmptyState`, `SectionHeader`, `Skeleton` |
| `app/(dashboard)/projects/[projectId]/ideas/page.tsx` | Use `EmptyState`, replace inline grid style with Tailwind grid |
| `app/(dashboard)/projects/[projectId]/specs/page.tsx` | Same as ideas |
| `app/(dashboard)/projects/[projectId]/plans/page.tsx` | Same as ideas |
| `app/(dashboard)/projects/[projectId]/developing/page.tsx` | Same as ideas |
| `app/(dashboard)/projects/[projectId]/done/page.tsx` | Same as ideas |
| `app/(dashboard)/projects/[projectId]/agents/page.tsx` | Use `EmptyState`, `Button`, replace inline grid |
| `app/(dashboard)/projects/[projectId]/settings/page.tsx` | Use `Button`, `SectionHeader`, `Card` |
| `app/(dashboard)/settings/page.tsx` | Use `Input`, `Select`, `Button`, `SectionHeader`, `Card` |
| `app/(dashboard)/settings/providers/page.tsx` | Use `Card`, `Input`, `Button`, `Badge`, `Modal` |

### Phase 6: Modal & Overlay Components

| Component | Changes |
|-----------|---------|
| `components/FloatingSessionWindow.tsx` | Use `Card`, `IconButton`, `Tooltip` |
| `components/SessionPillBar.tsx` | Use `Badge`, `Button` |
| `components/IdeaCaptureModal.tsx` | Use `Modal`, `Input`, `Textarea`, `Button` |
| `components/DailyPlanModal.tsx` | Use `Modal`, `Textarea`, `Button` |
| `components/PasteModal.tsx` | Use `Modal`, `Textarea`, `Button` |
| `components/CommandPalette.tsx` | Use `Input`, `Card` with token classes |
| `components/StandupModal.tsx` | Use `Modal`, `Textarea`, `Button` |
| `components/WeeklyReviewModal.tsx` | Use `Modal`, `Textarea`, `Button` |
| `components/ShortcutGuide.tsx` | Use `Modal`, `KeyValue` |
| `components/ProjectSwitcherModal.tsx` | Use `Modal`, `Button` with token classes |

### Phase 7: Remaining Tailwind Components

These already use Tailwind but with raw `zinc-*` / `violet-*` colors instead of tokens:

| Component | Changes |
|-----------|---------|
| `components/nav/TopNav.tsx` | Replace `zinc-*` with token classes |
| `components/nav/ProjectTabs.tsx` | Replace `zinc-*` with token classes |
| `components/cards/MarkdownCard.tsx` | Replace `zinc-*`, `violet-*` with token classes |
| `components/cards/SessionCard.tsx` | Replace `zinc-*`, `emerald-*` with token classes |
| `components/DevelopingView.tsx` | Replace raw Tailwind with token classes |
| `components/FileDrawer.tsx` | Replace raw Tailwind with token classes |
| `components/MemoryDrawer.tsx` | Replace raw Tailwind with token classes |
| `components/OrchestratorDrawer.tsx` | Replace raw Tailwind with token classes |
| `components/OrchestratorFeed.tsx` | Replace raw Tailwind with token classes |
| `components/NewFileDialog.tsx` | Replace raw Tailwind with token classes |
| `components/QuickCapture.tsx` | Replace raw Tailwind with token classes |
| `components/SetupPrompt.tsx` | Replace raw Tailwind with token classes |
| `components/ClaudeNotFound.tsx` | Replace raw Tailwind with token classes |
| `components/CardGrid.tsx` | Replace raw Tailwind with token classes |

### Phase 8: New Feature Components

| Component | Changes |
|-----------|---------|
| `components/projects/DynamicConfigForm.tsx` | Use `Input`, `Textarea`, `PasswordInput`, `Button` |
| `components/projects/TaskSourceSettings.tsx` | Use `Card`, `Badge`, `Button`, `SectionHeader`, `EmptyState` |
| `components/projects/NewProjectWizard.tsx` | Use `Modal`, `Input`, `Select`, `Button`, `Badge` |

### Phase 9: Pages with Tailwind (token swap)

All remaining pages under `app/(dashboard)/` that already use Tailwind but with raw color classes:

| Page | Changes |
|------|---------|
| `app/(dashboard)/search/page.tsx` | Token swap |
| `app/(dashboard)/insights/page.tsx` | Token swap |
| `app/(dashboard)/kanban/page.tsx` | Token swap |
| `app/(dashboard)/git-activity/page.tsx` | Token swap |
| `app/(dashboard)/timeline/page.tsx` | Token swap |
| `app/(dashboard)/memory/page.tsx` | Token swap |
| `app/(dashboard)/context/page.tsx` | Token swap |
| `app/(dashboard)/bookmarks/page.tsx` | Token swap |
| `app/(dashboard)/compare/page.tsx` | Token swap |
| `app/(dashboard)/templates/page.tsx` | Token swap |
| `app/(dashboard)/usage/page.tsx` | Token swap |
| `app/(dashboard)/tech-audit/page.tsx` | Token swap |

---

## 4. Testing

### Component Tests

Each `components/ui/` component gets a test file in the same group directory (e.g., `components/ui/buttons/__tests__/Button.test.tsx`).

**Button tests:** Renders all variants, fires onClick, shows loading state, disabled state, focus ring visible.
**Input tests:** Renders label, placeholder, helpText, error, required indicator.
**Badge tests:** Renders all variants with correct colors.
**EmptyState tests:** Renders title, description, optional action.
**ErrorBoundary tests:** Catches render error, shows fallback, retry works.
**Skeleton tests:** Renders all variants with correct dimensions.
**Toast tests:** Shows toast, auto-dismisses, supports variants.
**Modal tests:** Opens/closes on Escape and backdrop click, renders title and actions.
**Drawer tests:** Opens to correct side, correct width.

### Visual Regression

No automated visual regression tooling in this spec. The full-sweep migration is verified by:
1. Running existing component tests after migration
2. Manual review of each migrated page

---

## 5. Conventions Going Forward

### Rules

1. **No inline `style={{ }}` objects.** All styling via Tailwind classes.
2. **No raw color values** in className strings (`text-zinc-400`). Use token classes (`text-text-secondary`).
3. **No raw spacing values** beyond Tailwind's default scale. Use semantic tokens (`p-card`, `gap-section`) for recurring patterns.
4. **All buttons through `<Button>`** — no `<button>` with manual styling.
5. **All inputs through form components** — no `<input>` with manual styling.
6. **All modals through `<Modal>`** — no custom overlay divs.
7. **All empty states through `<EmptyState>`** — no ad-hoc "Nothing here" text.
8. **All status indicators through `<Badge>`** — no inline colored spans.
9. **`className` escape hatch** — components accept `className` for one-off adjustments, but this should be rare. If you need it repeatedly, add a variant.

### Adding New Components

1. Add to the appropriate group in `components/ui/`
2. Export from `components/ui/index.ts`
3. Add tests
4. Use only token classes — no hardcoded values

---

## 6. File Structure Summary

### Created

| File | Purpose |
|------|---------|
| `tailwind.config.ts` | Theme tokens (colors, spacing, typography, radii) |
| `postcss.config.js` | PostCSS with Tailwind plugin |
| `app/globals.css` | CSS variables for color palette |
| `lib/constants/phases.ts` | Phase and priority color mappings |
| `components/ui/buttons/Button.tsx` | Button component |
| `components/ui/buttons/IconButton.tsx` | Icon button with tooltip |
| `components/ui/forms/Input.tsx` | Text input with label/help/error |
| `components/ui/forms/Textarea.tsx` | Textarea variant |
| `components/ui/forms/Select.tsx` | Select dropdown |
| `components/ui/forms/Checkbox.tsx` | Checkbox with label |
| `components/ui/forms/PasswordInput.tsx` | Password input with show/hide |
| `components/ui/feedback/Badge.tsx` | Status/phase/priority badges |
| `components/ui/feedback/EmptyState.tsx` | Empty state placeholder |
| `components/ui/feedback/ErrorBoundary.tsx` | Error catching wrapper |
| `components/ui/feedback/Skeleton.tsx` | Loading skeleton |
| `components/ui/feedback/Toast.tsx` | Toast notifications |
| `components/ui/layout/Card.tsx` | Card container |
| `components/ui/layout/Drawer.tsx` | Side drawer panel |
| `components/ui/layout/Modal.tsx` | Modal dialog |
| `components/ui/layout/SectionHeader.tsx` | Section header with action |
| `components/ui/layout/Divider.tsx` | Horizontal divider |
| `components/ui/data/Tooltip.tsx` | Hover tooltip |
| `components/ui/data/KeyValue.tsx` | Label-value display |
| `components/ui/index.ts` | Barrel export |

### Modified (full sweep)

Every component and page listed in the Migration Plan (Phases 2-9) — approximately 50+ files migrated from inline styles / raw Tailwind to token-based classes using shared components.

### Deleted

| File | Reason |
|------|--------|
| `components/tasks/RightDrawer.tsx` | Replaced by `components/ui/layout/Drawer.tsx` |
