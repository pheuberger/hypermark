import { X } from './Icons'
import { Badge } from './badge'
import { cn } from '@/lib/utils'

export function Tag({ children, onRemove, onClick, variant = 'default' }) {
  const variants = {
    default: 'bg-secondary text-secondary-foreground',
    selected: 'bg-primary text-primary-foreground',
    gray: 'bg-muted text-muted-foreground',
  }

  return (
    <Badge
      className={cn(
        'gap-1.5 h-6 px-2.5 rounded-md text-xs font-medium cursor-default',
        variants[variant],
        onClick && 'cursor-pointer hover:opacity-80 transition-opacity'
      )}
      onClick={onClick}
      variant="outline"
    >
      {children}
      {onRemove && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
          className="ml-0.5 hover:text-destructive transition-colors p-0.5 rounded-full hover:bg-foreground/10"
          aria-label="Remove tag"
        >
          <X className="w-3 h-3" strokeWidth={2} />
        </button>
      )}
    </Badge>
  )
}
