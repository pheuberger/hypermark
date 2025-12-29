import { useState, useEffect } from 'preact/hooks'
import { BookmarkList } from './components/bookmarks'
import PairingFlow from './components/pairing/PairingFlow'
import ConnectionStatus from './components/sync/ConnectionStatus'
import { useYjs } from './hooks/useYjs'
import { BookOpen, Link2, Settings } from './components/ui/Icons'

// Placeholder component (will be implemented in Phase 2+)
const BookmarksView = () => <BookmarkList />

const PairingView = () => <PairingFlow />

const SettingsView = () => (
  <div className="p-4">
    <h1 className="text-2xl font-bold mb-4">Settings</h1>
    <div className="card bg-base-200 shadow-md p-6">
      <p className="opacity-70">Device management will be implemented in Phase 6</p>
      <p className="text-sm opacity-60 mt-2">View paired devices, sync settings</p>
    </div>
  </div>
)

// Navigation tabs
const NavBar = ({ currentView, onNavigate }) => {
  const tabs = [
    { id: 'bookmarks', label: 'Bookmarks', Icon: BookOpen },
    { id: 'pairing', label: 'Pair', Icon: Link2 },
    { id: 'settings', label: 'Settings', Icon: Settings },
  ]

  return (
    <nav className="bg-base-100 border-b border-base-300">
      <div className="flex justify-around max-w-4xl mx-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onNavigate(tab.id)}
            className={`flex-1 py-4 px-2 text-center transition-colors flex items-center justify-center gap-2 ${
              currentView === tab.id
                ? 'border-b-2 border-primary text-primary font-medium'
                : 'opacity-60 hover:opacity-100'
            }`}
          >
            <tab.Icon className="w-5 h-5" />
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
    <div className="min-h-screen bg-base-300 flex flex-col">
      <ConnectionStatus />
      <NavBar currentView={currentView} onNavigate={setCurrentView} />
      <main className="flex-1 overflow-hidden">
        {renderView()}
      </main>
    </div>
  )
}
