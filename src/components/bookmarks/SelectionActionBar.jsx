import { Trash, X } from '../ui/Icons'

export function SelectionActionBar({ selectedCount, onDelete, onCancel }) {
  if (selectedCount === 0) return null

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-bottom-4 duration-200">
      <div className="flex items-center gap-2 px-4 py-2.5 bg-popover border border-border rounded-lg shadow-lg">
        <span className="text-sm font-medium text-foreground pr-2">
          {selectedCount} selected
        </span>

        <div className="w-px h-5 bg-border" />

        <button
          onClick={onDelete}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-destructive hover:bg-destructive/10 rounded-md transition-colors"
        >
          <Trash className="w-4 h-4" strokeWidth={1.5} />
          Delete
        </button>

        <button
          onClick={onCancel}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors"
        >
          <X className="w-4 h-4" strokeWidth={1.5} />
          Cancel
        </button>
      </div>
    </div>
  )
}
