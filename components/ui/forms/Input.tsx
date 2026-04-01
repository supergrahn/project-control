import { forwardRef } from 'react'

type InputProps = {
  label?: string
  helpText?: string
  error?: string
} & React.InputHTMLAttributes<HTMLInputElement>

const INPUT_CLASSES = 'w-full bg-bg-secondary text-text-primary border border-border-default rounded-[var(--radius-control)] px-3 py-2 text-[13px] placeholder:text-text-faint focus:border-accent-blue/50 focus:outline-none transition-colors'

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, helpText, error, required, id, className = '', ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-')
    return (
      <div className="flex flex-col gap-1">
        {label && (
          <label htmlFor={inputId} className="text-[12px] font-semibold text-text-secondary">
            {label}{required && <span className="text-status-error"> *</span>}
          </label>
        )}
        <input ref={ref} id={inputId} required={required} className={`${INPUT_CLASSES} ${error ? 'border-status-error' : ''} ${className}`} {...props} />
        {helpText && !error && <span className="text-[11px] text-text-muted">{helpText}</span>}
        {error && <span className="text-[11px] text-status-error">{error}</span>}
      </div>
    )
  }
)
Input.displayName = 'Input'
export { INPUT_CLASSES }
