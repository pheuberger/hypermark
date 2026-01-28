import { useEffect, useRef, useCallback } from 'react'

const SEQUENCE_TIMEOUT_MS = 800

function isInputElement(element) {
  if (!element) return false
  const tagName = element.tagName.toLowerCase()
  return (
    tagName === 'input' ||
    tagName === 'textarea' ||
    tagName === 'select' ||
    element.isContentEditable
  )
}

function normalizeKey(e) {
  const parts = []
  if (e.ctrlKey || e.metaKey) parts.push('mod')
  if (e.altKey) parts.push('alt')
  if (e.shiftKey) parts.push('shift')

  let key = e.key.toLowerCase()
  if (key === ' ') key = 'space'
  if (key === 'escape') key = 'esc'

  parts.push(key)
  return parts.join('+')
}

function parseHotkey(hotkey) {
  return hotkey.toLowerCase().split(' ').filter(Boolean)
}

export function useHotkeys(hotkeyMap, options = {}) {
  const { enabled = true, enableOnInputs = false } = options
  const sequenceRef = useRef([])
  const timeoutRef = useRef(null)

  const resetSequence = useCallback(() => {
    sequenceRef.current = []
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
  }, [])

  const handleKeyDown = useCallback(
    (e) => {
      if (!enabled) return
      if (!enableOnInputs && isInputElement(e.target)) return

      const normalizedKey = normalizeKey(e)
      
      if (normalizedKey === 'esc') {
        resetSequence()
        return
      }

      sequenceRef.current.push(normalizedKey)

      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      timeoutRef.current = setTimeout(resetSequence, SEQUENCE_TIMEOUT_MS)

      const currentSequence = sequenceRef.current.join(' ')

      for (const [hotkey, callback] of Object.entries(hotkeyMap)) {
        const parsedHotkey = parseHotkey(hotkey).join(' ')

        if (currentSequence === parsedHotkey) {
          e.preventDefault()
          callback(e)
          resetSequence()
          return
        }

        if (parsedHotkey.startsWith(currentSequence + ' ')) {
          return
        }
      }

      const isPartialMatch = Object.keys(hotkeyMap).some((hotkey) => {
        const parsed = parseHotkey(hotkey).join(' ')
        return parsed.startsWith(currentSequence)
      })

      if (!isPartialMatch) {
        resetSequence()
      }
    },
    [hotkeyMap, enabled, enableOnInputs, resetSequence]
  )

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [handleKeyDown])
}

export function useGlobalHotkey(hotkey, callback, options = {}) {
  const hotkeyMap = { [hotkey]: callback }
  useHotkeys(hotkeyMap, options)
}
