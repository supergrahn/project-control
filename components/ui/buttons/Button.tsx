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
