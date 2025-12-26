/**
 * Tag chip component
 */
export function Tag({ children, onRemove, onClick, variant = 'default' }) {
  const variants = {
    default: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    selected: 'bg-primary text-white',
    gray: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
  }

  return (
    <span
      className={`
        inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium
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
          className="ml-1 hover:text-red-600 transition-colors"
          aria-label="Remove tag"
        >
          <svg
            className="w-3 h-3"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </span>
  )
}
