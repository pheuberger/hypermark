import { useState } from 'react'
import { Hash, BookmarkPlus, Trash, X } from '../ui/Icons'

export function SelectionActionBar({ selectedCount, onTag, onReadLater, onDelete, onCancel }) {
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  if (selectedCount === 0) return null

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-bottom-4 duration-200">
      <div className="flex items-center gap-2 px-4 py-2.5 bg-popover border border-border rounded-lg shadow-lg">
        <span className="text-sm font-medium text-foreground pr-2">
          {selectedCount} selected
        </span>

        <div className="w-px h-5 bg-border" />

        {confirmingDelete ? (
          <>
            <span className="text-sm text-destructive font-medium">
              Delete {selectedCount} bookmark{selectedCount > 1 ? 's' : ''}?
            </span>
            <button
              onClick={() => { setConfirmingDelete(false); onDelete() }}
              className="px-3 py-1.5 text-sm font-medium bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-md transition-colors"
            >
              Confirm
            </button>
            <button
              onClick={() => setConfirmingDelete(false)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors"
            >
              Cancel
            </button>
          </>
        ) : (
          <>
            <button
              onClick={onTag}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-foreground hover:bg-accent rounded-md transition-colors"
            >
              <Hash className="w-4 h-4" strokeWidth={1.5} />
              Tag
            </button>
            <button
              onClick={onReadLater}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-foreground hover:bg-accent rounded-md transition-colors"
            >
              <BookmarkPlus className="w-4 h-4" strokeWidth={1.5} />
              Read Later
            </button>
            <button
              onClick={() => setConfirmingDelete(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-destructive hover:bg-destructive/10 rounded-md transition-colors"
            >
              <Trash className="w-4 h-4" strokeWidth={1.5} />
              Delete {selectedCount}
            </button>
            <button
              onClick={onCancel}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors"
            >
              <X className="w-4 h-4" strokeWidth={1.5} />
              Cancel
            </button>
          </>
        )}
      </div>
    </div>
  )
}
