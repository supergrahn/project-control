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
