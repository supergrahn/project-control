import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import DynamicConfigForm from '@/components/projects/DynamicConfigForm'

describe('DynamicConfigForm', () => {
  it('renders all fields from the schema', () => {
    const fields = [
      { key: 'username', label: 'Username', type: 'text' as const, required: true },
      { key: 'password', label: 'Password', type: 'password' as const, required: true },
      { key: 'description', label: 'Description', type: 'textarea' as const, required: false },
    ]
    const values = { username: '', password: '', description: '' }
    const onSubmit = vi.fn()

    render(<DynamicConfigForm fields={fields} values={values} onSubmit={onSubmit} />)

    expect(screen.getByText('Username')).toBeInTheDocument()
    expect(screen.getByText('Password')).toBeInTheDocument()
    expect(screen.getByText('Description')).toBeInTheDocument()
  })

  it('shows required indicator (*) for required fields', () => {
    const fields = [
      { key: 'field1', label: 'Required Field', type: 'text' as const, required: true },
      { key: 'field2', label: 'Optional Field', type: 'text' as const, required: false },
    ]
    const values = { field1: '', field2: '' }
    const onSubmit = vi.fn()

    render(<DynamicConfigForm fields={fields} values={values} onSubmit={onSubmit} />)

    const requiredLabel = screen.getByText('Required Field')
    const optionalLabel = screen.getByText('Optional Field')

    expect(requiredLabel.textContent).toContain('*')
    expect(optionalLabel.textContent).not.toContain('*')
  })

  it('shows helpText when provided', () => {
    const fields = [
      { key: 'api_key', label: 'API Key', type: 'text' as const, required: true, helpText: 'Get your API key from your account settings' },
      { key: 'name', label: 'Name', type: 'text' as const, required: false },
    ]
    const values = { api_key: '', name: '' }
    const onSubmit = vi.fn()

    render(<DynamicConfigForm fields={fields} values={values} onSubmit={onSubmit} />)

    expect(screen.getByText('Get your API key from your account settings')).toBeInTheDocument()
  })

  it('shows placeholder text in inputs', () => {
    const fields = [
      { key: 'email', label: 'Email', type: 'text' as const, required: true, placeholder: 'user@example.com' },
      { key: 'notes', label: 'Notes', type: 'textarea' as const, required: false, placeholder: 'Enter notes here' },
    ]
    const values = { email: '', notes: '' }
    const onSubmit = vi.fn()

    render(<DynamicConfigForm fields={fields} values={values} onSubmit={onSubmit} />)

    expect(screen.getByPlaceholderText('user@example.com')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Enter notes here')).toBeInTheDocument()
  })

  it('renders password fields as type="password" by default', () => {
    const fields = [
      { key: 'password', label: 'Password', type: 'password' as const, required: true },
    ]
    const values = { password: '' }
    const onSubmit = vi.fn()

    render(<DynamicConfigForm fields={fields} values={values} onSubmit={onSubmit} />)

    const input = screen.getByDisplayValue('')
    expect(input).toHaveAttribute('type', 'password')
  })

  it('toggles password visibility with Show/Hide button', () => {
    const fields = [
      { key: 'password', label: 'Password', type: 'password' as const, required: true },
    ]
    const values = { password: 'secret123' }
    const onSubmit = vi.fn()

    render(<DynamicConfigForm fields={fields} values={values} onSubmit={onSubmit} />)

    const input = screen.getByDisplayValue('secret123')
    const showButton = screen.getByRole('button', { name: /show/i })

    expect(input).toHaveAttribute('type', 'password')

    fireEvent.click(showButton)
    expect(input).toHaveAttribute('type', 'text')

    fireEvent.click(showButton)
    expect(input).toHaveAttribute('type', 'password')
  })

  it('shows correct button text for password toggle', () => {
    const fields = [
      { key: 'password', label: 'Password', type: 'password' as const, required: true },
    ]
    const values = { password: 'secret' }
    const onSubmit = vi.fn()

    render(<DynamicConfigForm fields={fields} values={values} onSubmit={onSubmit} />)

    expect(screen.getByRole('button', { name: /show/i })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /show/i }))
    expect(screen.getByRole('button', { name: /hide/i })).toBeInTheDocument()
  })

  it('renders textarea for textarea type', () => {
    const fields = [
      { key: 'description', label: 'Description', type: 'textarea' as const, required: false },
    ]
    const values = { description: '' }
    const onSubmit = vi.fn()

    render(<DynamicConfigForm fields={fields} values={values} onSubmit={onSubmit} />)

    const textarea = screen.getByRole('textbox')
    expect(textarea.tagName).toBe('TEXTAREA')
  })

  it('shows custom submitLabel on submit button', () => {
    const fields = [
      { key: 'name', label: 'Name', type: 'text' as const, required: true },
    ]
    const values = { name: '' }
    const onSubmit = vi.fn()

    render(<DynamicConfigForm fields={fields} values={values} onSubmit={onSubmit} submitLabel="Update Config" />)

    expect(screen.getByRole('button', { name: /update config/i })).toBeInTheDocument()
  })

  it('shows default submitLabel when not provided', () => {
    const fields = [
      { key: 'name', label: 'Name', type: 'text' as const, required: true },
    ]
    const values = { name: '' }
    const onSubmit = vi.fn()

    render(<DynamicConfigForm fields={fields} values={values} onSubmit={onSubmit} />)

    expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument()
  })

  it('shows "Saving..." when loading is true', () => {
    const fields = [
      { key: 'name', label: 'Name', type: 'text' as const, required: true },
    ]
    const values = { name: '' }
    const onSubmit = vi.fn()

    render(<DynamicConfigForm fields={fields} values={values} onSubmit={onSubmit} loading={true} />)

    expect(screen.getByRole('button', { name: /saving/i })).toBeInTheDocument()
  })

  it('disables submit button when loading is true', () => {
    const fields = [
      { key: 'name', label: 'Name', type: 'text' as const, required: true },
    ]
    const values = { name: '' }
    const onSubmit = vi.fn()

    render(<DynamicConfigForm fields={fields} values={values} onSubmit={onSubmit} loading={true} />)

    const button = screen.getByRole('button', { name: /saving/i })
    expect(button).toBeDisabled()
  })

  it('calls onSubmit with form values on submit', () => {
    const fields = [
      { key: 'username', label: 'Username', type: 'text' as const, required: true },
      { key: 'password', label: 'Password', type: 'password' as const, required: true },
    ]
    const values = { username: '', password: '' }
    const onSubmit = vi.fn()

    render(<DynamicConfigForm fields={fields} values={values} onSubmit={onSubmit} submitLabel="Save" />)

    const inputs = screen.getAllByDisplayValue('')
    fireEvent.change(inputs[0], { target: { value: 'testuser' } })
    fireEvent.change(inputs[1], { target: { value: 'password123' } })

    const submitButton = screen.getByRole('button', { name: /save/i })
    fireEvent.click(submitButton)

    expect(onSubmit).toHaveBeenCalledWith({ username: 'testuser', password: 'password123' })
  })

  it('updates form values on user input', () => {
    const fields = [
      { key: 'name', label: 'Name', type: 'text' as const, required: true },
      { key: 'bio', label: 'Bio', type: 'textarea' as const, required: false },
    ]
    const values = { name: '', bio: '' }
    const onSubmit = vi.fn()

    render(<DynamicConfigForm fields={fields} values={values} onSubmit={onSubmit} />)

    const inputs = screen.getAllByDisplayValue('')
    fireEvent.change(inputs[0], { target: { value: 'John Doe' } })
    fireEvent.change(inputs[1], { target: { value: 'Software engineer' } })

    expect(inputs[0]).toHaveValue('John Doe')
    expect(inputs[1]).toHaveValue('Software engineer')
  })

  it('preserves initial values in form state', () => {
    const fields = [
      { key: 'username', label: 'Username', type: 'text' as const, required: true },
      { key: 'email', label: 'Email', type: 'text' as const, required: true },
    ]
    const values = { username: 'existing_user', email: 'user@example.com' }
    const onSubmit = vi.fn()

    render(<DynamicConfigForm fields={fields} values={values} onSubmit={onSubmit} />)

    expect(screen.getByDisplayValue('existing_user')).toBeInTheDocument()
    expect(screen.getByDisplayValue('user@example.com')).toBeInTheDocument()

    const submitButton = screen.getByRole('button', { name: /save/i })
    fireEvent.click(submitButton)

    expect(onSubmit).toHaveBeenCalledWith({ username: 'existing_user', email: 'user@example.com' })
  })

  it('allows modifying initial values', () => {
    const fields = [
      { key: 'username', label: 'Username', type: 'text' as const, required: true },
    ]
    const values = { username: 'old_name' }
    const onSubmit = vi.fn()

    render(<DynamicConfigForm fields={fields} values={values} onSubmit={onSubmit} />)

    const input = screen.getByDisplayValue('old_name') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'new_name' } })

    const submitButton = screen.getByRole('button', { name: /save/i })
    fireEvent.click(submitButton)

    expect(onSubmit).toHaveBeenCalledWith({ username: 'new_name' })
  })

  it('handles multiple password fields independently', () => {
    const fields = [
      { key: 'password', label: 'Password', type: 'password' as const, required: true },
      { key: 'confirmPassword', label: 'Confirm Password', type: 'password' as const, required: true },
    ]
    const values = { password: 'secret1', confirmPassword: 'secret2' }
    const onSubmit = vi.fn()

    render(<DynamicConfigForm fields={fields} values={values} onSubmit={onSubmit} />)

    const buttons = screen.getAllByRole('button').filter(b => b.textContent === 'Show' || b.textContent === 'Hide')
    const input1 = screen.getByDisplayValue('secret1')
    const input2 = screen.getByDisplayValue('secret2')

    // Show first password
    fireEvent.click(buttons[0])
    expect(input1).toHaveAttribute('type', 'text')
    expect(input2).toHaveAttribute('type', 'password')

    // Show second password
    fireEvent.click(buttons[1])
    expect(input1).toHaveAttribute('type', 'text')
    expect(input2).toHaveAttribute('type', 'text')
  })

  it('prevents form submission when input is required but empty', () => {
    const fields = [
      { key: 'username', label: 'Username', type: 'text' as const, required: true },
    ]
    const values = { username: '' }
    const onSubmit = vi.fn()

    render(<DynamicConfigForm fields={fields} values={values} onSubmit={onSubmit} />)

    const submitButton = screen.getByRole('button', { name: /save/i })
    fireEvent.click(submitButton)

    // The onSubmit might not be called due to browser validation, or if it is, the value should be empty
    // This depends on implementation - the component uses HTML required attribute
    expect(onSubmit).not.toHaveBeenCalled()
  })
})
