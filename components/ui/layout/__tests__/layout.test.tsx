import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Card } from '../Card'
import { Modal } from '../Modal'
import { Drawer } from '../Drawer'
import { SectionHeader } from '../SectionHeader'
import { Divider } from '../Divider'

describe('Card', () => {
  it('renders children', () => {
    render(<Card>Content</Card>)
    expect(screen.getByText('Content')).toBeInTheDocument()
  })
  it('applies interactive class when onClick provided', () => {
    const { container } = render(<Card onClick={() => {}}>Click</Card>)
    const card = container.firstChild as HTMLElement
    expect(card.className).toContain('cursor-pointer')
  })
})

describe('Modal', () => {
  it('renders when open', () => {
    render(<Modal open onClose={() => {}} title="Test">Body</Modal>)
    expect(screen.getByText('Test')).toBeInTheDocument()
    expect(screen.getByText('Body')).toBeInTheDocument()
  })
  it('does not render when closed', () => {
    render(<Modal open={false} onClose={() => {}} title="Test">Body</Modal>)
    expect(screen.queryByText('Test')).not.toBeInTheDocument()
  })
  it('calls onClose on Escape', () => {
    const onClose = vi.fn()
    render(<Modal open onClose={onClose} title="Test">Body</Modal>)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })
  it('calls onClose on backdrop click', () => {
    const onClose = vi.fn()
    render(<Modal open onClose={onClose} title="Test">Body</Modal>)
    fireEvent.click(screen.getByTestId('modal-backdrop'))
    expect(onClose).toHaveBeenCalled()
  })
  it('renders actions in footer', () => {
    render(
      <Modal open onClose={() => {}} title="Test" actions={<button>Save</button>}>Body</Modal>
    )
    expect(screen.getByText('Save')).toBeInTheDocument()
  })
})

describe('Drawer', () => {
  it('renders when open', () => {
    render(<Drawer open onClose={() => {}} title="Details">Content</Drawer>)
    expect(screen.getByText('Details')).toBeInTheDocument()
  })
  it('does not render when closed', () => {
    render(<Drawer open={false} onClose={() => {}}>Content</Drawer>)
    expect(screen.queryByText('Content')).not.toBeInTheDocument()
  })
})

describe('SectionHeader', () => {
  it('renders title', () => {
    render(<SectionHeader title="Settings" />)
    expect(screen.getByText('Settings')).toBeInTheDocument()
  })
  it('renders action', () => {
    render(<SectionHeader title="Tasks" action={<button>Add</button>} />)
    expect(screen.getByText('Add')).toBeInTheDocument()
  })
})

describe('Divider', () => {
  it('renders an hr element', () => {
    const { container } = render(<Divider />)
    expect(container.querySelector('hr')).toBeInTheDocument()
  })
})
