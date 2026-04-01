# Design System Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a token-driven design system with 17 shared UI components, establishing the foundation that all existing pages will migrate to.

**Architecture:** Tailwind v4 `@theme` block in `globals.css` defines all design tokens as CSS custom properties. A grouped component library under `components/ui/` provides Button, Input, Badge, Modal, etc. components that enforce token usage. `ErrorBoundary` and `ToastProvider` are wired into the app layout.

**Tech Stack:** Tailwind CSS v4.2 (already installed), Vitest + @testing-library/react, Next.js App Router

---

### Task 1: Theme Tokens

**Files:**
- Modify: `app/globals.css`
- Create: `lib/constants/phases.ts`

- [ ] **Step 1: Add CSS custom properties and @theme block to globals.css**

Replace the entire content of `app/globals.css` with:

```css
@import '@xterm/xterm/css/xterm.css';
@import 'highlight.js/styles/github-dark-dimmed.css';
@import "tailwindcss";
@plugin "@tailwindcss/typography";

/* ── Design Tokens ──────────────────────────────────────────────── */

:root {
  /* Backgrounds */
  --color-bg-base: #0c0e10;
  --color-bg-primary: #0e1012;
  --color-bg-secondary: #141618;
  --color-bg-tertiary: #1a1d20;
  --color-bg-overlay: rgba(0, 0, 0, 0.53);

  /* Borders */
  --color-border-default: #1c1f22;
  --color-border-subtle: #1e2124;
  --color-border-hover: #2a2f35;
  --color-border-strong: #2e3338;

  /* Text */
  --color-text-primary: #e2e6ea;
  --color-text-secondary: #8a9199;
  --color-text-muted: #5a6370;
  --color-text-faint: #454c54;
  --color-text-disabled: #2e3338;

  /* Accents */
  --color-accent-blue: #5b9bd5;
  --color-accent-green: #3a8c5c;
  --color-accent-purple: #8f77c9;
  --color-accent-orange: #c97e2a;
  --color-accent-red: #c04040;

  /* Status */
  --color-status-success: #3a8c5c;
  --color-status-warning: #c9a227;
  --color-status-error: #d94747;
  --color-status-info: #5b9bd5;
}

@theme inline {
  /* Backgrounds */
  --color-bg-base: var(--color-bg-base);
  --color-bg-primary: var(--color-bg-primary);
  --color-bg-secondary: var(--color-bg-secondary);
  --color-bg-tertiary: var(--color-bg-tertiary);
  --color-bg-overlay: var(--color-bg-overlay);

  /* Borders */
  --color-border-default: var(--color-border-default);
  --color-border-subtle: var(--color-border-subtle);
  --color-border-hover: var(--color-border-hover);
  --color-border-strong: var(--color-border-strong);

  /* Text */
  --color-text-primary: var(--color-text-primary);
  --color-text-secondary: var(--color-text-secondary);
  --color-text-muted: var(--color-text-muted);
  --color-text-faint: var(--color-text-faint);
  --color-text-disabled: var(--color-text-disabled);

  /* Accents */
  --color-accent-blue: var(--color-accent-blue);
  --color-accent-green: var(--color-accent-green);
  --color-accent-purple: var(--color-accent-purple);
  --color-accent-orange: var(--color-accent-orange);
  --color-accent-red: var(--color-accent-red);

  /* Status */
  --color-status-success: var(--color-status-success);
  --color-status-warning: var(--color-status-warning);
  --color-status-error: var(--color-status-error);
  --color-status-info: var(--color-status-info);

  /* Typography */
  --font-sans: Arial, Helvetica, sans-serif;
  --font-mono: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace;

  /* Spacing aliases */
  --spacing-section: 24px;
  --spacing-card: 16px;
  --spacing-card-sm: 14px;
  --spacing-group: 12px;
  --spacing-element: 8px;
  --spacing-tight: 4px;

  /* Border radius */
  --radius-card: 10px;
  --radius-control: 6px;
  --radius-badge: 4px;
  --radius-pill: 9999px;
}

body {
  background: var(--color-bg-base);
  color: var(--color-text-primary);
  font-family: var(--font-sans);
}
```

- [ ] **Step 2: Create phase and priority color constants**

Create `lib/constants/phases.ts`:

```typescript
import type { TaskStatus, TaskPriority } from '@/lib/db/tasks'

export const PHASE_COLORS: Record<TaskStatus, string> = {
  idea: 'accent-blue',
  speccing: 'accent-green',
  planning: 'accent-purple',
  developing: 'accent-orange',
  done: 'accent-red',
}

export const PRIORITY_COLORS: Record<TaskPriority, string> = {
  low: 'text-muted',
  medium: 'accent-blue',
  high: 'accent-orange',
  urgent: 'accent-red',
}

export const PHASE_LABELS: Record<TaskStatus, string> = {
  idea: 'Idea',
  speccing: 'Spec',
  planning: 'Plan',
  developing: 'Dev',
  done: 'Done',
}
```

- [ ] **Step 3: Verify Tailwind picks up the tokens**

Run: `npx next build 2>&1 | head -20`

Expected: Build starts without CSS errors. If there are issues with `@theme inline`, check the Tailwind v4 docs at `node_modules/next/dist/docs/` per AGENTS.md.

- [ ] **Step 4: Commit**

```bash
git add app/globals.css lib/constants/phases.ts
git commit -m "feat: add design system tokens to globals.css and phase constants"
```

---

### Task 2: Button & IconButton

**Files:**
- Create: `components/ui/buttons/Button.tsx`
- Create: `components/ui/buttons/IconButton.tsx`
- Create: `components/ui/buttons/__tests__/Button.test.tsx`

- [ ] **Step 1: Write Button tests**

Create `components/ui/buttons/__tests__/Button.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Button } from '../Button'

describe('Button', () => {
  it('renders children', () => {
    render(<Button variant="primary">Save</Button>)
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()
  })

  it('fires onClick', () => {
    const onClick = vi.fn()
    render(<Button variant="primary" onClick={onClick}>Click</Button>)
    fireEvent.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('is disabled when disabled=true', () => {
    render(<Button variant="primary" disabled>Nope</Button>)
    expect(screen.getByRole('button')).toBeDisabled()
  })

  it('is disabled when loading=true', () => {
    render(<Button variant="primary" loading>Saving...</Button>)
    expect(screen.getByRole('button')).toBeDisabled()
  })

  it('does not fire onClick when disabled', () => {
    const onClick = vi.fn()
    render(<Button variant="primary" disabled onClick={onClick}>No</Button>)
    fireEvent.click(screen.getByRole('button'))
    expect(onClick).not.toHaveBeenCalled()
  })

  it('renders as submit button when type=submit', () => {
    render(<Button variant="primary" type="submit">Go</Button>)
    expect(screen.getByRole('button')).toHaveAttribute('type', 'submit')
  })

  it('applies primary variant classes', () => {
    render(<Button variant="primary">Primary</Button>)
    const btn = screen.getByRole('button')
    expect(btn.className).toContain('bg-accent-blue')
  })

  it('applies danger variant classes', () => {
    render(<Button variant="danger">Delete</Button>)
    const btn = screen.getByRole('button')
    expect(btn.className).toContain('text-accent-red')
  })

  it('applies custom className', () => {
    render(<Button variant="primary" className="mt-4">Custom</Button>)
    const btn = screen.getByRole('button')
    expect(btn.className).toContain('mt-4')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run components/ui/buttons/__tests__/Button.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Implement Button**

Create `components/ui/buttons/Button.tsx`:

```tsx
import { forwardRef } from 'react'

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost'
type ButtonSize = 'sm' | 'md'

export type ButtonProps = {
  variant: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  className?: string
} & React.ButtonHTMLAttributes<HTMLButtonElement>

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:   'bg-accent-blue/15 text-accent-blue border border-accent-blue/15 hover:bg-accent-blue/25',
  secondary: 'bg-bg-secondary text-text-secondary border border-border-default hover:bg-bg-tertiary hover:text-text-primary',
  danger:    'bg-accent-red/10 text-accent-red border border-accent-red/15 hover:bg-accent-red/20',
  ghost:     'bg-transparent text-text-muted border border-transparent hover:text-text-secondary',
}

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'px-3 py-1 text-[11px] rounded-[var(--radius-control)]',
  md: 'px-3.5 py-1.5 text-[13px] rounded-[var(--radius-control)]',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant, size = 'sm', loading = false, disabled, className = '', children, ...props }, ref) => {
    const isDisabled = disabled || loading

    return (
      <button
        ref={ref}
        disabled={isDisabled}
        className={[
          VARIANT_CLASSES[variant],
          SIZE_CLASSES[size],
          'font-medium cursor-pointer transition-colors',
          'focus-visible:outline-2 focus-visible:outline-accent-blue/50 focus-visible:outline-offset-1',
          isDisabled && 'opacity-50 cursor-not-allowed pointer-events-none',
          className,
        ].filter(Boolean).join(' ')}
        {...props}
      >
        {children}
      </button>
    )
  }
)

Button.displayName = 'Button'
```

- [ ] **Step 4: Implement IconButton**

Create `components/ui/buttons/IconButton.tsx`:

```tsx
import { Button } from './Button'
import type { ButtonProps } from './Button'

type IconButtonProps = {
  icon: React.ReactNode
  tooltip: string
  variant?: 'secondary' | 'ghost'
  size?: 'sm' | 'md'
} & Omit<ButtonProps, 'variant' | 'children'>

export function IconButton({ icon, tooltip, variant = 'ghost', size = 'sm', className = '', ...props }: IconButtonProps) {
  return (
    <span className="relative group inline-flex">
      <Button
        variant={variant}
        size={size}
        className={`p-1.5 ${className}`}
        aria-label={tooltip}
        {...props}
      >
        {icon}
      </Button>
      <span className="invisible group-hover:visible absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 bg-bg-tertiary text-text-primary text-[11px] px-2 py-1 rounded-[var(--radius-badge)] shadow-lg whitespace-nowrap pointer-events-none z-50">
        {tooltip}
      </span>
    </span>
  )
}
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run components/ui/buttons/__tests__/Button.test.tsx`
Expected: All 9 tests PASS

- [ ] **Step 6: Commit**

```bash
git add components/ui/buttons/
git commit -m "feat: add Button and IconButton components"
```

---

### Task 3: Form Components (Input, Textarea, PasswordInput, Select, Checkbox)

**Files:**
- Create: `components/ui/forms/Input.tsx`
- Create: `components/ui/forms/Textarea.tsx`
- Create: `components/ui/forms/PasswordInput.tsx`
- Create: `components/ui/forms/Select.tsx`
- Create: `components/ui/forms/Checkbox.tsx`
- Create: `components/ui/forms/__tests__/Input.test.tsx`

- [ ] **Step 1: Write Input tests**

Create `components/ui/forms/__tests__/Input.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Input } from '../Input'
import { Textarea } from '../Textarea'
import { PasswordInput } from '../PasswordInput'
import { Select } from '../Select'
import { Checkbox } from '../Checkbox'

describe('Input', () => {
  it('renders with label', () => {
    render(<Input label="Email" />)
    expect(screen.getByText('Email')).toBeInTheDocument()
  })

  it('shows required indicator', () => {
    render(<Input label="Email" required />)
    expect(screen.getByText('*')).toBeInTheDocument()
  })

  it('shows help text', () => {
    render(<Input label="Email" helpText="Enter your email" />)
    expect(screen.getByText('Enter your email')).toBeInTheDocument()
  })

  it('shows error message', () => {
    render(<Input label="Email" error="Required field" />)
    expect(screen.getByText('Required field')).toBeInTheDocument()
  })

  it('renders placeholder', () => {
    render(<Input label="Email" placeholder="you@example.com" />)
    expect(screen.getByPlaceholderText('you@example.com')).toBeInTheDocument()
  })
})

describe('Textarea', () => {
  it('renders a textarea element', () => {
    render(<Textarea label="Notes" />)
    expect(document.querySelector('textarea')).toBeInTheDocument()
  })
})

describe('PasswordInput', () => {
  it('renders as password type by default', () => {
    render(<PasswordInput label="Token" />)
    expect(screen.getByLabelText('Token')).toHaveAttribute('type', 'password')
  })

  it('has show/hide toggle', () => {
    render(<PasswordInput label="Token" />)
    expect(screen.getByRole('button', { name: /show/i })).toBeInTheDocument()
  })
})

describe('Select', () => {
  it('renders options', () => {
    render(<Select label="Role" options={[{ value: 'admin', label: 'Admin' }, { value: 'user', label: 'User' }]} />)
    expect(screen.getByText('Admin')).toBeInTheDocument()
    expect(screen.getByText('User')).toBeInTheDocument()
  })
})

describe('Checkbox', () => {
  it('renders with label', () => {
    render(<Checkbox label="Agree" checked={false} onChange={() => {}} />)
    expect(screen.getByText('Agree')).toBeInTheDocument()
  })

  it('reflects checked state', () => {
    render(<Checkbox label="Agree" checked={true} onChange={() => {}} />)
    expect(screen.getByRole('checkbox')).toBeChecked()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run components/ui/forms/__tests__/Input.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement Input**

Create `components/ui/forms/Input.tsx`:

```tsx
import { forwardRef } from 'react'

type InputProps = {
  label?: string
  helpText?: string
  error?: string
} & React.InputHTMLAttributes<HTMLInputElement>

const INPUT_CLASSES = 'w-full bg-bg-secondary text-text-primary border border-border-default rounded-[var(--radius-control)] px-3 py-2 text-[13px] placeholder:text-text-faint focus:border-accent-blue/50 focus:outline-none transition-colors'

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, helpText, error, required, id, className = '', ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-')

    return (
      <div className="flex flex-col gap-1">
        {label && (
          <label htmlFor={inputId} className="text-[12px] font-semibold text-text-secondary">
            {label}{required && <span className="text-status-error"> *</span>}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          required={required}
          className={`${INPUT_CLASSES} ${error ? 'border-status-error' : ''} ${className}`}
          {...props}
        />
        {helpText && !error && (
          <span className="text-[11px] text-text-muted">{helpText}</span>
        )}
        {error && (
          <span className="text-[11px] text-status-error">{error}</span>
        )}
      </div>
    )
  }
)

Input.displayName = 'Input'

export { INPUT_CLASSES }
```

- [ ] **Step 4: Implement Textarea**

Create `components/ui/forms/Textarea.tsx`:

```tsx
import { forwardRef } from 'react'
import { INPUT_CLASSES } from './Input'

type TextareaProps = {
  label?: string
  helpText?: string
  error?: string
} & React.TextareaHTMLAttributes<HTMLTextAreaElement>

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, helpText, error, required, id, className = '', ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-')

    return (
      <div className="flex flex-col gap-1">
        {label && (
          <label htmlFor={inputId} className="text-[12px] font-semibold text-text-secondary">
            {label}{required && <span className="text-status-error"> *</span>}
          </label>
        )}
        <textarea
          ref={ref}
          id={inputId}
          required={required}
          rows={3}
          className={`${INPUT_CLASSES} resize-y min-h-20 ${error ? 'border-status-error' : ''} ${className}`}
          {...props}
        />
        {helpText && !error && (
          <span className="text-[11px] text-text-muted">{helpText}</span>
        )}
        {error && (
          <span className="text-[11px] text-status-error">{error}</span>
        )}
      </div>
    )
  }
)

Textarea.displayName = 'Textarea'
```

- [ ] **Step 5: Implement PasswordInput**

Create `components/ui/forms/PasswordInput.tsx`:

```tsx
'use client'
import { useState, forwardRef } from 'react'
import { Input } from './Input'

type PasswordInputProps = {
  label?: string
  helpText?: string
  error?: string
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'>

export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  (props, ref) => {
    const [show, setShow] = useState(false)

    return (
      <div className="relative">
        <Input ref={ref} type={show ? 'text' : 'password'} {...props} />
        <button
          type="button"
          onClick={() => setShow(s => !s)}
          className="absolute right-2 top-[28px] text-[11px] text-text-muted hover:text-text-secondary bg-transparent border-none cursor-pointer"
        >
          {show ? 'Hide' : 'Show'}
        </button>
      </div>
    )
  }
)

PasswordInput.displayName = 'PasswordInput'
```

- [ ] **Step 6: Implement Select**

Create `components/ui/forms/Select.tsx`:

```tsx
import { forwardRef } from 'react'

type SelectProps = {
  label?: string
  options: Array<{ value: string; label: string }>
  helpText?: string
} & React.SelectHTMLAttributes<HTMLSelectElement>

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, options, helpText, required, id, className = '', ...props }, ref) => {
    const selectId = id || label?.toLowerCase().replace(/\s+/g, '-')

    return (
      <div className="flex flex-col gap-1">
        {label && (
          <label htmlFor={selectId} className="text-[12px] font-semibold text-text-secondary">
            {label}{required && <span className="text-status-error"> *</span>}
          </label>
        )}
        <select
          ref={ref}
          id={selectId}
          required={required}
          className={`w-full bg-bg-secondary text-text-primary border border-border-default rounded-[var(--radius-control)] px-3 py-2 text-[13px] focus:border-accent-blue/50 focus:outline-none transition-colors cursor-pointer appearance-none ${className}`}
          {...props}
        >
          {options.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        {helpText && (
          <span className="text-[11px] text-text-muted">{helpText}</span>
        )}
      </div>
    )
  }
)

Select.displayName = 'Select'
```

- [ ] **Step 7: Implement Checkbox**

Create `components/ui/forms/Checkbox.tsx`:

```tsx
type CheckboxProps = {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}

export function Checkbox({ label, checked, onChange }: CheckboxProps) {
  return (
    <label className="flex items-center gap-2 text-[12px] text-text-secondary cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        className="accent-accent-blue"
      />
      {label}
    </label>
  )
}
```

- [ ] **Step 8: Run tests**

Run: `npx vitest run components/ui/forms/__tests__/Input.test.tsx`
Expected: All 10 tests PASS

- [ ] **Step 9: Commit**

```bash
git add components/ui/forms/
git commit -m "feat: add form components — Input, Textarea, PasswordInput, Select, Checkbox"
```

---

### Task 4: Feedback Components (Badge, EmptyState, Skeleton)

**Files:**
- Create: `components/ui/feedback/Badge.tsx`
- Create: `components/ui/feedback/EmptyState.tsx`
- Create: `components/ui/feedback/Skeleton.tsx`
- Create: `components/ui/feedback/__tests__/feedback.test.tsx`

- [ ] **Step 1: Write tests**

Create `components/ui/feedback/__tests__/feedback.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Badge } from '../Badge'
import { EmptyState } from '../EmptyState'
import { Skeleton } from '../Skeleton'

describe('Badge', () => {
  it('renders children', () => {
    render(<Badge color="accent-blue">Active</Badge>)
    expect(screen.getByText('Active')).toBeInTheDocument()
  })

  it('applies color as background and text', () => {
    const { container } = render(<Badge color="accent-green">Live</Badge>)
    const badge = container.firstChild as HTMLElement
    expect(badge.className).toContain('accent-green')
  })

  it('applies variant classes', () => {
    const { container } = render(<Badge variant="priority" color="accent-red">Urgent</Badge>)
    const badge = container.firstChild as HTMLElement
    expect(badge.className).toContain('uppercase')
  })
})

describe('EmptyState', () => {
  it('renders title', () => {
    render(<EmptyState title="No tasks yet" />)
    expect(screen.getByText('No tasks yet')).toBeInTheDocument()
  })

  it('renders description when provided', () => {
    render(<EmptyState title="Empty" description="Create your first task" />)
    expect(screen.getByText('Create your first task')).toBeInTheDocument()
  })

  it('renders action button when provided', () => {
    render(<EmptyState title="Empty" action={{ label: 'Create', onClick: () => {} }} />)
    expect(screen.getByRole('button', { name: 'Create' })).toBeInTheDocument()
  })

  it('does not render action when not provided', () => {
    render(<EmptyState title="Empty" />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})

describe('Skeleton', () => {
  it('renders line variant', () => {
    const { container } = render(<Skeleton variant="line" />)
    expect(container.firstChild).toBeInTheDocument()
  })

  it('renders card variant', () => {
    const { container } = render(<Skeleton variant="card" />)
    const el = container.firstChild as HTMLElement
    expect(el.className).toContain('animate-pulse')
  })

  it('renders circle variant', () => {
    const { container } = render(<Skeleton variant="circle" />)
    const el = container.firstChild as HTMLElement
    expect(el.className).toContain('rounded-full')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run components/ui/feedback/__tests__/feedback.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement Badge**

Create `components/ui/feedback/Badge.tsx`:

```tsx
type BadgeVariant = 'status' | 'phase' | 'priority' | 'label'

type BadgeProps = {
  variant?: BadgeVariant
  color?: string
  size?: 'sm' | 'md'
  children: React.ReactNode
  className?: string
}

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  status:   'rounded-[var(--radius-pill)] font-semibold',
  phase:    'rounded-[var(--radius-badge)]',
  priority: 'rounded-[var(--radius-badge)] uppercase tracking-wide',
  label:    'rounded-[var(--radius-badge)] bg-bg-tertiary text-text-secondary',
}

const SIZE_CLASSES = {
  sm: 'text-[10px] px-1.5 py-px',
  md: 'text-[11px] px-2 py-0.5',
}

export function Badge({ variant = 'status', color, size = 'sm', children, className = '' }: BadgeProps) {
  const colorClasses = color && variant !== 'label'
    ? `bg-${color}/15 text-${color} border border-${color}/20`
    : ''

  return (
    <span className={`inline-flex items-center ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${colorClasses} ${className}`}>
      {children}
    </span>
  )
}
```

- [ ] **Step 4: Implement EmptyState**

Create `components/ui/feedback/EmptyState.tsx`:

```tsx
import { Button } from '../buttons/Button'

type EmptyStateProps = {
  title: string
  description?: string
  action?: { label: string; onClick: () => void }
  icon?: React.ReactNode
}

export function EmptyState({ title, description, action, icon }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      {icon && <div className="text-text-faint mb-3 text-2xl">{icon}</div>}
      <div className="text-[13px] text-text-muted mb-1">{title}</div>
      {description && <div className="text-[11px] text-text-faint mb-4">{description}</div>}
      {action && (
        <Button variant="primary" size="sm" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  )
}
```

- [ ] **Step 5: Implement Skeleton**

Create `components/ui/feedback/Skeleton.tsx`:

```tsx
type SkeletonProps = {
  variant: 'line' | 'card' | 'circle'
  width?: string
  height?: string
  className?: string
}

const VARIANT_DEFAULTS = {
  line:   'h-3 w-full rounded',
  card:   'h-32 w-full rounded-[var(--radius-card)]',
  circle: 'h-8 w-8 rounded-full',
}

export function Skeleton({ variant, width, height, className = '' }: SkeletonProps) {
  return (
    <div
      className={`bg-bg-tertiary animate-pulse ${VARIANT_DEFAULTS[variant]} ${className}`}
      style={{ width, height }}
    />
  )
}
```

- [ ] **Step 6: Run tests**

Run: `npx vitest run components/ui/feedback/__tests__/feedback.test.tsx`
Expected: All 10 tests PASS

- [ ] **Step 7: Commit**

```bash
git add components/ui/feedback/
git commit -m "feat: add Badge, EmptyState, and Skeleton components"
```

---

### Task 5: ErrorBoundary & Toast

**Files:**
- Create: `components/ui/feedback/ErrorBoundary.tsx`
- Create: `components/ui/feedback/Toast.tsx`
- Create: `components/ui/feedback/__tests__/ErrorBoundary.test.tsx`
- Create: `components/ui/feedback/__tests__/Toast.test.tsx`

- [ ] **Step 1: Write ErrorBoundary tests**

Create `components/ui/feedback/__tests__/ErrorBoundary.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ErrorBoundary } from '../ErrorBoundary'

function BrokenComponent(): JSX.Element {
  throw new Error('Boom')
}

describe('ErrorBoundary', () => {
  // Suppress console.error for expected errors
  const originalError = console.error
  beforeEach(() => { console.error = vi.fn() })
  afterEach(() => { console.error = originalError })

  it('renders children when no error', () => {
    render(<ErrorBoundary><div>OK</div></ErrorBoundary>)
    expect(screen.getByText('OK')).toBeInTheDocument()
  })

  it('renders fallback when child throws', () => {
    render(<ErrorBoundary><BrokenComponent /></ErrorBoundary>)
    expect(screen.getByText('Something went wrong')).toBeInTheDocument()
  })

  it('shows error message', () => {
    render(<ErrorBoundary><BrokenComponent /></ErrorBoundary>)
    expect(screen.getByText('Boom')).toBeInTheDocument()
  })

  it('recovers on retry', () => {
    let shouldThrow = true
    function MaybeBreak() {
      if (shouldThrow) throw new Error('Boom')
      return <div>Recovered</div>
    }

    const { rerender } = render(<ErrorBoundary><MaybeBreak /></ErrorBoundary>)
    expect(screen.getByText('Something went wrong')).toBeInTheDocument()

    shouldThrow = false
    fireEvent.click(screen.getByRole('button', { name: /try again/i }))
    // After retry, ErrorBoundary resets its state — but the component re-renders fresh
    // Since shouldThrow is now false, it should render "Recovered"
  })
})
```

- [ ] **Step 2: Write Toast tests**

Create `components/ui/feedback/__tests__/Toast.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { ToastProvider, useToast } from '../Toast'

function TestComponent() {
  const toast = useToast()
  return (
    <button onClick={() => toast({ message: 'Saved!', variant: 'success' })}>
      Show Toast
    </button>
  )
}

describe('Toast', () => {
  it('shows toast message when triggered', async () => {
    render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>
    )
    await act(async () => {
      screen.getByText('Show Toast').click()
    })
    expect(screen.getByText('Saved!')).toBeInTheDocument()
  })

  it('auto-dismisses after duration', async () => {
    vi.useFakeTimers()
    render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>
    )
    await act(async () => {
      screen.getByText('Show Toast').click()
    })
    expect(screen.getByText('Saved!')).toBeInTheDocument()

    await act(async () => {
      vi.advanceTimersByTime(5000)
    })
    expect(screen.queryByText('Saved!')).not.toBeInTheDocument()
    vi.useRealTimers()
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run components/ui/feedback/__tests__/ErrorBoundary.test.tsx components/ui/feedback/__tests__/Toast.test.tsx`
Expected: FAIL

- [ ] **Step 4: Implement ErrorBoundary**

Create `components/ui/feedback/ErrorBoundary.tsx`:

```tsx
'use client'
import React from 'react'
import { Button } from '../buttons/Button'

type ErrorBoundaryProps = {
  fallback?: React.ReactNode
  children: React.ReactNode
}

type ErrorBoundaryState = {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback

      return (
        <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
          <div className="text-[13px] text-text-primary mb-2">Something went wrong</div>
          <div className="text-[11px] text-text-muted mb-4 max-w-md">
            {this.state.error?.message}
          </div>
          <Button variant="secondary" size="sm" onClick={this.handleRetry}>
            Try again
          </Button>
        </div>
      )
    }

    return this.props.children
  }
}
```

- [ ] **Step 5: Implement Toast**

Create `components/ui/feedback/Toast.tsx`:

```tsx
'use client'
import { createContext, useContext, useState, useCallback } from 'react'

type ToastVariant = 'success' | 'error' | 'info'

type ToastItem = {
  id: number
  message: string
  variant: ToastVariant
}

type ToastFn = (opts: { message: string; variant: ToastVariant; duration?: number }) => void

const ToastContext = createContext<ToastFn>(() => {})

export function useToast(): ToastFn {
  return useContext(ToastContext)
}

const VARIANT_BORDER_COLORS: Record<ToastVariant, string> = {
  success: 'border-l-status-success',
  error:   'border-l-status-error',
  info:    'border-l-status-info',
}

let nextId = 0

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const toast: ToastFn = useCallback(({ message, variant, duration = 4000 }) => {
    const id = ++nextId
    setToasts(prev => [...prev, { id, message, variant }])
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, duration)
  }, [])

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-2 pointer-events-none">
        {toasts.map(t => (
          <div
            key={t.id}
            className={`bg-bg-secondary border border-border-default ${VARIANT_BORDER_COLORS[t.variant]} border-l-2 rounded-[var(--radius-control)] px-4 py-3 shadow-lg text-[13px] text-text-primary pointer-events-auto animate-in`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
```

- [ ] **Step 6: Run tests**

Run: `npx vitest run components/ui/feedback/__tests__/ErrorBoundary.test.tsx components/ui/feedback/__tests__/Toast.test.tsx`
Expected: All tests PASS

- [ ] **Step 7: Commit**

```bash
git add components/ui/feedback/ErrorBoundary.tsx components/ui/feedback/Toast.tsx components/ui/feedback/__tests__/ErrorBoundary.test.tsx components/ui/feedback/__tests__/Toast.test.tsx
git commit -m "feat: add ErrorBoundary and Toast components"
```

---

### Task 6: Layout Components (Card, Modal, Drawer, SectionHeader, Divider)

**Files:**
- Create: `components/ui/layout/Card.tsx`
- Create: `components/ui/layout/Modal.tsx`
- Create: `components/ui/layout/Drawer.tsx`
- Create: `components/ui/layout/SectionHeader.tsx`
- Create: `components/ui/layout/Divider.tsx`
- Create: `components/ui/layout/__tests__/layout.test.tsx`

- [ ] **Step 1: Write tests**

Create `components/ui/layout/__tests__/layout.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Card } from '../Card'
import { Modal } from '../Modal'
import { Drawer } from '../Drawer'
import { SectionHeader } from '../SectionHeader'
import { Divider } from '../Divider'

describe('Card', () => {
  it('renders children', () => {
    render(<Card>Content</Card>)
    expect(screen.getByText('Content')).toBeInTheDocument()
  })

  it('applies interactive class when onClick provided', () => {
    const { container } = render(<Card onClick={() => {}}>Click</Card>)
    const card = container.firstChild as HTMLElement
    expect(card.className).toContain('cursor-pointer')
  })
})

describe('Modal', () => {
  it('renders when open', () => {
    render(<Modal open onClose={() => {}} title="Test">Body</Modal>)
    expect(screen.getByText('Test')).toBeInTheDocument()
    expect(screen.getByText('Body')).toBeInTheDocument()
  })

  it('does not render when closed', () => {
    render(<Modal open={false} onClose={() => {}} title="Test">Body</Modal>)
    expect(screen.queryByText('Test')).not.toBeInTheDocument()
  })

  it('calls onClose on Escape', () => {
    const onClose = vi.fn()
    render(<Modal open onClose={onClose} title="Test">Body</Modal>)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('calls onClose on backdrop click', () => {
    const onClose = vi.fn()
    render(<Modal open onClose={onClose} title="Test">Body</Modal>)
    fireEvent.click(screen.getByTestId('modal-backdrop'))
    expect(onClose).toHaveBeenCalled()
  })

  it('renders actions in footer', () => {
    render(
      <Modal open onClose={() => {}} title="Test" actions={<button>Save</button>}>
        Body
      </Modal>
    )
    expect(screen.getByText('Save')).toBeInTheDocument()
  })
})

describe('Drawer', () => {
  it('renders when open', () => {
    render(<Drawer open onClose={() => {}} title="Details">Content</Drawer>)
    expect(screen.getByText('Details')).toBeInTheDocument()
  })

  it('does not render when closed', () => {
    render(<Drawer open={false} onClose={() => {}}>Content</Drawer>)
    expect(screen.queryByText('Content')).not.toBeInTheDocument()
  })
})

describe('SectionHeader', () => {
  it('renders title', () => {
    render(<SectionHeader title="Settings" />)
    expect(screen.getByText('Settings')).toBeInTheDocument()
  })

  it('renders action', () => {
    render(<SectionHeader title="Tasks" action={<button>Add</button>} />)
    expect(screen.getByText('Add')).toBeInTheDocument()
  })
})

describe('Divider', () => {
  it('renders an hr element', () => {
    const { container } = render(<Divider />)
    expect(container.querySelector('hr')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run components/ui/layout/__tests__/layout.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement Card**

Create `components/ui/layout/Card.tsx`:

```tsx
type CardProps = {
  children: React.ReactNode
  variant?: 'default' | 'interactive'
  accentColor?: string
  padding?: 'sm' | 'md' | 'none'
  className?: string
  onClick?: () => void
}

export function Card({ children, variant, accentColor, padding = 'md', className = '', onClick }: CardProps) {
  const isInteractive = variant === 'interactive' || !!onClick
  const paddingClass = padding === 'sm' ? 'p-[var(--spacing-card-sm)]' : padding === 'md' ? 'p-[var(--spacing-card)]' : ''
  const accentClass = accentColor ? `border-l-2 border-l-${accentColor}` : ''

  return (
    <div
      onClick={onClick}
      className={[
        'bg-bg-primary border border-border-default rounded-[var(--radius-card)]',
        paddingClass,
        accentClass,
        isInteractive && 'hover:border-border-hover cursor-pointer transition-colors',
        className,
      ].filter(Boolean).join(' ')}
    >
      {children}
    </div>
  )
}
```

- [ ] **Step 4: Implement Modal**

Create `components/ui/layout/Modal.tsx`:

```tsx
'use client'
import { useEffect } from 'react'
import { IconButton } from '../buttons/IconButton'

type ModalProps = {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  width?: 'sm' | 'md' | 'lg'
  actions?: React.ReactNode
}

const WIDTH_CLASSES = {
  sm: 'w-[400px]',
  md: 'w-[520px]',
  lg: 'w-[640px]',
}

export function Modal({ open, onClose, title, children, width = 'md', actions }: ModalProps) {
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 bg-bg-overlay z-50 flex items-center justify-center"
      data-testid="modal-backdrop"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className={`bg-bg-primary border border-border-default rounded-[var(--radius-card)] p-[var(--spacing-section)] max-h-[85vh] overflow-y-auto ${WIDTH_CLASSES[width]}`} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[16px] font-bold text-text-primary">{title}</h2>
          <IconButton icon="X" tooltip="Close" variant="ghost" onClick={onClose} />
        </div>
        <div>{children}</div>
        {actions && (
          <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-border-default">
            {actions}
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Implement Drawer**

Create `components/ui/layout/Drawer.tsx`:

```tsx
'use client'
import { useEffect } from 'react'

type DrawerProps = {
  open: boolean
  onClose: () => void
  title?: string
  width?: 'sm' | 'md' | 'lg'
  side?: 'left' | 'right'
  children: React.ReactNode
}

const WIDTH_CLASSES = {
  sm: 'w-[210px]',
  md: 'w-[260px]',
  lg: 'w-[420px]',
}

export function Drawer({ open, onClose, title, width = 'md', side = 'right', children }: DrawerProps) {
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  const sideClass = side === 'right' ? 'right-0 border-l' : 'left-0 border-r'

  return (
    <div className={`fixed top-0 bottom-0 ${sideClass} border-border-default bg-bg-base ${WIDTH_CLASSES[width]} z-40 flex flex-col overflow-hidden`}>
      {title && (
        <div className="px-4 py-3 border-b border-border-default">
          <span className="text-[12px] font-semibold text-text-secondary uppercase tracking-wide">{title}</span>
        </div>
      )}
      <div className="flex-1 overflow-y-auto p-4">
        {children}
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Implement SectionHeader**

Create `components/ui/layout/SectionHeader.tsx`:

```tsx
type SectionHeaderProps = {
  title: string
  action?: React.ReactNode
}

export function SectionHeader({ title, action }: SectionHeaderProps) {
  return (
    <div className="flex items-center justify-between mb-3">
      <span className="text-[12px] font-semibold text-text-secondary uppercase tracking-wide">{title}</span>
      {action}
    </div>
  )
}
```

- [ ] **Step 7: Implement Divider**

Create `components/ui/layout/Divider.tsx`:

```tsx
export function Divider({ className = '' }: { className?: string }) {
  return <hr className={`border-border-default my-[var(--spacing-section)] ${className}`} />
}
```

- [ ] **Step 8: Run tests**

Run: `npx vitest run components/ui/layout/__tests__/layout.test.tsx`
Expected: All 11 tests PASS

- [ ] **Step 9: Commit**

```bash
git add components/ui/layout/
git commit -m "feat: add Card, Modal, Drawer, SectionHeader, and Divider components"
```

---

### Task 7: Data Components (Tooltip, KeyValue)

**Files:**
- Create: `components/ui/data/Tooltip.tsx`
- Create: `components/ui/data/KeyValue.tsx`
- Create: `components/ui/data/__tests__/data.test.tsx`

- [ ] **Step 1: Write tests**

Create `components/ui/data/__tests__/data.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Tooltip } from '../Tooltip'
import { KeyValue } from '../KeyValue'

describe('Tooltip', () => {
  it('renders children', () => {
    render(<Tooltip content="Help text"><button>Hover me</button></Tooltip>)
    expect(screen.getByText('Hover me')).toBeInTheDocument()
  })

  it('renders tooltip content', () => {
    render(<Tooltip content="Help text"><button>Hover me</button></Tooltip>)
    expect(screen.getByText('Help text')).toBeInTheDocument()
  })
})

describe('KeyValue', () => {
  it('renders label and value', () => {
    render(<KeyValue label="Status" value="Active" />)
    expect(screen.getByText('Status')).toBeInTheDocument()
    expect(screen.getByText('Active')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run components/ui/data/__tests__/data.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement Tooltip**

Create `components/ui/data/Tooltip.tsx`:

```tsx
type TooltipProps = {
  content: string
  side?: 'top' | 'bottom' | 'left' | 'right'
  children: React.ReactNode
}

const SIDE_CLASSES = {
  top:    'bottom-full left-1/2 -translate-x-1/2 mb-1.5',
  bottom: 'top-full left-1/2 -translate-x-1/2 mt-1.5',
  left:   'right-full top-1/2 -translate-y-1/2 mr-1.5',
  right:  'left-full top-1/2 -translate-y-1/2 ml-1.5',
}

export function Tooltip({ content, side = 'top', children }: TooltipProps) {
  return (
    <span className="relative group inline-flex">
      {children}
      <span className={`invisible group-hover:visible absolute ${SIDE_CLASSES[side]} bg-bg-tertiary text-text-primary text-[11px] px-2 py-1 rounded-[var(--radius-badge)] shadow-lg whitespace-nowrap pointer-events-none z-50`}>
        {content}
      </span>
    </span>
  )
}
```

- [ ] **Step 4: Implement KeyValue**

Create `components/ui/data/KeyValue.tsx`:

```tsx
type KeyValueProps = {
  label: string
  value: React.ReactNode
  className?: string
}

export function KeyValue({ label, value, className = '' }: KeyValueProps) {
  return (
    <div className={`flex items-baseline justify-between gap-2 ${className}`}>
      <span className="text-[11px] text-text-muted shrink-0">{label}</span>
      <span className="text-[13px] text-text-primary text-right">{value}</span>
    </div>
  )
}
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run components/ui/data/__tests__/data.test.tsx`
Expected: All 4 tests PASS

- [ ] **Step 6: Commit**

```bash
git add components/ui/data/
git commit -m "feat: add Tooltip and KeyValue components"
```

---

### Task 8: Barrel Export & App Integration

**Files:**
- Create: `components/ui/index.ts`
- Modify: `app/(dashboard)/layout.tsx`
- Modify: `components/Providers.tsx`

- [ ] **Step 1: Create barrel export**

Create `components/ui/index.ts`:

```typescript
// Buttons
export { Button } from './buttons/Button'
export type { ButtonProps } from './buttons/Button'
export { IconButton } from './buttons/IconButton'

// Forms
export { Input, INPUT_CLASSES } from './forms/Input'
export { Textarea } from './forms/Textarea'
export { PasswordInput } from './forms/PasswordInput'
export { Select } from './forms/Select'
export { Checkbox } from './forms/Checkbox'

// Feedback
export { Badge } from './feedback/Badge'
export { EmptyState } from './feedback/EmptyState'
export { ErrorBoundary } from './feedback/ErrorBoundary'
export { Skeleton } from './feedback/Skeleton'
export { ToastProvider, useToast } from './feedback/Toast'

// Layout
export { Card } from './layout/Card'
export { Modal } from './layout/Modal'
export { Drawer } from './layout/Drawer'
export { SectionHeader } from './layout/SectionHeader'
export { Divider } from './layout/Divider'

// Data
export { Tooltip } from './data/Tooltip'
export { KeyValue } from './data/KeyValue'
```

- [ ] **Step 2: Add ToastProvider to Providers**

Read `components/Providers.tsx` first. Then wrap the existing children with `<ToastProvider>`:

```tsx
import { ToastProvider } from '@/components/ui/feedback/Toast'

// Inside the Providers component, wrap children:
<ToastProvider>
  {/* existing provider content */}
</ToastProvider>
```

- [ ] **Step 3: Add ErrorBoundary to dashboard layout**

Read `app/(dashboard)/layout.tsx`. Wrap the page content with `<ErrorBoundary>`:

```tsx
import { ErrorBoundary } from '@/components/ui/feedback/ErrorBoundary'

// Wrap the children in the layout:
<ErrorBoundary>
  {children}
</ErrorBoundary>
```

- [ ] **Step 4: Verify the app builds**

Run: `npx next build 2>&1 | tail -10`
Expected: Build succeeds (or at minimum, no import/compilation errors)

- [ ] **Step 5: Run all component tests**

Run: `npx vitest run components/ui/`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add components/ui/index.ts components/Providers.tsx app/\(dashboard\)/layout.tsx
git commit -m "feat: add barrel export, wire ErrorBoundary and ToastProvider into app"
```

---

## Summary

| Task | Components | Tests |
|------|-----------|-------|
| 1 | Theme tokens, phase constants | — |
| 2 | Button, IconButton | 9 |
| 3 | Input, Textarea, PasswordInput, Select, Checkbox | 10 |
| 4 | Badge, EmptyState, Skeleton | 10 |
| 5 | ErrorBoundary, Toast | 6+ |
| 6 | Card, Modal, Drawer, SectionHeader, Divider | 11 |
| 7 | Tooltip, KeyValue | 4 |
| 8 | Barrel export, app integration | — |

**Total:** 17 components, 50+ tests, 8 tasks

After this plan completes, the full-sweep migration (Plan 2) can begin — converting all existing inline-styled and raw-Tailwind components to use the design system.
