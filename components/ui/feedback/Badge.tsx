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
