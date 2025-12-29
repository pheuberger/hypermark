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
  // Map custom variants to DaisyUI classes
  const variants = {
    primary: 'btn-primary',
    secondary: 'btn-secondary',
    danger: 'btn-error',
    ghost: 'btn-ghost',
  }

  // Map sizes to DaisyUI classes
  const sizes = {
    small: 'btn-sm',
    medium: 'btn-md',
    large: 'btn-lg',
  }

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`btn ${variants[variant]} ${sizes[size]} ${className}`}
    >
      {children}
    </button>
  )
}
