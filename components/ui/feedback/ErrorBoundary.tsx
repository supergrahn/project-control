'use client'
import React from 'react'
import { Button } from '../buttons/Button'

type ErrorBoundaryProps = {
  fallback?: React.ReactNode
  children: React.ReactNode
}

type ErrorBoundaryState = {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback

      return (
        <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
          <div className="text-[13px] text-text-primary mb-2">Something went wrong</div>
          <div className="text-[11px] text-text-muted mb-4 max-w-md">
            {this.state.error?.message}
          </div>
          <Button variant="secondary" size="sm" onClick={this.handleRetry}>
            Try again
          </Button>
        </div>
      )
    }

    return this.props.children
  }
}
