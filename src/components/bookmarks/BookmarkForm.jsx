import { useState, useEffect, useRef, useCallback } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Input, TextArea } from '../ui/Input'
import { Tag } from '../ui/Tag'
import { Plus } from '../ui/Icons'
import { getAllTags } from '../../services/bookmarks'
import { useHotkeys } from '../../hooks/useHotkeys'

export function BookmarkForm({ isOpen, onClose, onSave, initialData = null }) {
  const isEditing = Boolean(initialData)
  const formRef = useRef(null)

  const [formData, setFormData] = useState({
    url: '',
    title: '',
    description: '',
    tags: [],
    readLater: false,
  })

  const [tagInput, setTagInput] = useState('')
  const [errors, setErrors] = useState({})
  const [loading, setLoading] = useState(false)

  const [allTags, setAllTags] = useState([])
  const [suggestions, setSuggestions] = useState([])
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const tagInputRef = useRef(null)

  useEffect(() => {
    if (initialData) {
      setFormData({
        url: initialData.url || '',
        title: initialData.title || '',
        description: initialData.description || '',
        tags: initialData.tags || [],
        readLater: initialData.readLater || false,
      })
    } else {
      setFormData({
        url: '',
        title: '',
        description: '',
        tags: [],
        readLater: false,
      })
    }
    setErrors({})
    setTagInput('')
    setShowSuggestions(false)
    setSelectedSuggestionIndex(-1)
  }, [initialData, isOpen])

  useEffect(() => {
    if (isOpen) {
      try {
        setAllTags(getAllTags())
      } catch {
        setAllTags([])
      }
    }
  }, [isOpen])

  useEffect(() => {
    if (!tagInput.trim()) {
      setSuggestions([])
      setShowSuggestions(false)
      return
    }

    const input = tagInput.toLowerCase().trim()
    const filtered = allTags.filter(
      (tag) => tag.includes(input) && !formData.tags.includes(tag)
    )
    setSuggestions(filtered)
    setShowSuggestions(filtered.length > 0)
    setSelectedSuggestionIndex(-1)
  }, [tagInput, allTags, formData.tags])

  const submitForm = useCallback(() => {
    if (formRef.current && !loading) {
      formRef.current.requestSubmit()
    }
  }, [loading])

  useHotkeys(
    { 'mod+enter': submitForm },
    { enabled: isOpen, enableOnInputs: true }
  )

  const updateField = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
    if (errors[field]) {
      setErrors((prev) => {
        const newErrors = { ...prev }
        delete newErrors[field]
        return newErrors
      })
    }
  }

  const addTag = (tagToAdd = null) => {
    const tag = (tagToAdd || tagInput).trim().toLowerCase()
    if (!tag) return

    if (formData.tags.includes(tag)) {
      setErrors((prev) => ({ ...prev, tags: 'Tag already added' }))
      return
    }

    setFormData((prev) => ({
      ...prev,
      tags: [...prev.tags, tag],
    }))
    setTagInput('')
    setShowSuggestions(false)
    setSelectedSuggestionIndex(-1)
    setErrors((prev) => {
      const newErrors = { ...prev }
      delete newErrors.tags
      return newErrors
    })
  }

  const selectSuggestion = (tag) => {
    addTag(tag)
    tagInputRef.current?.focus()
  }

  const removeTag = (tagToRemove) => {
    setFormData((prev) => ({
      ...prev,
      tags: prev.tags.filter((tag) => tag !== tagToRemove),
    }))
  }

  const handleTagKeyDown = (e) => {
    if (showSuggestions && suggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedSuggestionIndex((prev) =>
          prev < suggestions.length - 1 ? prev + 1 : 0
        )
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedSuggestionIndex((prev) =>
          prev > 0 ? prev - 1 : suggestions.length - 1
        )
        return
      }
      if ((e.key === 'Enter' || e.key === 'Tab') && selectedSuggestionIndex >= 0) {
        e.preventDefault()
        selectSuggestion(suggestions[selectedSuggestionIndex])
        return
      }
      if (e.key === 'Escape') {
        setShowSuggestions(false)
        setSelectedSuggestionIndex(-1)
        return
      }
    }

    if (e.key === 'Enter') {
      e.preventDefault()
      addTag()
    }
  }

  const validate = () => {
    const newErrors = {}

    if (!formData.url.trim()) {
      newErrors.url = 'URL is required'
    }

    if (!formData.title.trim()) {
      newErrors.title = 'Title is required'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (!validate()) {
      return
    }

    setLoading(true)

    try {
      await onSave({
        ...formData,
        _id: initialData?._id,
      })
      onClose()
    } catch (error) {
      console.error('Failed to save bookmark:', error)
      setErrors({ submit: error.message || 'Failed to save bookmark' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? 'Edit Bookmark' : 'Add Bookmark'}
    >
      <form ref={formRef} onSubmit={handleSubmit}>
        <Input
          label="URL"
          type="url"
          value={formData.url}
          onChange={(value) => updateField('url', value)}
          placeholder="https://example.com"
          required
          error={errors.url}
          disabled={loading}
        />

        <Input
          label="Title"
          type="text"
          value={formData.title}
          onChange={(value) => updateField('title', value)}
          placeholder="Bookmark title"
          required
          error={errors.title}
          disabled={loading}
        />

        <div className="mb-4">
          <label className="block text-sm font-medium text-muted-foreground mb-1">
            Tags
          </label>

          <div className="flex gap-2 mb-2">
            <div className="relative flex-1">
              <input
                ref={tagInputRef}
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleTagKeyDown}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                onFocus={() => tagInput.trim() && suggestions.length > 0 && setShowSuggestions(true)}
                placeholder="Add a tag..."
                disabled={loading}
                autoComplete="off"
                className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
              />
              {showSuggestions && suggestions.length > 0 && (
                <ul className="absolute z-50 w-full mt-1 max-h-40 overflow-auto rounded-md border border-input bg-background shadow-lg">
                  {suggestions.map((tag, index) => (
                    <li
                      key={tag}
                      onMouseDown={() => selectSuggestion(tag)}
                      className={`px-3 py-2 text-sm cursor-pointer transition-colors ${
                        index === selectedSuggestionIndex
                          ? 'bg-accent text-accent-foreground'
                          : 'hover:bg-accent/50'
                      }`}
                    >
                      {tag}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <button
              type="button"
              onClick={() => addTag()}
              disabled={loading || !tagInput.trim()}
              className="h-10 w-10 inline-flex items-center justify-center rounded-md bg-secondary hover:bg-accent text-foreground border-none transition-colors disabled:opacity-50"
              aria-label="Add tag"
            >
              <Plus className="w-5 h-5" />
            </button>
          </div>

          {formData.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {formData.tags.map((tag) => (
                <Tag key={tag} onRemove={() => removeTag(tag)}>
                  {tag}
                </Tag>
              ))}
            </div>
          )}

          {errors.tags && (
          <p className="mt-1 text-sm text-destructive">
            {errors.tags}
          </p>
          )}
        </div>

        <TextArea
          label="Description"
          value={formData.description}
          onChange={(value) => updateField('description', value)}
          placeholder="Optional description..."
          rows={3}
          disabled={loading}
        />

        <div className="mb-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={formData.readLater}
              onChange={(e) => updateField('readLater', e.target.checked)}
              disabled={loading}
              className="h-4 w-4 rounded border-input bg-background"
            />
            <span className="text-sm">Mark as read later</span>
          </label>
        </div>

        {errors.submit && (
          <div className="p-3 mb-4 rounded-md bg-destructive/10 text-destructive text-sm">
            {errors.submit}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-4">
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={loading}>
            {loading ? 'Saving...' : isEditing ? 'Save' : 'Add'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
