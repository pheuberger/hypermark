import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from './dialog'

const HOTKEY_GROUPS = [
  {
    title: 'List Navigation',
    hotkeys: [
      { keys: ['j'], description: 'Select next bookmark' },
      { keys: ['k'], description: 'Select previous bookmark' },
      { keys: ['Enter'], description: 'Open selected bookmark' },
      { keys: ['o'], description: 'Open selected bookmark' },
      { keys: ['e'], description: 'Edit selected bookmark' },
      { keys: ['d'], description: 'Delete selected bookmark' },
      { keys: ['Ctrl', 'k'], description: 'Focus search bar', modifier: true },
    ],
  },
  {
    title: 'Quick Actions',
    hotkeys: [
      { keys: ['Shift', 't'], description: 'Edit tags', modifier: true },
      { keys: ['Shift', 'l'], description: 'Toggle read later', modifier: true },
      { keys: ['c'], description: 'Copy URL' },
    ],
  },
  {
    title: 'Go To',
    hotkeys: [
      { keys: ['g', 'a'], description: 'All bookmarks' },
      { keys: ['g', 'l'], description: 'Read later' },
      { keys: ['g', 'i'], description: 'Inbox' },
      { keys: ['g', 's'], description: 'Settings' },
      { keys: ['g', 'n'], description: 'New bookmark' },
    ],
  },
  {
    title: 'General',
    hotkeys: [
      { keys: ['Ctrl', 'z'], description: 'Undo', modifier: true },
      { keys: ['Ctrl', 'Shift', 'z'], description: 'Redo', modifier: true },
      { keys: ['Ctrl', 'Enter'], description: 'Submit form', modifier: true },
      { keys: ['?'], description: 'Show this help' },
      { keys: ['Esc'], description: 'Close modal / Cancel' },
    ],
  },
]

function Kbd({ children }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[1.75rem] h-7 px-2 text-xs font-medium bg-muted border border-border rounded-md shadow-sm font-mono">
      {children}
    </kbd>
  )
}

function HotkeyRow({ keys, description, modifier }) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-sm text-muted-foreground">{description}</span>
      <div className="flex items-center gap-1">
        {keys.map((key, i) => (
          <span key={i} className="flex items-center gap-1">
            <Kbd>{key}</Kbd>
            {!modifier && i < keys.length - 1 && (
              <span className="text-xs text-muted-foreground/50">then</span>
            )}
            {modifier && i < keys.length - 1 && (
              <span className="text-xs text-muted-foreground/50">+</span>
            )}
          </span>
        ))}
      </div>
    </div>
  )
}

export function HelpModal({ isOpen, onClose }) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Keyboard Shortcuts
          </DialogTitle>
        </DialogHeader>
        <div className="py-2 space-y-6">
          {HOTKEY_GROUPS.map((group) => (
            <div key={group.title}>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70 mb-2">
                {group.title}
              </h3>
              <div className="divide-y divide-border/50">
                {group.hotkeys.map((hotkey) => (
                  <HotkeyRow
                    key={hotkey.description}
                    keys={hotkey.keys}
                    description={hotkey.description}
                    modifier={hotkey.modifier}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="pt-2 border-t border-border">
          <p className="text-xs text-muted-foreground/60 text-center">
            Press <Kbd>Esc</Kbd> to close
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
