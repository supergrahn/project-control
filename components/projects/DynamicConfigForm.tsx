'use client'
import { useState } from 'react'

type ConfigField = {
  key: string
  label: string
  type: 'text' | 'password' | 'textarea'
  placeholder?: string
  required: boolean
  helpText?: string
}

type DynamicConfigFormProps = {
  fields: ConfigField[]
  values: Record<string, string>
  onSubmit: (values: Record<string, string>) => void
  submitLabel?: string
  loading?: boolean
}

export default function DynamicConfigForm({ fields, values, onSubmit, submitLabel = 'Save', loading = false }: DynamicConfigFormProps) {
  const [formValues, setFormValues] = useState<Record<string, string>>(values)
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({})

  function handleChange(key: string, value: string) {
    setFormValues(prev => ({ ...prev, [key]: value }))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    onSubmit(formValues)
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {fields.map(field => (
        <div key={field.key}>
          <label className="text-text-secondary text-[12px] font-semibold block mb-1">
            {field.label}{field.required && <span className="text-status-error"> *</span>}
          </label>
          {field.type === 'textarea' ? (
            <textarea
              value={formValues[field.key] || ''}
              onChange={e => handleChange(field.key, e.target.value)}
              placeholder={field.placeholder}
              required={field.required}
              rows={3}
              className="w-full bg-bg-secondary text-text-primary border border-border-default rounded-[6px] px-3 py-2 text-[13px] outline-none resize-vertical"
            />
          ) : (
            <div className="relative">
              <input
                type={field.type === 'password' && !showPasswords[field.key] ? 'password' : 'text'}
                value={formValues[field.key] || ''}
                onChange={e => handleChange(field.key, e.target.value)}
                placeholder={field.placeholder}
                required={field.required}
                className="w-full bg-bg-secondary text-text-primary border border-border-default rounded-[6px] px-3 py-2 text-[13px] outline-none"
              />
              {field.type === 'password' && (
                <button
                  type="button"
                  onClick={() => setShowPasswords(prev => ({ ...prev, [field.key]: !prev[field.key] }))}
                  className="absolute right-2 top-1/2 -translate-y-1/2 bg-none border-none text-text-muted cursor-pointer text-[11px]"
                >
                  {showPasswords[field.key] ? 'Hide' : 'Show'}
                </button>
              )}
            </div>
          )}
          {field.helpText && (
            <div className="text-text-muted text-[11px] mt-1">{field.helpText}</div>
          )}
        </div>
      ))}
      <button
        type="submit"
        disabled={loading}
        className="bg-accent-blue/15 text-accent-blue border border-accent-blue/15 rounded-[6px] px-4 py-2 text-[13px] cursor-pointer disabled:cursor-not-allowed self-start"
      >
        {loading ? 'Saving...' : submitLabel}
      </button>
    </form>
  )
}
