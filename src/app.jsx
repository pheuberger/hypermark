import { useYjs } from './hooks/useYjs'
import { BookmarkList } from './components/bookmarks/BookmarkList'

export function App() {
  // Initialize Yjs
  useYjs()

  return (
    <div className="min-h-screen bg-base-100">
      <BookmarkList />
    </div>
  )
}
