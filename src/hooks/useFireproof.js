import { useState, useEffect } from 'preact/hooks'
import { fireproof } from '@fireproof/core'

// Singleton database instance
let dbInstance = null

/**
 * Initialize and access the Fireproof database
 * @returns {{ db: Database, loading: boolean, error: Error | null }}
 */
export function useFireproof() {
  const [db, setDb] = useState(dbInstance)
  const [loading, setLoading] = useState(!dbInstance)
  const [error, setError] = useState(null)

  useEffect(() => {
    async function initDatabase() {
      try {
        if (dbInstance) {
          setDb(dbInstance)
          setLoading(false)
          return
        }

        // Initialize Fireproof database
        // In Phase 3, we'll add LEK-based encryption here
        const database = fireproof('hypermark')

        dbInstance = database
        setDb(database)
        setLoading(false)
      } catch (err) {
        console.error('Failed to initialize Fireproof:', err)
        setError(err)
        setLoading(false)
      }
    }

    initDatabase()
  }, [])

  return { db, loading, error }
}

/**
 * Query documents with live updates
 * @param {Database} db - Fireproof database instance
 * @param {Object} query - Query parameters
 * @returns {{ docs: Array, loading: boolean, error: Error | null }}
 */
export function useLiveQuery(db, query = {}) {
  const [docs, setDocs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!db) {
      setLoading(true)
      return
    }

    let mounted = true

    async function loadDocs() {
      try {
        // Query all documents matching the criteria
        const allDocs = await db.allDocs()

        // Filter by query parameters
        let filteredDocs = allDocs.rows.map(row => row.doc)

        // Apply query filters
        if (query.type) {
          filteredDocs = filteredDocs.filter(doc => doc.type === query.type)
        }

        if (query.filter) {
          filteredDocs = filteredDocs.filter(query.filter)
        }

        if (mounted) {
          setDocs(filteredDocs)
          setLoading(false)
        }
      } catch (err) {
        console.error('Query failed:', err)
        if (mounted) {
          setError(err)
          setLoading(false)
        }
      }
    }

    // Initial load
    loadDocs()

    // Subscribe to changes
    const unsubscribe = db.subscribe((changes) => {
      // Reload on any change
      loadDocs()
    })

    return () => {
      mounted = false
      if (unsubscribe) {
        unsubscribe()
      }
    }
  }, [db, query.type, query.filter])

  return { docs, loading, error }
}

/**
 * Get a single document by ID with live updates
 * @param {Database} db - Fireproof database instance
 * @param {string} docId - Document ID
 * @returns {{ doc: Object | null, loading: boolean, error: Error | null }}
 */
export function useLiveDoc(db, docId) {
  const [doc, setDoc] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!db || !docId) {
      setLoading(false)
      return
    }

    let mounted = true

    async function loadDoc() {
      try {
        const result = await db.get(docId)
        if (mounted) {
          setDoc(result)
          setLoading(false)
        }
      } catch (err) {
        if (err.name === 'not_found') {
          if (mounted) {
            setDoc(null)
            setLoading(false)
          }
        } else {
          console.error('Failed to get document:', err)
          if (mounted) {
            setError(err)
            setLoading(false)
          }
        }
      }
    }

    // Initial load
    loadDoc()

    // Subscribe to changes
    const unsubscribe = db.subscribe((changes) => {
      // Reload if this doc changed
      if (changes.some(change => change.id === docId)) {
        loadDoc()
      }
    })

    return () => {
      mounted = false
      if (unsubscribe) {
        unsubscribe()
      }
    }
  }, [db, docId])

  return { doc, loading, error }
}
