import { forwardRef } from 'react'
import { INPUT_CLASSES } from './Input'

type TextareaProps = {
  label?: string
  helpText?: string
  error?: string
} & React.TextareaHTMLAttributes<HTMLTextAreaElement>

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, helpText, error, required, id, className = '', ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-')
    return (
      <div className="flex flex-col gap-1">
        {label && (
          <label htmlFor={inputId} className="text-[12px] font-semibold text-text-secondary">
            {label}{required && <span className="text-status-error"> *</span>}
          </label>
        )}
        <textarea ref={ref} id={inputId} required={required} rows={3} className={`${INPUT_CLASSES} resize-y min-h-20 ${error ? 'border-status-error' : ''} ${className}`} {...props} />
        {helpText && !error && <span className="text-[11px] text-text-muted">{helpText}</span>}
        {error && <span className="text-[11px] text-status-error">{error}</span>}
      </div>
    )
  }
)
Textarea.displayName = 'Textarea'
