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
