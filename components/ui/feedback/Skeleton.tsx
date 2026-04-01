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
