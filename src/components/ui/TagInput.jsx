import { useState, useEffect, useRef, useMemo } from 'react'
import { Plus, Hash } from './Icons'
import { cn } from '@/utils/cn'

export function TagInput({
  value = [],
  onChange,
  allTags = [],
  placeholder = 'Add tags...',
  disabled = false,
}) {
  const [inputValue, setInputValue] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef(null)
  const listRef = useRef(null)

  const filteredTags = useMemo(() => {
    const input = inputValue.toLowerCase().trim()
    return allTags
      .filter((tag) => !value.includes(tag))
      .filter((tag) => !input || tag.toLowerCase().includes(input))
  }, [inputValue, allTags, value])

  const normalizedInput = inputValue.trim().toLowerCase()
  const showCreateOption = normalizedInput && 
    !allTags.some((tag) => tag.toLowerCase() === normalizedInput) &&
    !value.includes(normalizedInput)

  const options = useMemo(() => {
    const items = filteredTags.map((tag) => ({ type: 'existing', value: tag }))
    if (showCreateOption) {
      items.push({ type: 'create', value: normalizedInput })
    }
    return items
  }, [filteredTags, showCreateOption, normalizedInput])

  useEffect(() => {
    setSelectedIndex(0)
  }, [options.length])

  useEffect(() => {
    if (listRef.current && isOpen) {
      const selectedItem = listRef.current.children[selectedIndex]
      if (selectedItem) {
        selectedItem.scrollIntoView({ block: 'nearest' })
      }
    }
  }, [selectedIndex, isOpen])

  const selectTag = (tag) => {
    if (!value.includes(tag)) {
      onChange([...value, tag])
    }
    setInputValue('')
    setSelectedIndex(0)
    inputRef.current?.focus()
  }

  const handleKeyDown = (e) => {
    if (!isOpen && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault()
      setIsOpen(true)
      return
    }

    if (isOpen && options.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex((prev) => (prev < options.length - 1 ? prev + 1 : 0))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : options.length - 1))
        return
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        const selected = options[selectedIndex]
        if (selected) {
          selectTag(selected.value)
        }
        return
      }
    }

    if (e.key === 'Enter' && inputValue.trim() && !options.length) {
      e.preventDefault()
      selectTag(inputValue.trim().toLowerCase())
      return
    }

    if (e.key === 'Escape') {
      setIsOpen(false)
      setSelectedIndex(0)
    }

    if (e.key === 'Backspace' && !inputValue && value.length > 0) {
      onChange(value.slice(0, -1))
    }
  }

  const handleFocus = () => {
    setIsOpen(true)
  }

  const handleBlur = () => {
    setTimeout(() => {
      setIsOpen(false)
      setSelectedIndex(0)
    }, 150)
  }

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={handleFocus}
        onBlur={handleBlur}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
        className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
      />

      {isOpen && options.length > 0 && (
        <ul
          ref={listRef}
          className="absolute z-50 w-full mt-1 max-h-60 overflow-auto rounded-lg border border-input bg-popover shadow-lg py-1"
        >
          {options.map((option, index) => (
            <li
              key={option.type === 'create' ? `create-${option.value}` : option.value}
              onMouseDown={() => selectTag(option.value)}
              onMouseEnter={() => setSelectedIndex(index)}
              className={cn(
                'flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors',
                index === selectedIndex
                  ? 'bg-accent text-accent-foreground'
                  : 'text-foreground hover:bg-accent/50'
              )}
            >
              {option.type === 'existing' ? (
                <>
                  <Hash className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                  <span className="text-sm flex-1 truncate">{option.value}</span>
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  <span className="text-sm">
                    Create new tag:{' '}
                    <span className="text-muted-foreground">"{option.value}"</span>
                  </span>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {!isOpen && value.length === 0 && !inputValue && (
        <p className="mt-1.5 text-xs text-muted-foreground">
          Press ↓ to see existing tags
        </p>
      )}
    </div>
  )
}
