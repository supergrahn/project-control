'use client'
import { useState, forwardRef } from 'react'
import { Input } from './Input'

type PasswordInputProps = {
  label?: string
  helpText?: string
  error?: string
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'>

export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  (props, ref) => {
    const [show, setShow] = useState(false)
    return (
      <div className="relative">
        <Input ref={ref} type={show ? 'text' : 'password'} {...props} />
        <button type="button" onClick={() => setShow(s => !s)} className="absolute right-2 top-[28px] text-[11px] text-text-muted hover:text-text-secondary bg-transparent border-none cursor-pointer">
          {show ? 'Hide' : 'Show'}
        </button>
      </div>
    )
  }
)
PasswordInput.displayName = 'PasswordInput'
