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
