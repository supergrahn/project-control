import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Badge } from '../Badge'
import { EmptyState } from '../EmptyState'
import { Skeleton } from '../Skeleton'

describe('Badge', () => {
  it('renders children', () => {
    render(<Badge color="accent-blue">Active</Badge>)
    expect(screen.getByText('Active')).toBeInTheDocument()
  })
  it('applies color as background and text', () => {
    const { container } = render(<Badge color="accent-green">Live</Badge>)
    const badge = container.firstChild as HTMLElement
    expect(badge.className).toContain('accent-green')
  })
  it('applies variant classes', () => {
    const { container } = render(<Badge variant="priority" color="accent-red">Urgent</Badge>)
    const badge = container.firstChild as HTMLElement
    expect(badge.className).toContain('uppercase')
  })
})

describe('EmptyState', () => {
  it('renders title', () => {
    render(<EmptyState title="No tasks yet" />)
    expect(screen.getByText('No tasks yet')).toBeInTheDocument()
  })
  it('renders description when provided', () => {
    render(<EmptyState title="Empty" description="Create your first task" />)
    expect(screen.getByText('Create your first task')).toBeInTheDocument()
  })
  it('renders action button when provided', () => {
    render(<EmptyState title="Empty" action={{ label: 'Create', onClick: () => {} }} />)
    expect(screen.getByRole('button', { name: 'Create' })).toBeInTheDocument()
  })
  it('does not render action when not provided', () => {
    render(<EmptyState title="Empty" />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})

describe('Skeleton', () => {
  it('renders line variant', () => {
    const { container } = render(<Skeleton variant="line" />)
    expect(container.firstChild).toBeInTheDocument()
  })
  it('renders card variant', () => {
    const { container } = render(<Skeleton variant="card" />)
    const el = container.firstChild as HTMLElement
    expect(el.className).toContain('animate-pulse')
  })
  it('renders circle variant', () => {
    const { container } = render(<Skeleton variant="circle" />)
    const el = container.firstChild as HTMLElement
    expect(el.className).toContain('rounded-full')
  })
})
