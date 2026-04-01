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
        <select ref={ref} id={selectId} required={required} className={`w-full bg-bg-secondary text-text-primary border border-border-default rounded-[var(--radius-control)] px-3 py-2 text-[13px] focus:border-accent-blue/50 focus:outline-none transition-colors cursor-pointer appearance-none ${className}`} {...props}>
          {options.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
        </select>
        {helpText && <span className="text-[11px] text-text-muted">{helpText}</span>}
      </div>
    )
  }
)
Select.displayName = 'Select'
