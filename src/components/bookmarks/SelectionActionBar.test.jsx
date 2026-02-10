import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SelectionActionBar } from './SelectionActionBar'

vi.mock('../ui/Icons', () => ({
  Hash: (props) => <svg data-testid="hash-icon" {...props} />,
  BookmarkPlus: (props) => <svg data-testid="bookmark-plus-icon" {...props} />,
  Trash: (props) => <svg data-testid="trash-icon" {...props} />,
  X: (props) => <svg data-testid="x-icon" {...props} />,
}))

function renderBar(props = {}) {
  const defaultProps = {
    selectedCount: 3,
    onTag: vi.fn(),
    onReadLater: vi.fn(),
    onDelete: vi.fn(),
    onCancel: vi.fn(),
    ...props,
  }
  const result = render(<SelectionActionBar {...defaultProps} />)
  return { ...result, ...defaultProps }
}

describe('SelectionActionBar', () => {
  it('returns null when selectedCount is 0', () => {
    const { container } = renderBar({ selectedCount: 0 })
    expect(container.innerHTML).toBe('')
  })

  it('renders count label "N selected" when selectedCount > 0', () => {
    renderBar({ selectedCount: 5 })
    expect(screen.getByText('5 selected')).toBeInTheDocument()
  })

  it('renders all 4 action buttons: Tag, Read Later, Delete, Cancel', () => {
    renderBar()
    expect(screen.getByText('Tag')).toBeInTheDocument()
    expect(screen.getByText('Read Later')).toBeInTheDocument()
    expect(screen.getByText(/^Delete\s+3$/)).toBeInTheDocument()
    expect(screen.getByText('Cancel')).toBeInTheDocument()
  })

  it('Delete button shows count: "Delete 3" when selectedCount=3', () => {
    renderBar({ selectedCount: 3 })
    expect(screen.getByText(/^Delete\s+3$/)).toBeInTheDocument()
  })

  it('clicking Tag calls onTag', async () => {
    const user = userEvent.setup()
    const { onTag } = renderBar()
    await user.click(screen.getByText('Tag'))
    expect(onTag).toHaveBeenCalledOnce()
  })

  it('clicking Read Later calls onReadLater', async () => {
    const user = userEvent.setup()
    const { onReadLater } = renderBar()
    await user.click(screen.getByText('Read Later'))
    expect(onReadLater).toHaveBeenCalledOnce()
  })

  it('clicking Cancel calls onCancel', async () => {
    const user = userEvent.setup()
    const { onCancel } = renderBar()
    await user.click(screen.getByText('Cancel'))
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('clicking Delete shows inline confirmation text "Delete 3 bookmarks?"', async () => {
    const user = userEvent.setup()
    renderBar({ selectedCount: 3 })
    await user.click(screen.getByText(/^Delete\s+3$/))
    expect(screen.getByText('Delete 3 bookmarks?')).toBeInTheDocument()
    expect(screen.getByText('Confirm')).toBeInTheDocument()
  })

  it('in confirmation state: Confirm button calls onDelete', async () => {
    const user = userEvent.setup()
    const { onDelete } = renderBar({ selectedCount: 3 })
    await user.click(screen.getByText(/^Delete\s+3$/))
    await user.click(screen.getByText('Confirm'))
    expect(onDelete).toHaveBeenCalledOnce()
  })

  it('in confirmation state: Cancel button returns to normal action buttons', async () => {
    const user = userEvent.setup()
    renderBar({ selectedCount: 3 })
    await user.click(screen.getByText(/^Delete\s+3$/))
    // Should be in confirmation state
    expect(screen.getByText('Delete 3 bookmarks?')).toBeInTheDocument()
    // Click Cancel in confirmation
    await user.click(screen.getByText('Cancel'))
    // Should return to normal state with all 4 action buttons
    expect(screen.getByText('Tag')).toBeInTheDocument()
    expect(screen.getByText('Read Later')).toBeInTheDocument()
    expect(screen.getByText(/^Delete\s+3$/)).toBeInTheDocument()
    expect(screen.queryByText('Delete 3 bookmarks?')).not.toBeInTheDocument()
  })

  it('singular grammar: "Delete 1 bookmark?" when selectedCount=1', async () => {
    const user = userEvent.setup()
    renderBar({ selectedCount: 1 })
    await user.click(screen.getByText(/^Delete\s+1$/))
    expect(screen.getByText('Delete 1 bookmark?')).toBeInTheDocument()
  })
})
