import { Plus, Upload, Smartphone } from '../ui/Icons'

export function WelcomeState({ onAddBookmark, onImport, onPairDevice }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 max-w-lg mx-auto">
      <h1 className="text-2xl font-bold text-foreground mb-2">Welcome to Hypermark</h1>
      <p className="text-sm text-muted-foreground mb-8 text-center">
        Your private, encrypted bookmark manager. Get started by choosing one of the options below.
      </p>

      <div className="w-full space-y-3">
        <button
          onClick={onAddBookmark}
          className="w-full flex items-center gap-4 p-4 rounded-lg border border-border bg-card hover:bg-accent/50 transition-colors text-left group"
        >
          <div className="shrink-0 w-10 h-10 rounded-full bg-accent/30 flex items-center justify-center">
            <Plus className="w-5 h-5 text-foreground" />
          </div>
          <div>
            <p className="font-medium text-foreground">Add your first bookmark</p>
            <p className="text-xs text-muted-foreground mt-0.5">Paste a URL or enter details manually</p>
          </div>
        </button>

        <button
          onClick={onImport}
          className="w-full flex items-center gap-4 p-4 rounded-lg border border-border bg-card hover:bg-accent/50 transition-colors text-left group"
        >
          <div className="shrink-0 w-10 h-10 rounded-full bg-accent/30 flex items-center justify-center">
            <Upload className="w-5 h-5 text-foreground" />
          </div>
          <div>
            <p className="font-medium text-foreground">Import from browser</p>
            <p className="text-xs text-muted-foreground mt-0.5">Import bookmarks from an HTML export file</p>
          </div>
        </button>

        <button
          onClick={onPairDevice}
          className="w-full flex items-center gap-4 p-4 rounded-lg border border-border bg-card hover:bg-accent/50 transition-colors text-left group"
        >
          <div className="shrink-0 w-10 h-10 rounded-full bg-accent/30 flex items-center justify-center">
            <Smartphone className="w-5 h-5 text-foreground" />
          </div>
          <div>
            <p className="font-medium text-foreground">Pair another device</p>
            <p className="text-xs text-muted-foreground mt-0.5">Sync bookmarks from an existing device</p>
          </div>
        </button>
      </div>

      <p className="text-xs text-muted-foreground mt-8">
        Press <kbd className="px-1.5 py-0.5 rounded bg-muted border border-border text-[10px] font-mono">?</kbd> for keyboard shortcuts
      </p>
    </div>
  )
}
