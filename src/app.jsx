import { useState, useEffect } from 'preact/hooks'
import { BookmarkList } from './components/bookmarks'
import PairingFlow from './components/pairing/PairingFlow'
import ConnectionStatus from './components/sync/ConnectionStatus'
import { useYjs } from './hooks/useYjs'

// Placeholder component (will be implemented in Phase 2+)
const BookmarksView = () => <BookmarkList />

const PairingView = () => <PairingFlow />

const SettingsView = () => (
  <div className="p-4">
    <h1 className="text-2xl font-bold mb-4">Settings</h1>
    <div className="card">
      <p className="text-gray-600">Device management will be implemented in Phase 6</p>
      <p className="text-sm text-gray-500 mt-2">View paired devices, sync settings</p>
    </div>
  </div>
)

// Navigation tabs
const NavBar = ({ currentView, onNavigate }) => {
  const tabs = [
    { id: 'bookmarks', label: 'Bookmarks', icon: '📚' },
    { id: 'pairing', label: 'Pair', icon: '🔗' },
    { id: 'settings', label: 'Settings', icon: '⚙️' },
  ]

  return (
    <nav className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
      <div className="flex justify-around max-w-4xl mx-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onNavigate(tab.id)}
            className={`flex-1 py-4 px-2 text-center transition-colors ${
              currentView === tab.id
                ? 'border-b-2 border-primary text-primary font-medium'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
            }`}
          >
            <span className="mr-2">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>
    </nav>
  )
}

export function App() {
  const [currentView, setCurrentView] = useState('bookmarks')

  // Initialize Yjs
  useYjs()

  // View router
  const renderView = () => {
    switch (currentView) {
      case 'bookmarks':
        return <BookmarksView />
      case 'pairing':
        return <PairingView />
      case 'settings':
        return <SettingsView />
      default:
        return <BookmarksView />
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <ConnectionStatus />
      <NavBar currentView={currentView} onNavigate={setCurrentView} />
      <main className="max-w-4xl mx-auto pb-16">
        {renderView()}
      </main>
    </div>
  )
}
