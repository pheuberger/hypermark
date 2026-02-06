import { useState, useEffect, useRef, useCallback } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Input, TextArea } from '../ui/Input'
import { Tag } from '../ui/Tag'
import { TagInput } from '../ui/TagInput'
import { getAllTags } from '../../services/bookmarks'
import { useHotkeys } from '../../hooks/useHotkeys'
import { useContentSuggestion } from '../../hooks/useContentSuggestion'

// Helper to detect if a string looks like a URL
function looksLikeUrl(str) {
  if (!str) return false
  const trimmed = str.trim()
  return /^https?:\/\//i.test(trimmed) || /^www\./i.test(trimmed)
}

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

  const [errors, setErrors] = useState({})
  const [loading, setLoading] = useState(false)
  const [allTags, setAllTags] = useState([])
  const [suggestedTags, setSuggestedTags] = useState([]) // Tags from suggestions, not yet applied

  const { suggestions, loading: suggesting, error: suggestError, suggest, clear: clearSuggestions, cancel: cancelSuggestion, enabled: suggestionsEnabled } = useContentSuggestion()

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
    setSuggestedTags([])
    clearSuggestions()
  }, [initialData, isOpen, clearSuggestions])

  useEffect(() => {
    if (isOpen) {
      try {
        setAllTags(getAllTags())
      } catch {
        setAllTags([])
      }
    }
  }, [isOpen])

  // Apply suggestions to empty fields when they arrive (except tags - show those separately)
  useEffect(() => {
    if (!suggestions) return
    setFormData((prev) => ({
      ...prev,
      title: prev.title || suggestions.title || prev.title,
      description: prev.description || suggestions.description || prev.description,
      // Don't auto-apply tags - let user pick from suggestedTags
    }))
    // Show suggested tags that aren't already in the form
    if (suggestions.suggestedTags?.length > 0) {
      setSuggestedTags((prev) => {
        // Filter out tags already in formData
        const newSuggested = suggestions.suggestedTags.filter(
          (tag) => !formData.tags.includes(tag)
        )
        return newSuggested
      })
    }
  }, [suggestions, formData.tags])

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

  const handleTagsChange = (newTags) => {
    setFormData((prev) => ({ ...prev, tags: newTags }))
    if (errors.tags) {
      setErrors((prev) => {
        const newErrors = { ...prev }
        delete newErrors.tags
        return newErrors
      })
    }
  }

  const removeTag = (tagToRemove) => {
    setFormData((prev) => ({
      ...prev,
      tags: prev.tags.filter((tag) => tag !== tagToRemove),
    }))
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

  const handleSuggest = () => {
    if (formData.url.trim()) {
      suggest(formData.url.trim())
    }
  }

  // Auto-suggest when URL is pasted
  const handleUrlPaste = (e) => {
    const pastedText = e.clipboardData?.getData('text')
    if (pastedText && looksLikeUrl(pastedText) && suggestionsEnabled && !isEditing) {
      // Small delay to let the input update first
      setTimeout(() => {
        const url = pastedText.trim().startsWith('http')
          ? pastedText.trim()
          : `https://${pastedText.trim()}`
        suggest(url)
      }, 100)
    }
  }

  // Add a single suggested tag
  const addSuggestedTag = (tag) => {
    setFormData((prev) => ({
      ...prev,
      tags: [...prev.tags, tag],
    }))
    setSuggestedTags((prev) => prev.filter((t) => t !== tag))
  }

  // Add all suggested tags
  const addAllSuggestedTags = () => {
    setFormData((prev) => ({
      ...prev,
      tags: [...prev.tags, ...suggestedTags],
    }))
    setSuggestedTags([])
  }

  // Dismiss all suggested tags
  const dismissSuggestedTags = () => {
    setSuggestedTags([])
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? 'Edit Bookmark' : 'Add Bookmark'}
    >
      <form ref={formRef} onSubmit={handleSubmit}>
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Input
              label="URL"
              type="url"
              value={formData.url}
              onChange={(value) => updateField('url', value)}
              onPaste={handleUrlPaste}
              placeholder="https://example.com"
              required
              error={errors.url}
              disabled={loading}
            />
          </div>
          {suggestionsEnabled && !isEditing && (
            <div className="mb-4">
              <Button
                type="button"
                variant="ghost"
                onClick={suggesting ? cancelSuggestion : handleSuggest}
                disabled={loading || !formData.url.trim()}
                className="text-xs whitespace-nowrap"
              >
                {suggesting ? 'Cancel' : 'Suggest'}
              </Button>
            </div>
          )}
        </div>

        {suggesting && (
          <p className="text-xs text-muted-foreground -mt-2 mb-3 flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
            Fetching suggestions...
          </p>
        )}

        {suggestError && !suggesting && (
          <p className="text-xs text-muted-foreground -mt-2 mb-3">
            Could not fetch suggestions
          </p>
        )}

        <Input
          label="Title"
          type="text"
          value={formData.title}
          onChange={(value) => updateField('title', value)}
          placeholder={suggesting ? 'Loading...' : 'Bookmark title'}
          required
          error={errors.title}
          disabled={loading}
        />

        <div className="mb-4">
          <label className="block text-sm font-medium text-muted-foreground mb-1">
            Tags
          </label>

          <TagInput
            value={formData.tags}
            onChange={handleTagsChange}
            allTags={allTags}
            placeholder="Search or create tags..."
            disabled={loading}
          />

          {formData.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
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

          {suggestedTags.length > 0 && (
            <div className="mt-3 p-2.5 rounded-md bg-muted/50 border border-border/50">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-muted-foreground">Suggested tags</span>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={addAllSuggestedTags}
                    className="text-xs text-primary hover:underline"
                  >
                    Add all
                  </button>
                  <span className="text-muted-foreground/50">·</span>
                  <button
                    type="button"
                    onClick={dismissSuggestedTags}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap gap-1">
                {suggestedTags.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => addSuggestedTag(tag)}
                    className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-md bg-background border border-border hover:border-primary hover:text-primary transition-colors cursor-pointer"
                  >
                    <span className="text-muted-foreground">+</span>
                    {tag}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <TextArea
          label="Description"
          value={formData.description}
          onChange={(value) => updateField('description', value)}
          placeholder={suggesting ? 'Loading...' : 'Optional description...'}
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
