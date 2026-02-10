import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { Toast } from './Toast.jsx'

// Mock lucide-react icons to make them testable
vi.mock('lucide-react', () => ({
  X: (props) => <svg data-testid="icon-x" {...props} />,
  CheckCircle2: (props) => <svg data-testid="icon-check-circle" {...props} />,
  XCircle: (props) => <svg data-testid="icon-x-circle" {...props} />,
  AlertTriangle: (props) => <svg data-testid="icon-alert-triangle" {...props} />,
  Info: (props) => <svg data-testid="icon-info" {...props} />,
}))

describe('Toast', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders CheckCircle2 icon for success type', () => {
    render(<Toast message="Success!" type="success" onClose={() => {}} />)
    expect(screen.getByTestId('icon-check-circle')).toBeInTheDocument()
  })

  it('renders XCircle icon for error type', () => {
    render(<Toast message="Error!" type="error" onClose={() => {}} />)
    expect(screen.getByTestId('icon-x-circle')).toBeInTheDocument()
  })

  it('renders AlertTriangle icon for warning type', () => {
    render(<Toast message="Warning!" type="warning" onClose={() => {}} />)
    expect(screen.getByTestId('icon-alert-triangle')).toBeInTheDocument()
  })

  it('renders Info icon for info type', () => {
    render(<Toast message="Info!" type="info" onClose={() => {}} />)
    expect(screen.getByTestId('icon-info')).toBeInTheDocument()
  })

  it('renders role="alert" for error type', () => {
    render(<Toast message="Error!" type="error" onClose={() => {}} />)
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  it('renders role="alert" for warning type', () => {
    render(<Toast message="Warning!" type="warning" onClose={() => {}} />)
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  it('renders role="status" for success type', () => {
    render(<Toast message="Success!" type="success" onClose={() => {}} />)
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('renders role="status" for info type', () => {
    render(<Toast message="Info!" type="info" onClose={() => {}} />)
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('renders a progress bar element', () => {
    const { container } = render(<Toast message="Test" type="info" duration={5000} onClose={() => {}} />)
    const progressBar = container.querySelector('.bg-current.opacity-30')
    expect(progressBar).toBeInTheDocument()
  })

  it('auto-dismiss fires onClose after duration', () => {
    const onClose = vi.fn()
    render(<Toast message="Auto" type="info" duration={3000} onClose={onClose} />)

    // Advance past the duration timer
    act(() => { vi.advanceTimersByTime(3000) })
    // Advance past the 150ms leave animation
    act(() => { vi.advanceTimersByTime(150) })

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('renders action button when action prop provided', () => {
    const action = vi.fn()
    render(<Toast message="Undo?" action={action} actionLabel="Undo" onClose={() => {}} />)
    expect(screen.getByText('Undo')).toBeInTheDocument()
  })

  it('defaults to info type when no type specified', () => {
    render(<Toast message="Default" onClose={() => {}} />)
    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.getByTestId('icon-info')).toBeInTheDocument()
  })
})
