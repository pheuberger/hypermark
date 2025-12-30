import { Button as ShadcnButton } from './button'
import { cn } from '@/utils/cn'

export function Button({
  children,
  variant = 'primary',
  size = 'medium',
  disabled = false,
  onClick,
  type = 'button',
  className = '',
}) {
  const variantMap = {
    primary: 'default',
    secondary: 'secondary',
    ghost: 'ghost',
    danger: 'destructive',
    outline: 'outline',
  }

  const sizeMap = {
    small: 'sm',
    medium: 'default',
    large: 'lg',
    icon: 'icon',
  }

  return (
    <ShadcnButton
      type={type}
      onClick={onClick}
      disabled={disabled}
      variant={variantMap[variant] || 'default'}
      size={sizeMap[size] || 'default'}
      className={className}
    >
      {children}
    </ShadcnButton>
  )
}
