import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { OfflineBanner } from './OfflineBanner.jsx'

vi.mock('lucide-react', () => ({
  WifiOff: (props) => <svg data-testid="icon-wifi-off" {...props} />,
}))

describe('OfflineBanner', () => {
  it('renders the offline message text', () => {
    render(<OfflineBanner />)
    expect(screen.getByText("You're offline. Changes will sync when you reconnect.")).toBeInTheDocument()
  })

  it('renders WifiOff icon', () => {
    render(<OfflineBanner />)
    expect(screen.getByTestId('icon-wifi-off')).toBeInTheDocument()
  })

  it('has role="alert" attribute', () => {
    render(<OfflineBanner />)
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  it('contains correct amber styling classes', () => {
    render(<OfflineBanner />)
    const banner = screen.getByRole('alert')
    expect(banner.className).toContain('bg-amber-500/15')
    expect(banner.className).toContain('border-amber-500/20')
    expect(banner.className).toContain('text-amber-400')
  })
})
