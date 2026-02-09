import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { WelcomeState } from './WelcomeState'

function renderWelcome(props = {}) {
  const onAddBookmark = props.onAddBookmark || vi.fn()
  const onImport = props.onImport || vi.fn()
  const onPairDevice = props.onPairDevice || vi.fn()
  const result = render(
    <WelcomeState
      onAddBookmark={onAddBookmark}
      onImport={onImport}
      onPairDevice={onPairDevice}
    />
  )
  return { ...result, onAddBookmark, onImport, onPairDevice }
}

describe('WelcomeState', () => {
  it('renders the welcome heading', () => {
    renderWelcome()
    expect(screen.getByText('Welcome to Hypermark')).toBeInTheDocument()
  })

  it('renders all three action buttons', () => {
    renderWelcome()
    expect(screen.getByText('Add your first bookmark')).toBeInTheDocument()
    expect(screen.getByText('Import from browser')).toBeInTheDocument()
    expect(screen.getByText('Pair another device')).toBeInTheDocument()
  })

  it('renders descriptions for each action', () => {
    renderWelcome()
    expect(screen.getByText('Paste a URL or enter details manually')).toBeInTheDocument()
    expect(screen.getByText('Import bookmarks from an HTML export file')).toBeInTheDocument()
    expect(screen.getByText('Sync bookmarks from an existing device')).toBeInTheDocument()
  })

  it('calls onAddBookmark when first card is clicked', async () => {
    const user = userEvent.setup()
    const { onAddBookmark } = renderWelcome()
    await user.click(screen.getByText('Add your first bookmark'))
    expect(onAddBookmark).toHaveBeenCalledOnce()
  })

  it('calls onImport when import card is clicked', async () => {
    const user = userEvent.setup()
    const { onImport } = renderWelcome()
    await user.click(screen.getByText('Import from browser'))
    expect(onImport).toHaveBeenCalledOnce()
  })

  it('calls onPairDevice when pair card is clicked', async () => {
    const user = userEvent.setup()
    const { onPairDevice } = renderWelcome()
    await user.click(screen.getByText('Pair another device'))
    expect(onPairDevice).toHaveBeenCalledOnce()
  })

  it('displays the keyboard shortcut hint', () => {
    renderWelcome()
    expect(screen.getByText('?')).toBeInTheDocument()
    expect(screen.getByText(/keyboard shortcuts/)).toBeInTheDocument()
  })
})
