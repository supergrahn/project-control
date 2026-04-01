import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Input } from '../Input'
import { Textarea } from '../Textarea'
import { PasswordInput } from '../PasswordInput'
import { Select } from '../Select'
import { Checkbox } from '../Checkbox'

describe('Input', () => {
  it('renders with label', () => {
    render(<Input label="Email" />)
    expect(screen.getByText('Email')).toBeInTheDocument()
  })
  it('shows required indicator', () => {
    render(<Input label="Email" required />)
    expect(screen.getByText('*')).toBeInTheDocument()
  })
  it('shows help text', () => {
    render(<Input label="Email" helpText="Enter your email" />)
    expect(screen.getByText('Enter your email')).toBeInTheDocument()
  })
  it('shows error message', () => {
    render(<Input label="Email" error="Required field" />)
    expect(screen.getByText('Required field')).toBeInTheDocument()
  })
  it('renders placeholder', () => {
    render(<Input label="Email" placeholder="you@example.com" />)
    expect(screen.getByPlaceholderText('you@example.com')).toBeInTheDocument()
  })
})

describe('Textarea', () => {
  it('renders a textarea element', () => {
    render(<Textarea label="Notes" />)
    expect(document.querySelector('textarea')).toBeInTheDocument()
  })
})

describe('PasswordInput', () => {
  it('renders as password type by default', () => {
    render(<PasswordInput label="Token" />)
    expect(screen.getByLabelText('Token')).toHaveAttribute('type', 'password')
  })
  it('has show/hide toggle', () => {
    render(<PasswordInput label="Token" />)
    expect(screen.getByRole('button', { name: /show/i })).toBeInTheDocument()
  })
})

describe('Select', () => {
  it('renders options', () => {
    render(<Select label="Role" options={[{ value: 'admin', label: 'Admin' }, { value: 'user', label: 'User' }]} />)
    expect(screen.getByText('Admin')).toBeInTheDocument()
    expect(screen.getByText('User')).toBeInTheDocument()
  })
})

describe('Checkbox', () => {
  it('renders with label', () => {
    render(<Checkbox label="Agree" checked={false} onChange={() => {}} />)
    expect(screen.getByText('Agree')).toBeInTheDocument()
  })
  it('reflects checked state', () => {
    render(<Checkbox label="Agree" checked={true} onChange={() => {}} />)
    expect(screen.getByRole('checkbox')).toBeChecked()
  })
})
