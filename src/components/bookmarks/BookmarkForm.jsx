import { useState, useEffect } from 'preact/hooks'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Input, TextArea } from '../ui/Input'
import { Tag } from '../ui/Tag'
import { Plus } from '../ui/Icons'

/**
 * Bookmark add/edit form in modal
 */
export function BookmarkForm({ isOpen, onClose, onSave, initialData = null }) {
  const isEditing = Boolean(initialData)

  // Form state
  const [formData, setFormData] = useState({
    url: '',
    title: '',
    description: '',
    tags: [],
    readLater: false,
  })

  // Tag input state
  const [tagInput, setTagInput] = useState('')

  // Error state
  const [errors, setErrors] = useState({})

  // Loading state
  const [loading, setLoading] = useState(false)

  // Initialize form with existing data when editing
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
      // Reset form when opening for new bookmark
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

  // Update field
  const updateField = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
    // Clear error for this field
    if (errors[field]) {
      setErrors((prev) => {
        const newErrors = { ...prev }
        delete newErrors[field]
        return newErrors
      })
    }
  }

  // Add tag
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

  // Remove tag
  const removeTag = (tagToRemove) => {
    setFormData((prev) => ({
      ...prev,
      tags: prev.tags.filter((tag) => tag !== tagToRemove),
    }))
  }

  // Handle tag input key press
  const handleTagKeyPress = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      addTag()
    }
  }

  // Validate form
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

  // Submit form
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
        {/* URL field */}
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

        {/* Title field */}
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

        {/* Description field */}
        <TextArea
          label="Description"
          value={formData.description}
          onChange={(value) => updateField('description', value)}
          placeholder="Optional description..."
          rows={3}
          disabled={loading}
        />

        {/* Tags field */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Tags
          </label>

          {/* Tag input */}
          <div className="flex gap-2 mb-2">
            <input
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyPress={handleTagKeyPress}
              placeholder="Add a tag..."
              disabled={loading}
              className="input input-bordered flex-1"
            />
            <button
              type="button"
              onClick={addTag}
              disabled={loading || !tagInput.trim()}
              className="btn btn-secondary btn-square"
              aria-label="Add tag"
            >
              <Plus className="w-5 h-5" />
            </button>
          </div>

          {/* Display tags */}
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
            <p className="mt-1 text-sm text-red-600 dark:text-red-400">
              {errors.tags}
            </p>
          )}
        </div>

        {/* Read later checkbox */}
        <div className="mb-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={formData.readLater}
              onChange={(e) => updateField('readLater', e.target.checked)}
              disabled={loading}
              className="checkbox checkbox-primary"
            />
            <span className="text-sm">Mark as read later</span>
          </label>
        </div>

        {/* Submit error */}
        {errors.submit && (
          <div className="alert alert-error mb-4">
            <span>{errors.submit}</span>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-4">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={loading}>
            {loading ? 'Saving...' : isEditing ? 'Update' : 'Add Bookmark'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
