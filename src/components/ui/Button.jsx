/**
 * Reusable button component with variants using DaisyUI
 */
export function Button({
  children,
  variant = 'primary',
  size = 'medium',
  disabled = false,
  onClick,
  type = 'button',
  className = '',
}) {
  // Map custom variants to shadcn-like DaisyUI classes
  const variants = {
    primary: 'btn-neutral text-neutral-content shadow-sm hover:opacity-90',
    secondary: 'btn-ghost bg-base-200 text-base-content hover:bg-base-300 shadow-sm',
    ghost: 'btn-ghost hover:bg-base-200 text-base-content/80 hover:text-base-content',
    danger: 'btn-error text-error-content shadow-sm',
    outline: 'btn-outline border-base-300 hover:bg-base-200 text-base-content',
  }

  // Map sizes to DaisyUI classes
  const sizes = {
    small: 'btn-sm h-8 px-3 text-xs',
    medium: 'btn-md h-9 px-4 py-2',
    large: 'btn-lg h-10 px-8',
    icon: 'btn-square h-9 w-9 p-0',
  }

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`
        btn font-medium rounded-md transition-all duration-200
        ${variants[variant]} 
        ${sizes[size]} 
        ${className}
      `}
    >
      {children}
    </button>
  )
}
