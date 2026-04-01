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
