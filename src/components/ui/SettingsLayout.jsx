import { cn } from '@/utils/cn'
import { Card } from './card'

export function SettingSection({ title, children }) {
  return (
    <div className="mb-8">
      {title && (
        <h2 className="text-sm font-medium text-muted-foreground mb-3 px-1">{title}</h2>
      )}
      {children}
    </div>
  )
}

export function SettingRow({ label, description, children, isLast = false, className, onClick }) {
  return (
    <div 
      className={cn(
        "flex items-center justify-between gap-4 px-4 py-4",
        !isLast && "border-b border-border",
        onClick && "cursor-pointer hover:bg-muted/50 transition-colors",
        className
      )}
      onClick={onClick}
    >
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm">{label}</div>
        {description && (
          <div className="text-sm text-muted-foreground mt-0.5">{description}</div>
        )}
      </div>
      {children && <div className="flex-shrink-0">{children}</div>}
    </div>
  )
}

export function SettingCard({ children, className }) {
  return (
    <Card className={cn("bg-card/50 border-border/50 overflow-hidden", className)}>
      {children}
    </Card>
  )
}

export function SettingsContainer({ children, className }) {
  return (
    <div className={cn("w-full px-6 py-8", className)}>
      {children}
    </div>
  )
}
