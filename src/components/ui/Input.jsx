import { Input as ShadcnInput } from './input'
import { Label } from './label'
import { cn } from '@/lib/utils'

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
    <div className={cn('mb-4', className)}>
      {label && (
        <Label htmlFor={id} className="mb-1.5 block">
          {label}
          {required && <span className="text-destructive ml-1">*</span>}
        </Label>
      )}
      <ShadcnInput
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        className={cn(error && 'border-destructive focus-visible:ring-destructive/30')}
        {...props}
      />
      {error && (
        <p className="mt-1.5 text-xs text-destructive font-medium">{error}</p>
      )}
    </div>
  )
}

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
    <div className={cn('mb-4', className)}>
      {label && (
        <Label htmlFor={id} className="mb-1.5 block">
          {label}
          {required && <span className="text-destructive ml-1">*</span>}
        </Label>
      )}
      <textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        rows={rows}
        className={cn(
          'flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-colors resize-none',
          error && 'border-destructive focus-visible:ring-destructive/30',
          className
        )}
        {...props}
      />
      {error && (
        <p className="mt-1.5 text-xs text-destructive font-medium">{error}</p>
      )}
    </div>
  )
}
