import { useState, useEffect, useRef, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { Search } from '../ui/Icons'

export function BookmarkContextMenu({ actions, position, onClose }) {
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const menuRef = useRef(null)
  const inputRef = useRef(null)

  const filtered = actions.filter(a =>
    a.label.toLowerCase().includes(query.toLowerCase())
  )

  // Auto-focus search input
  useEffect(() => {
    const id = requestAnimationFrame(() => inputRef.current?.focus())
    return () => cancelAnimationFrame(id)
  }, [])

  // Close on scroll
  useEffect(() => {
    const handle = () => onClose()
    window.addEventListener('scroll', handle, true)
    return () => window.removeEventListener('scroll', handle, true)
  }, [onClose])

  // Keep menu within viewport
  useLayoutEffect(() => {
    const el = menuRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    let x = position.x
    let y = position.y
    if (x + rect.width > vw - 8) x = vw - rect.width - 8
    if (y + rect.height > vh - 8) y = vh - rect.height - 8
    if (x < 8) x = 8
    if (y < 8) y = 8
    el.style.left = `${x}px`
    el.style.top = `${y}px`
  }, [position])

  // Reset selection when search changes
  useEffect(() => { setSelectedIndex(0) }, [query])

  const handleKeyDown = (e) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setSelectedIndex(i => Math.min(i + 1, filtered.length - 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        setSelectedIndex(i => Math.max(i - 1, 0))
        break
      case 'Enter':
        e.preventDefault()
        if (filtered[selectedIndex]) {
          filtered[selectedIndex].handler()
          onClose()
        }
        break
      case 'Escape':
        e.preventDefault()
        onClose()
        break
    }
  }

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-40"
        onClick={onClose}
        onContextMenu={(e) => { e.preventDefault(); onClose() }}
      />
      <div
        ref={menuRef}
        style={{ position: 'fixed', left: position.x, top: position.y, zIndex: 50 }}
        className="min-w-[200px] max-w-[280px] bg-popover border border-border rounded-lg shadow-xl overflow-hidden"
        onKeyDown={handleKeyDown}
      >
        <div className="p-2 border-b border-border">
          <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-background/50">
            <Search className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search actions..."
              className="bg-transparent border-none outline-none text-sm text-foreground placeholder:text-muted-foreground w-full"
            />
          </div>
        </div>
        <div className="p-1 max-h-[300px] overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-sm text-muted-foreground">No actions found</div>
          ) : (
            filtered.map((action, index) => {
              const Icon = action.icon
              return (
                <button
                  key={action.id}
                  onClick={() => { action.handler(); onClose() }}
                  onMouseEnter={() => setSelectedIndex(index)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm rounded-md transition-colors ${
                    index === selectedIndex
                      ? action.variant === 'destructive'
                        ? 'bg-destructive/10 text-destructive'
                        : 'bg-accent text-accent-foreground'
                      : action.variant === 'destructive'
                        ? 'text-destructive hover:bg-destructive/10'
                        : 'hover:bg-accent/50'
                  }`}
                >
                  {Icon && <Icon className="w-4 h-4 flex-shrink-0" strokeWidth={1.5} />}
                  <span className="flex-1 text-left">{action.label}</span>
                  {action.shortcut && (
                    <kbd className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded font-mono">{action.shortcut}</kbd>
                  )}
                </button>
              )
            })
          )}
        </div>
      </div>
    </>,
    document.body
  )
}
