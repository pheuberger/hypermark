/**
 * Reusable input component
 */
export function Input({
  label,
  type = 'text',
  value,
  onChange,
  placeholder,
  required = false,
  error,
  disabled = false,
  className = '',
  ...props
}) {
  const id = props.id || `input-${Math.random().toString(36).substr(2, 9)}`

  return (
    <div className={`mb-4 ${className}`}>
      {label && (
        <label
          htmlFor={id}
          className="block text-sm font-medium text-base-content/80 mb-1.5"
        >
          {label}
          {required && <span className="text-error ml-1">*</span>}
        </label>
      )}
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        className={`
          flex h-10 w-full rounded-md border bg-transparent px-3 py-2 text-sm
          border-base-content/20 
          file:border-0 file:bg-transparent file:text-sm file:font-medium
          placeholder:text-base-content/50
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-base-content/20 focus-visible:ring-offset-2 focus-visible:ring-offset-base-100
          disabled:cursor-not-allowed disabled:opacity-50
          transition-colors
          ${error ? 'border-error focus-visible:ring-error/30' : ''}
        `}
        {...props}
      />
      {error && (
        <p className="mt-1.5 text-xs text-error font-medium">{error}</p>
      )}
    </div>
  )
}

/**
 * Reusable textarea component
 */
export function TextArea({
  label,
  value,
  onChange,
  placeholder,
  required = false,
  error,
  disabled = false,
  rows = 3,
  className = '',
  ...props
}) {
  const id = props.id || `textarea-${Math.random().toString(36).substr(2, 9)}`

  return (
    <div className={`mb-4 ${className}`}>
      {label && (
        <label
          htmlFor={id}
          className="block text-sm font-medium text-base-content/80 mb-1.5"
        >
          {label}
          {required && <span className="text-error ml-1">*</span>}
        </label>
      )}
      <textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        rows={rows}
        className={`
          flex min-h-[80px] w-full rounded-md border bg-transparent px-3 py-2 text-sm
          border-base-content/20
          placeholder:text-base-content/50
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-base-content/20 focus-visible:ring-offset-2 focus-visible:ring-offset-base-100
          disabled:cursor-not-allowed disabled:opacity-50
          transition-colors resize-none
          ${error ? 'border-error focus-visible:ring-error/30' : ''}
        `}
        {...props}
      />
      {error && (
        <p className="mt-1.5 text-xs text-error font-medium">{error}</p>
      )}
    </div>
  )
}
