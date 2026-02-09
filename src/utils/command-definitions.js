import {
  ExternalLink,
  Pencil,
  BookmarkPlus,
  Copy,
  Hash,
  Trash,
  Plus,
  Undo2,
  Redo2,
  HelpCircle,
  Library,
  Inbox,
  Clock,
  Settings,
  ArrowDownWideNarrow,
  ArrowUpWideNarrow,
  ArrowDownAZ,
  RefreshCw,
  Filter
} from '../components/ui/Icons.jsx'

// CONTEXTUAL_COMMANDS - Only appear when a bookmark is selected
export const CONTEXTUAL_COMMANDS = [
  {
    id: 'open-bookmark',
    label: 'Open in Browser',
    keywords: ['visit', 'go', 'launch'],
    shortcut: 'Enter',
    icon: ExternalLink,
    category: 'Actions',
    requiresSelection: true,
    variant: null,
  },
  {
    id: 'edit',
    label: 'Edit Bookmark',
    keywords: ['modify', 'change', 'update'],
    shortcut: 'E',
    icon: Pencil,
    category: 'Actions',
    requiresSelection: true,
    variant: null,
  },
  {
    id: 'toggle-read-later',
    label: 'Toggle Read Later',
    keywords: ['save', 'later', 'reading'],
    shortcut: 'L',
    icon: BookmarkPlus,
    category: 'Actions',
    requiresSelection: true,
    variant: null,
  },
  {
    id: 'copy-url',
    label: 'Copy URL',
    keywords: ['clipboard', 'link'],
    shortcut: 'C',
    icon: Copy,
    category: 'Actions',
    requiresSelection: true,
    variant: null,
  },
  {
    id: 'tag',
    label: 'Tag Bookmark',
    keywords: ['label', 'category'],
    shortcut: 'T',
    icon: Hash,
    category: 'Actions',
    requiresSelection: true,
    variant: null,
  },
  {
    id: 'delete',
    label: 'Delete Bookmark',
    keywords: ['remove', 'trash'],
    shortcut: 'D',
    icon: Trash,
    category: 'Actions',
    requiresSelection: true,
    variant: 'destructive',
  },
]

// GLOBAL_COMMANDS - Always available
export const GLOBAL_COMMANDS = [
  {
    id: 'new-bookmark',
    label: 'New Bookmark',
    keywords: ['add', 'create'],
    shortcut: 'G N',
    icon: Plus,
    category: 'Actions',
    requiresSelection: false,
    variant: null,
  },
  {
    id: 'undo',
    label: 'Undo',
    keywords: ['revert', 'back'],
    shortcut: '⌘Z',
    icon: Undo2,
    category: 'Actions',
    requiresSelection: false,
    variant: null,
  },
  {
    id: 'redo',
    label: 'Redo',
    keywords: ['forward'],
    shortcut: '⌘⇧Z',
    icon: Redo2,
    category: 'Actions',
    requiresSelection: false,
    variant: null,
  },
  {
    id: 'help',
    label: 'Keyboard Shortcuts',
    keywords: ['hotkeys', 'bindings'],
    shortcut: '?',
    icon: HelpCircle,
    category: 'Actions',
    requiresSelection: false,
    variant: null,
  },
]

// NAVIGATION_COMMANDS - Always available
export const NAVIGATION_COMMANDS = [
  {
    id: 'nav-all',
    label: 'Go to All Bookmarks',
    keywords: ['home', 'everything'],
    shortcut: 'G A',
    icon: Library,
    category: 'Navigation',
    requiresSelection: false,
    variant: null,
  },
  {
    id: 'nav-inbox',
    label: 'Go to Inbox',
    keywords: ['triage', 'unsorted'],
    shortcut: 'G I',
    icon: Inbox,
    category: 'Navigation',
    requiresSelection: false,
    variant: null,
  },
  {
    id: 'nav-read-later',
    label: 'Go to Read Later',
    keywords: ['saved', 'reading'],
    shortcut: 'G L',
    icon: Clock,
    category: 'Navigation',
    requiresSelection: false,
    variant: null,
  },
  {
    id: 'nav-settings',
    label: 'Go to Settings',
    keywords: ['preferences', 'config'],
    shortcut: 'G S',
    icon: Settings,
    category: 'Navigation',
    requiresSelection: false,
    variant: null,
  },
]

// SORT_COMMANDS - Always available
export const SORT_COMMANDS = [
  {
    id: 'sort-recent',
    label: 'Sort by Recent',
    keywords: ['newest', 'latest'],
    shortcut: null,
    icon: ArrowDownWideNarrow,
    category: 'Sort',
    requiresSelection: false,
    variant: null,
  },
  {
    id: 'sort-oldest',
    label: 'Sort by Oldest',
    keywords: ['first', 'earliest'],
    shortcut: null,
    icon: ArrowUpWideNarrow,
    category: 'Sort',
    requiresSelection: false,
    variant: null,
  },
  {
    id: 'sort-title',
    label: 'Sort by Title A-Z',
    keywords: ['alphabetical', 'name'],
    shortcut: null,
    icon: ArrowDownAZ,
    category: 'Sort',
    requiresSelection: false,
    variant: null,
  },
  {
    id: 'sort-updated',
    label: 'Sort by Last Updated',
    keywords: ['modified', 'changed'],
    shortcut: null,
    icon: RefreshCw,
    category: 'Sort',
    requiresSelection: false,
    variant: null,
  },
]

// SPECIAL_COMMANDS - Always available
export const SPECIAL_COMMANDS = [
  {
    id: 'filter-list',
    label: 'Filter Bookmark List',
    keywords: ['search', 'find', 'narrow'],
    shortcut: null,
    icon: Filter,
    category: 'Special',
    requiresSelection: false,
    variant: null,
  },
]

// Helper function to get all commands
export function getAllCommands() {
  return [...CONTEXTUAL_COMMANDS, ...GLOBAL_COMMANDS, ...NAVIGATION_COMMANDS, ...SORT_COMMANDS, ...SPECIAL_COMMANDS]
}