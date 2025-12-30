import * as React from "react"
import { ChevronDown } from "lucide-react"
import { cn } from "@/utils/cn"

const Select = React.forwardRef(({ className, children, ...props }, ref) => (
  <div className="relative inline-block">
    <select
      ref={ref}
      className={cn(
        "appearance-none rounded-md border border-input bg-secondary/50 px-3 py-1.5 pr-8 text-sm",
        "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    >
      {children}
    </select>
    <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 opacity-50" />
  </div>
))
Select.displayName = "Select"

const SelectOption = React.forwardRef(({ className, ...props }, ref) => (
  <option ref={ref} className={cn("bg-popover", className)} {...props} />
))
SelectOption.displayName = "SelectOption"

export { Select, SelectOption }
