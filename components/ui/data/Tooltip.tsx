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
