import { useState, useEffect } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Input, TextArea } from '../ui/Input'
import { Tag } from '../ui/Tag'
import { Plus } from '../ui/Icons'
import { cn } from '@/lib/utils'

export function BookmarkForm({ isOpen, onClose, onSave, initialData = null }) {
  const isEditing = Boolean(initialData)

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
  }, [initialData, isOpen])

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

  const addTag = () => {
    const tag = tagInput.trim().toLowerCase()
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
    setErrors((prev) => {
      const newErrors = { ...prev }
      delete newErrors.tags
      return newErrors
    })
  }

  const removeTag = (tagToRemove) => {
    setFormData((prev) => ({
      ...prev,
      tags: prev.tags.filter((tag) => tag !== tagToRemove),
    }))
  }

  const handleTagKeyPress = (e) => {
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
      <form onSubmit={handleSubmit}>
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

        <TextArea
          label="Description"
          value={formData.description}
          onChange={(value) => updateField('description', value)}
          placeholder="Optional description..."
          rows={3}
          disabled={loading}
        />

        <div className="mb-4">
          <label className="block text-sm font-medium text-muted-foreground mb-1">
            Tags
          </label>

          <div className="flex gap-2 mb-2">
            <input
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyPress={handleTagKeyPress}
              placeholder="Add a tag..."
              disabled={loading}
              className="flex-1 h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
            />
            <button
              type="button"
              onClick={addTag}
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
