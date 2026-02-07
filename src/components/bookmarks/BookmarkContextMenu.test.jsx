import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BookmarkContextMenu } from './BookmarkContextMenu'

const Pencil = (props) => <svg data-testid="pencil-icon" {...props} />
const Trash = (props) => <svg data-testid="trash-icon" {...props} />

const defaultActions = [
  { id: 'edit', label: 'Edit', icon: Pencil, shortcut: 'E', handler: vi.fn() },
  { id: 'delete', label: 'Delete', icon: Trash, shortcut: 'D', variant: 'destructive', handler: vi.fn() },
]

const defaultPosition = { x: 100, y: 200 }

function renderMenu(props = {}) {
  const onClose = vi.fn()
  const actions = props.actions || defaultActions.map(a => ({ ...a, handler: vi.fn() }))
  const result = render(
    <BookmarkContextMenu
      actions={actions}
      position={props.position || defaultPosition}
      onClose={onClose}
    />
  )
  return { ...result, onClose, actions }
}

describe('BookmarkContextMenu', () => {
  it('renders all actions', () => {
    renderMenu()
    expect(screen.getByText('Edit')).toBeInTheDocument()
    expect(screen.getByText('Delete')).toBeInTheDocument()
  })

  it('renders search input with placeholder', () => {
    renderMenu()
    expect(screen.getByPlaceholderText('Search actions...')).toBeInTheDocument()
  })

  it('renders shortcut hints', () => {
    renderMenu()
    expect(screen.getByText('E')).toBeInTheDocument()
    expect(screen.getByText('D')).toBeInTheDocument()
  })

  it('filters actions by search query', async () => {
    const user = userEvent.setup()
    renderMenu()
    const input = screen.getByPlaceholderText('Search actions...')
    await user.type(input, 'edi')
    expect(screen.getByText('Edit')).toBeInTheDocument()
    expect(screen.queryByText('Delete')).not.toBeInTheDocument()
  })

  it('shows "No actions found" when search matches nothing', async () => {
    const user = userEvent.setup()
    renderMenu()
    const input = screen.getByPlaceholderText('Search actions...')
    await user.type(input, 'zzzzz')
    expect(screen.getByText('No actions found')).toBeInTheDocument()
  })

  it('calls action handler and onClose when action clicked', async () => {
    const user = userEvent.setup()
    const { actions, onClose } = renderMenu()
    await user.click(screen.getByText('Edit'))
    expect(actions[0].handler).toHaveBeenCalledOnce()
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('calls onClose when backdrop is clicked', async () => {
    const user = userEvent.setup()
    const { onClose } = renderMenu()
    // The backdrop is the first child in the portal - a fixed inset-0 div
    const backdrop = document.querySelector('.fixed.inset-0.z-40')
    await user.click(backdrop)
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('calls onClose on Escape key', () => {
    const { onClose } = renderMenu()
    fireEvent.keyDown(screen.getByPlaceholderText('Search actions...'), { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('selects action with Enter key', () => {
    const { actions, onClose } = renderMenu()
    const input = screen.getByPlaceholderText('Search actions...')
    // First action is selected by default
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(actions[0].handler).toHaveBeenCalledOnce()
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('navigates with ArrowDown and selects with Enter', () => {
    const { actions, onClose } = renderMenu()
    const input = screen.getByPlaceholderText('Search actions...')
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(actions[1].handler).toHaveBeenCalledOnce()
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('navigates with ArrowUp after ArrowDown', () => {
    const { actions, onClose } = renderMenu()
    const input = screen.getByPlaceholderText('Search actions...')
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'ArrowUp' })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(actions[0].handler).toHaveBeenCalledOnce()
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('does not go below last action with ArrowDown', () => {
    const { actions, onClose } = renderMenu()
    const input = screen.getByPlaceholderText('Search actions...')
    // Press down 10 times - should stop at index 1 (last)
    for (let i = 0; i < 10; i++) {
      fireEvent.keyDown(input, { key: 'ArrowDown' })
    }
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(actions[1].handler).toHaveBeenCalledOnce()
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('does not go above first action with ArrowUp', () => {
    const { actions, onClose } = renderMenu()
    const input = screen.getByPlaceholderText('Search actions...')
    // Press up 10 times - should stay at index 0
    for (let i = 0; i < 10; i++) {
      fireEvent.keyDown(input, { key: 'ArrowUp' })
    }
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(actions[0].handler).toHaveBeenCalledOnce()
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('closes on contextmenu event on backdrop', () => {
    const { onClose } = renderMenu()
    const backdrop = document.querySelector('.fixed.inset-0.z-40')
    fireEvent.contextMenu(backdrop)
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('closes on scroll', () => {
    const { onClose } = renderMenu()
    fireEvent.scroll(window)
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('renders at the given position', () => {
    renderMenu({ position: { x: 150, y: 250 } })
    const menu = document.querySelector('[style*="position: fixed"]')
    expect(menu.style.left).toBe('150px')
    expect(menu.style.top).toBe('250px')
  })

  it('resets selection index when search changes', async () => {
    const user = userEvent.setup()
    const { actions, onClose } = renderMenu()
    const input = screen.getByPlaceholderText('Search actions...')
    // Move to second item
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    // Type to filter - should reset to index 0
    await user.type(input, 'Del')
    fireEvent.keyDown(input, { key: 'Enter' })
    // After filtering to "Delete" only, index 0 is "Delete"
    expect(actions[1].handler).toHaveBeenCalledOnce()
    expect(onClose).toHaveBeenCalledOnce()
  })
})
