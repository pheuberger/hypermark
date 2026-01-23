import { useYjs } from './hooks/useYjs'
import { useNostrSync } from './hooks/useNostrSync'
import { BookmarkList } from './components/bookmarks/BookmarkList'

export function App() {
  useYjs()
  useNostrSync()

  return (
    <div className="min-h-screen bg-background">
      <BookmarkList />
    </div>
  )
}
