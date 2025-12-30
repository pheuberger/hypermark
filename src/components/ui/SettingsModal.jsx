import { useState } from 'preact/hooks'
import { Modal } from './Modal'
import PairingFlow from '../pairing/PairingFlow'

export function SettingsModal({ isOpen, onClose }) {
  const [activeTab, setActiveTab] = useState('pairing') // 'pairing' | 'export'

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Settings">
      <div className="flex p-1 bg-base-200/50 rounded-lg mb-6 max-w-xs mx-auto">
        <button
          className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-all ${
            activeTab === 'pairing'
              ? 'bg-base-100 shadow-sm text-base-content'
              : 'text-base-content/60 hover:text-base-content'
          }`}
          onClick={() => setActiveTab('pairing')}
        >
          Device Pairing
        </button>
        <button
          className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-all ${
            activeTab === 'export'
              ? 'bg-base-100 shadow-sm text-base-content'
              : 'text-base-content/60 hover:text-base-content'
          }`}
          onClick={() => setActiveTab('export')}
        >
          Data Management
        </button>
      </div>

      <div className="min-h-[400px]">
        {activeTab === 'pairing' && <PairingFlow />}
        {activeTab === 'export' && (
          <div className="flex flex-col items-center justify-center h-full text-center py-12 opacity-50">
            <p className="font-medium">Export and import coming soon.</p>
          </div>
        )}
      </div>
    </Modal>
  )
}
