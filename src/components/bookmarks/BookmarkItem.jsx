import { forwardRef, useRef, useCallback } from 'react'
import { Check } from '../ui/Icons'

export const BookmarkItem = forwardRef(function BookmarkItem(
  { bookmark, isSelected, isChecked, selectionMode, keyboardNavActive, onEdit, onTagClick, onToggleSelect, onMouseEnter, onContextMenu },
  ref
) {
  const { title, url, tags } = bookmark

  let domain = ''
  try {
    domain = new URL(url).hostname.replace('www.', '')
  } catch {
    domain = url
  }

  const faviconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=32`

  // Long-press detection for mobile context menu
  const longPressTimer = useRef(null)
  const isLongPress = useRef(false)
  const touchOrigin = useRef(null)

  const handleTouchStart = useCallback((e) => {
    isLongPress.current = false
    const touch = e.touches[0]
    touchOrigin.current = { x: touch.clientX, y: touch.clientY }
    longPressTimer.current = setTimeout(() => {
      isLongPress.current = true
      onContextMenu?.(bookmark, { x: touch.clientX, y: touch.clientY })
    }, 500)
  }, [bookmark, onContextMenu])

  const handleTouchEnd = useCallback(() => {
    clearTimeout(longPressTimer.current)
  }, [])

  const handleTouchMove = useCallback((e) => {
    if (touchOrigin.current) {
      const touch = e.touches[0]
      const dx = touch.clientX - touchOrigin.current.x
      const dy = touch.clientY - touchOrigin.current.y
      if (dx * dx + dy * dy > 100) {
        clearTimeout(longPressTimer.current)
      }
    }
  }, [])

  const handleRightClick = useCallback((e) => {
    e.preventDefault()
    onContextMenu?.(bookmark, { x: e.clientX, y: e.clientY })
  }, [bookmark, onContextMenu])

  const handleClick = (e) => {
    if (isLongPress.current) {
      isLongPress.current = false
      return
    }
    if (selectionMode) {
      e.preventDefault()
      onToggleSelect?.(bookmark._id)
    } else if (e.shiftKey) {
      e.preventDefault()
      onToggleSelect?.(bookmark._id, true)
    } else {
      // Click on empty area opens edit
      onEdit?.(bookmark)
    }
  }

  const handleCheckboxClick = (e) => {
    e.stopPropagation()
    e.preventDefault()
    if (!selectionMode) {
      onToggleSelect?.(bookmark._id, true)
    } else {
      onToggleSelect?.(bookmark._id)
    }
  }

  const showKeyboardSelection = isSelected && keyboardNavActive

  return (
    <div
      ref={ref}
      onClick={handleClick}
      onContextMenu={handleRightClick}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchMove={handleTouchMove}
      onMouseEnter={onMouseEnter}
      className={`group flex items-center gap-3 px-3 py-2.5 rounded-md transition-all duration-200 ${
        selectionMode ? 'cursor-pointer' : 'cursor-default'
      } ${
        isChecked
          ? 'bg-primary/15'
          : keyboardNavActive
            ? ''
            : 'hover:bg-accent/50'
      } ${
        showKeyboardSelection
          ? 'ring-2 ring-ring ring-offset-1 ring-offset-background'
          : ''
      }`}
    >
      {/* Checkbox */}
      <button
        onClick={handleCheckboxClick}
        className={`flex-shrink-0 w-4 h-4 rounded border transition-all duration-150 flex items-center justify-center ${
          isChecked
            ? 'bg-primary border-primary'
            : selectionMode
              ? 'border-muted-foreground/40 hover:border-muted-foreground bg-transparent'
              : 'border-transparent bg-transparent opacity-0 group-hover:opacity-100 group-hover:border-muted-foreground/30 hover:!border-muted-foreground/50'
        }`}
      >
        {isChecked && (
          <Check className="w-3 h-3 text-primary-foreground" strokeWidth={2.5} />
        )}
      </button>

      <img
        src={faviconUrl}
        alt=""
        className="w-4 h-4 rounded-[3px] flex-shrink-0 opacity-70 group-hover:opacity-100 transition-opacity"
        onError={(e) => { e.target.style.opacity = 0 }}
      />

      <div className="flex-1 min-w-0 overflow-hidden">
        <div className="flex items-center gap-2">
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => {
              if (selectionMode) {
                e.preventDefault()
              } else {
                e.stopPropagation()
              }
            }}
            className="font-medium text-sm text-foreground truncate hover:text-primary transition-colors"
          >
            {title}
          </a>
          <span className="text-xs text-muted-foreground truncate flex-shrink-0 font-normal hidden md:inline">{domain}</span>
          {tags && tags.length > 0 && (
            <div className="items-center gap-1.5 flex-shrink-0 hidden md:flex">
              {tags.map((tag) => (
                <span
                  key={tag}
                  onClick={(e) => {
                    e.stopPropagation()
                    if (!selectionMode) {
                      onTagClick && onTagClick(tag)
                    }
                  }}
                  className="text-[10px] leading-none px-2 py-1 rounded-full bg-secondary text-secondary-foreground hover:text-primary hover:bg-accent cursor-pointer transition-colors font-medium"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
})
