import { useYjs } from './hooks/useYjs'
import { BookmarkList } from './components/bookmarks/BookmarkList'

export function App() {
  useYjs()

  return (
    <div className="min-h-screen bg-background">
      <BookmarkList />
    </div>
  )
}
