import { X } from './Icons'

/**
 * Tag chip component using DaisyUI badge
 */
export function Tag({ children, onRemove, onClick, variant = 'default' }) {
  // Map variants to DaisyUI badge classes
  const variants = {
    default: 'badge-primary',
    selected: 'badge-accent',
    gray: 'badge-secondary',
  }

  return (
    <span
      className={`
        badge badge-lg gap-1
        ${variants[variant]}
        ${onClick ? 'cursor-pointer hover:opacity-80' : ''}
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
          className="ml-1 hover:text-error transition-colors"
          aria-label="Remove tag"
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </span>
  )
}
