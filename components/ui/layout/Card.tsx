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
