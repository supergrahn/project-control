import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Tooltip } from '../Tooltip'
import { KeyValue } from '../KeyValue'

describe('Tooltip', () => {
  it('renders children', () => {
    render(<Tooltip content="Help text"><button>Hover me</button></Tooltip>)
    expect(screen.getByText('Hover me')).toBeInTheDocument()
  })
  it('renders tooltip content', () => {
    render(<Tooltip content="Help text"><button>Hover me</button></Tooltip>)
    expect(screen.getByText('Help text')).toBeInTheDocument()
  })
})

describe('KeyValue', () => {
  it('renders label and value', () => {
    render(<KeyValue label="Status" value="Active" />)
    expect(screen.getByText('Status')).toBeInTheDocument()
    expect(screen.getByText('Active')).toBeInTheDocument()
  })
})
