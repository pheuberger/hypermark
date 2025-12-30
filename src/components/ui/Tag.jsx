import { X } from './Icons'

/**
 * Tag chip component using DaisyUI badge
 */
export function Tag({ children, onRemove, onClick, variant = 'default' }) {
  // Map variants to DaisyUI badge classes
  const variants = {
    default: 'badge-neutral bg-base-200 text-base-content border-base-300',
    selected: 'badge-primary text-primary-content',
    gray: 'badge-ghost bg-base-100 text-base-content/60',
  }

  return (
    <span
      className={`
        badge gap-1.5 h-6 px-2.5 rounded-md text-xs font-medium border
        ${variants[variant]}
        ${onClick ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''}
      `}
      onClick={onClick}
    >
      {children}
      {onRemove && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
          className="ml-0.5 hover:text-error transition-colors p-0.5 rounded-full hover:bg-base-content/10"
          aria-label="Remove tag"
        >
          <X className="w-3 h-3" strokeWidth={2} />
        </button>
      )}
    </span>
  )
}
