/**
 * WebCrypto key storage utilities
 * Manages persistent storage of CryptoKey references in IndexedDB
 */

const DB_NAME = 'hypermark-keys'
const DB_VERSION = 1
const STORE_NAME = 'keys'

/**
 * Open IndexedDB for key storage
 * @returns {Promise<IDBDatabase>}
 */
function openKeyDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)

    request.onupgradeneeded = (event) => {
      const db = event.target.result

      // Create object store if it doesn't exist
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'name' })
      }
    }
  })
}

/**
 * Store a CryptoKey reference by name
 * Note: We can't directly serialize CryptoKey objects, so we store them
 * using IndexedDB's structured clone algorithm which supports CryptoKey
 * @param {string} name - Key identifier
 * @param {CryptoKey|CryptoKeyPair} key - Key to store
 * @returns {Promise<void>}
 */
export async function storeKey(name, key) {
  try {
    const db = await openKeyDB()

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite')
      const store = transaction.objectStore(STORE_NAME)

      const request = store.put({ name, key })

      request.onsuccess = () => {
        db.close()
        resolve()
      }

      request.onerror = () => {
        db.close()
        reject(request.error)
      }
    })
  } catch (error) {
    console.error('Failed to store key:', error)
    throw new Error('Failed to store key: ' + error.message)
  }
}

/**
 * Retrieve a CryptoKey by name
 * @param {string} name - Key identifier
 * @returns {Promise<CryptoKey|CryptoKeyPair|null>} - Retrieved key or null if not found
 */
export async function retrieveKey(name) {
  try {
    const db = await openKeyDB()

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly')
      const store = transaction.objectStore(STORE_NAME)

      const request = store.get(name)

      request.onsuccess = () => {
        db.close()
        const result = request.result
        resolve(result ? result.key : null)
      }

      request.onerror = () => {
        db.close()
        reject(request.error)
      }
    })
  } catch (error) {
    console.error('Failed to retrieve key:', error)
    throw new Error('Failed to retrieve key: ' + error.message)
  }
}

/**
 * Check if a key exists
 * @param {string} name - Key identifier
 * @returns {Promise<boolean>}
 */
export async function hasKey(name) {
  try {
    const key = await retrieveKey(name)
    return key !== null
  } catch (error) {
    console.error('Failed to check key existence:', error)
    return false
  }
}

/**
 * Delete a key
 * @param {string} name - Key identifier
 * @returns {Promise<void>}
 */
export async function deleteKey(name) {
  try {
    const db = await openKeyDB()

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite')
      const store = transaction.objectStore(STORE_NAME)

      const request = store.delete(name)

      request.onsuccess = () => {
        db.close()
        resolve()
      }

      request.onerror = () => {
        db.close()
        reject(request.error)
      }
    })
  } catch (error) {
    console.error('Failed to delete key:', error)
    throw new Error('Failed to delete key: ' + error.message)
  }
}

/**
 * List all stored key names
 * @returns {Promise<string[]>}
 */
export async function listKeys() {
  try {
    const db = await openKeyDB()

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly')
      const store = transaction.objectStore(STORE_NAME)

      const request = store.getAllKeys()

      request.onsuccess = () => {
        db.close()
        resolve(request.result)
      }

      request.onerror = () => {
        db.close()
        reject(request.error)
      }
    })
  } catch (error) {
    console.error('Failed to list keys:', error)
    throw new Error('Failed to list keys: ' + error.message)
  }
}

/**
 * Clear all stored keys
 * @returns {Promise<void>}
 */
export async function clearAllKeys() {
  try {
    const db = await openKeyDB()

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite')
      const store = transaction.objectStore(STORE_NAME)

      const request = store.clear()

      request.onsuccess = () => {
        db.close()
        resolve()
      }

      request.onerror = () => {
        db.close()
        reject(request.error)
      }
    })
  } catch (error) {
    console.error('Failed to clear keys:', error)
    throw new Error('Failed to clear keys: ' + error.message)
  }
}

// Standard key names used by the application
export const KEY_NAMES = {
  DEVICE_KEYPAIR: 'device-keypair',
  LEK: 'lek',
}

/**
 * Store device identity keypair
 * @param {CryptoKeyPair} keypair - Device keypair
 * @returns {Promise<void>}
 */
export async function storeDeviceKeypair(keypair) {
  return storeKey(KEY_NAMES.DEVICE_KEYPAIR, keypair)
}

/**
 * Retrieve device identity keypair
 * @returns {Promise<CryptoKeyPair|null>}
 */
export async function retrieveDeviceKeypair() {
  return retrieveKey(KEY_NAMES.DEVICE_KEYPAIR)
}

/**
 * Store LEK (Ledger Encryption Key)
 * @param {CryptoKey} lek - LEK
 * @returns {Promise<void>}
 */
export async function storeLEK(lek) {
  return storeKey(KEY_NAMES.LEK, lek)
}

/**
 * Retrieve LEK
 * @returns {Promise<CryptoKey|null>}
 */
export async function retrieveLEK() {
  return retrieveKey(KEY_NAMES.LEK)
}

/**
 * Check if device is initialized (has keypair and LEK)
 * @returns {Promise<{hasKeypair: boolean, hasLEK: boolean}>}
 */
export async function checkDeviceInitialization() {
  const [hasKeypair, hasLEK] = await Promise.all([
    hasKey(KEY_NAMES.DEVICE_KEYPAIR),
    hasKey(KEY_NAMES.LEK),
  ])

  return { hasKeypair, hasLEK }
}
