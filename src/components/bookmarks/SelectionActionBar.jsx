import { useState } from 'react'
import { Hash, BookmarkPlus, Trash, X } from '../ui/Icons'

export function SelectionActionBar({ selectedCount, onTag, onReadLater, onDelete, onCancel }) {
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  if (selectedCount === 0) return null

  return (
    <div className="fixed bottom-0 inset-x-0 z-50 pb-[env(safe-area-inset-bottom)] sm:pb-0 sm:bottom-6 sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 animate-in fade-in slide-in-from-bottom-4 duration-200">
      <div className="flex items-center justify-between sm:justify-start gap-1 sm:gap-2 px-3 sm:px-4 py-2.5 bg-popover border-t sm:border border-border sm:rounded-lg shadow-lg whitespace-nowrap">
        <span className="text-sm font-medium text-foreground pr-1 sm:pr-2 flex-shrink-0">
          <span className="hidden sm:inline">{selectedCount} selected</span>
          <span className="sm:hidden">{selectedCount}</span>
        </span>

        <div className="w-px h-5 bg-border flex-shrink-0" />

        {confirmingDelete ? (
          <>
            <span className="text-sm text-destructive font-medium truncate">
              Delete {selectedCount} bookmark{selectedCount > 1 ? 's' : ''}?
            </span>
            <button
              onClick={() => { setConfirmingDelete(false); onDelete() }}
              className="px-3 py-2 text-sm font-medium bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-md transition-colors flex-shrink-0"
            >
              Confirm
            </button>
            <button
              onClick={() => setConfirmingDelete(false)}
              className="flex items-center gap-1.5 px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors flex-shrink-0"
            >
              Cancel
            </button>
          </>
        ) : (
          <>
            <button
              onClick={onTag}
              className="flex items-center gap-1.5 px-2.5 sm:px-3 py-2 text-sm font-medium text-foreground hover:bg-accent rounded-md transition-colors flex-shrink-0"
            >
              <Hash className="w-4 h-4" strokeWidth={1.5} />
              Tag
            </button>
            <button
              onClick={onReadLater}
              className="flex items-center gap-1.5 px-2.5 sm:px-3 py-2 text-sm font-medium text-foreground hover:bg-accent rounded-md transition-colors flex-shrink-0"
            >
              <BookmarkPlus className="w-4 h-4" strokeWidth={1.5} />
              <span className="hidden min-[400px]:inline">Read Later</span>
              <span className="min-[400px]:hidden">Later</span>
            </button>
            <button
              onClick={() => setConfirmingDelete(true)}
              className="flex items-center gap-1.5 px-2.5 sm:px-3 py-2 text-sm font-medium text-destructive hover:bg-destructive/10 rounded-md transition-colors flex-shrink-0"
            >
              <Trash className="w-4 h-4" strokeWidth={1.5} />
              Delete {selectedCount}
            </button>
            <button
              onClick={onCancel}
              aria-label="Cancel selection"
              className="flex items-center gap-1.5 px-2.5 sm:px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors flex-shrink-0"
            >
              <X className="w-4 h-4" strokeWidth={1.5} />
              <span className="hidden sm:inline">Cancel</span>
            </button>
          </>
        )}
      </div>
    </div>
  )
}
