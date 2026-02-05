import { useEffect, useRef, useCallback } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './dialog'
import { TagInput } from './TagInput'
import { Tag } from './Tag'
import { getAllTags, updateBookmark } from '../../services/bookmarks'

export function QuickTagModal({ isOpen, onClose, bookmark }) {
  const tagInputRef = useRef(null)
  const allTags = getAllTags()

  // Focus tag input when modal opens
  useEffect(() => {
    if (isOpen) {
      // Small delay to ensure dialog is rendered
      setTimeout(() => {
        tagInputRef.current?.focus()
      }, 50)
    }
  }, [isOpen])

  const handleTagsChange = useCallback((newTags) => {
    if (!bookmark?._id) return
    try {
      updateBookmark(bookmark._id, { tags: newTags })
    } catch (error) {
      console.error('Failed to update tags:', error)
    }
  }, [bookmark?._id])

  const handleRemoveTag = useCallback((tagToRemove) => {
    if (!bookmark?._id) return
    const newTags = (bookmark.tags || []).filter(t => t !== tagToRemove)
    handleTagsChange(newTags)
  }, [bookmark?._id, bookmark?.tags, handleTagsChange])

  if (!bookmark) return null

  const currentTags = bookmark.tags || []

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base font-medium truncate pr-8">
            {bookmark.title}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Current tags */}
          {currentTags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {currentTags.map((tag) => (
                <Tag key={tag} onRemove={() => handleRemoveTag(tag)}>
                  {tag}
                </Tag>
              ))}
            </div>
          )}

          {/* Tag input */}
          <div>
            <TagInput
              ref={tagInputRef}
              value={currentTags}
              onChange={handleTagsChange}
              allTags={allTags}
              placeholder="Add tag..."
              onEscapeWhenClosed={onClose}
            />
          </div>

          {/* Keyboard hint */}
          <p className="text-xs text-muted-foreground text-center">
            Press <kbd className="px-1.5 py-0.5 text-xs bg-muted border border-border rounded">Esc</kbd> to close
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
