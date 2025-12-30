import { useEffect } from 'preact/hooks'
import { X } from './Icons'

/**
 * Reusable modal dialog component using DaisyUI
 */
export function Modal({ isOpen, onClose, title, children }) {
  // Close on ESC key
  useEffect(() => {
    if (!isOpen) return

    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <dialog className="modal modal-open bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="modal-box max-w-lg bg-base-100 text-base-content p-0 rounded-lg shadow-xl border border-base-200 animate-in zoom-in-95 duration-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-base-200 bg-base-50/50">
          <h3 className="font-semibold text-lg">{title}</h3>
          <button
            onClick={onClose}
            className="btn btn-sm btn-circle btn-ghost text-base-content/50 hover:text-base-content hover:bg-base-200"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">{children}</div>
      </div>

      {/* Backdrop */}
      <form method="dialog" className="modal-backdrop">
        <button onClick={onClose} className="cursor-default">close</button>
      </form>
    </dialog>
  )
}
