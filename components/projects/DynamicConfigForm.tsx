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

  const inputStyle = {
    width: '100%',
    background: '#141618',
    color: '#e2e6ea',
    border: '1px solid #1c1f22',
    borderRadius: 6,
    padding: '8px 12px',
    fontSize: 13,
    outline: 'none',
    boxSizing: 'border-box' as const,
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {fields.map(field => (
        <div key={field.key}>
          <label style={{ color: '#8a9199', fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>
            {field.label}{field.required && <span style={{ color: '#d94747' }}> *</span>}
          </label>
          {field.type === 'textarea' ? (
            <textarea
              value={formValues[field.key] || ''}
              onChange={e => handleChange(field.key, e.target.value)}
              placeholder={field.placeholder}
              required={field.required}
              rows={3}
              style={{ ...inputStyle, resize: 'vertical' }}
            />
          ) : (
            <div style={{ position: 'relative' }}>
              <input
                type={field.type === 'password' && !showPasswords[field.key] ? 'password' : 'text'}
                value={formValues[field.key] || ''}
                onChange={e => handleChange(field.key, e.target.value)}
                placeholder={field.placeholder}
                required={field.required}
                style={inputStyle}
              />
              {field.type === 'password' && (
                <button
                  type="button"
                  onClick={() => setShowPasswords(prev => ({ ...prev, [field.key]: !prev[field.key] }))}
                  style={{
                    position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', color: '#5a6370', cursor: 'pointer', fontSize: 11,
                  }}
                >
                  {showPasswords[field.key] ? 'Hide' : 'Show'}
                </button>
              )}
            </div>
          )}
          {field.helpText && (
            <div style={{ color: '#5a6370', fontSize: 11, marginTop: 4 }}>{field.helpText}</div>
          )}
        </div>
      ))}
      <button
        type="submit"
        disabled={loading}
        style={{
          background: '#0d1a2d',
          color: '#5b9bd5',
          border: '1px solid #5b9bd522',
          borderRadius: 6,
          padding: '8px 16px',
          fontSize: 13,
          cursor: loading ? 'not-allowed' : 'pointer',
          alignSelf: 'flex-start',
        }}
      >
        {loading ? 'Saving...' : submitLabel}
      </button>
    </form>
  )
}
