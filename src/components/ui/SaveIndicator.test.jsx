import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { SaveIndicator } from './SaveIndicator.jsx'

vi.mock('lucide-react', () => ({
  Check: (props) => <svg data-testid="icon-check" {...props} />,
}))

describe('SaveIndicator', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders nothing when show is 0', () => {
    const { container } = render(<SaveIndicator show={0} />)
    expect(container.querySelector('span')).toBeNull()
    expect(screen.queryByText('Saved')).toBeNull()
  })

  it('renders "Saved" text and Check icon when show increments to 1', () => {
    const { rerender } = render(<SaveIndicator show={0} />)
    rerender(<SaveIndicator show={1} />)

    expect(screen.getByText('Saved')).toBeInTheDocument()
    expect(screen.getByTestId('icon-check')).toBeInTheDocument()
  })

  it('hides after ~1 second', () => {
    const { rerender } = render(<SaveIndicator show={0} />)
    rerender(<SaveIndicator show={1} />)

    expect(screen.getByText('Saved')).toBeInTheDocument()

    act(() => { vi.advanceTimersByTime(1100) })

    expect(screen.queryByText('Saved')).toBeNull()
  })

  it('applies leaving class after 800ms', () => {
    const { rerender } = render(<SaveIndicator show={0} />)
    rerender(<SaveIndicator show={1} />)

    const span = screen.getByText('Saved').closest('span')
    expect(span.className).toContain('opacity-100')

    act(() => { vi.advanceTimersByTime(850) })

    // Still visible but fading
    expect(screen.getByText('Saved')).toBeInTheDocument()
    const spanAfter = screen.getByText('Saved').closest('span')
    expect(spanAfter.className).toContain('opacity-0')
  })

  it('re-triggers animation when show increments again', () => {
    const { rerender } = render(<SaveIndicator show={0} />)
    rerender(<SaveIndicator show={1} />)
    expect(screen.getByText('Saved')).toBeInTheDocument()

    // Let it fully hide
    act(() => { vi.advanceTimersByTime(1100) })
    expect(screen.queryByText('Saved')).toBeNull()

    // Trigger again
    rerender(<SaveIndicator show={2} />)
    expect(screen.getByText('Saved')).toBeInTheDocument()
  })

  it('re-triggers animation even while still visible', () => {
    const { rerender } = render(<SaveIndicator show={0} />)
    rerender(<SaveIndicator show={1} />)

    // Advance partway (in leaving phase)
    act(() => { vi.advanceTimersByTime(850) })
    const spanLeaving = screen.getByText('Saved').closest('span')
    expect(spanLeaving.className).toContain('opacity-0')

    // Trigger again - should reset to visible
    rerender(<SaveIndicator show={2} />)
    const spanReset = screen.getByText('Saved').closest('span')
    expect(spanReset.className).toContain('opacity-100')
  })

  it('has aria-live="polite" attribute when visible', () => {
    const { rerender } = render(<SaveIndicator show={0} />)
    rerender(<SaveIndicator show={1} />)

    const span = screen.getByText('Saved').closest('span')
    expect(span).toHaveAttribute('aria-live', 'polite')
  })
})
