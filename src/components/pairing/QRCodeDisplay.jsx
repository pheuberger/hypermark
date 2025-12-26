/**
 * QRCodeDisplay Component
 * Displays QR code for pairing initiator with verification words and manual fallbacks
 * See: docs/plans/2025-12-27-qrcodedisplay-component-design.md
 */

import { useState, useEffect } from 'preact/hooks'
import QRCode from 'qrcode'
import { encodeShortCode } from '../../utils/qr'

export default function QRCodeDisplay({ session, verificationWords, onError }) {
  const [qrDataUrl, setQrDataUrl] = useState(null)
  const [shortCode, setShortCode] = useState(null)
  const [copied, setCopied] = useState(false) // 'short' | 'json' | false

  // Generate QR code when session is available
  useEffect(() => {
    if (!session) return
    generateQR()
  }, [session])

  async function generateQR() {
    try {
      // Encode session as JSON
      const payload = JSON.stringify(session)

      // Generate QR code as data URL
      const dataUrl = await QRCode.toDataURL(payload, {
        errorCorrectionLevel: 'M', // Medium error correction (15% damage tolerance)
        margin: 2, // 2-module quiet zone
        width: 300, // 300x300 pixels
        color: {
          dark: '#000000',
          light: '#FFFFFF',
        },
      })

      setQrDataUrl(dataUrl)

      // Also generate short code
      const code = encodeShortCode(session)
      setShortCode(code)
    } catch (err) {
      console.error('Failed to generate QR:', err)
      onError(new Error(`Failed to generate QR: ${err.message}`))
    }
  }

  async function copyShortCode() {
    try {
      await navigator.clipboard.writeText(shortCode)
      setCopied('short')

      // Reset after 2 seconds
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy short code:', err)
      onError(new Error('Failed to copy short code'))
    }
  }

  async function copyFullJSON() {
    try {
      const json = JSON.stringify(session, null, 2) // Pretty print
      await navigator.clipboard.writeText(json)
      setCopied('json')

      // Reset after 2 seconds
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy JSON:', err)
      onError(new Error('Failed to copy JSON'))
    }
  }

  // Show loading state if no session
  if (!session) {
    return (
      <div class="qr-code-display max-w-md mx-auto p-6 text-center">
        <div class="animate-pulse">
          <div class="h-8 bg-gray-200 rounded w-3/4 mx-auto mb-4"></div>
          <div class="h-4 bg-gray-200 rounded w-1/2 mx-auto mb-8"></div>
          <div class="w-[300px] h-[300px] bg-gray-200 rounded-lg mx-auto"></div>
        </div>
      </div>
    )
  }

  return (
    <div class="qr-code-display max-w-md mx-auto p-6 text-center">
      {/* Header */}
      <div class="header mb-6">
        <h2 class="text-2xl font-bold mb-2">Scan to Pair</h2>
        <p class="text-gray-600 text-sm">
          Scan this QR code with your other device
        </p>
      </div>

      {/* QR Code */}
      {qrDataUrl && (
        <div class="qr-container bg-white p-4 rounded-lg shadow-lg inline-block mb-6">
          <img
            src={qrDataUrl}
            alt="Pairing QR Code"
            class="w-[300px] h-[300px]"
          />
        </div>
      )}

      {/* Verification Words (progressive disclosure) */}
      {verificationWords && (
        <div class="verification-section bg-blue-50 p-4 rounded-lg mb-6">
          <h3 class="text-lg font-semibold mb-3">Verification Words</h3>
          <div class="words-display flex justify-center items-center gap-3 mb-2">
            <span class="word text-3xl font-bold lowercase">
              {verificationWords[0]}
            </span>
            <span class="separator text-2xl text-gray-400">·</span>
            <span class="word text-3xl font-bold lowercase">
              {verificationWords[1]}
            </span>
          </div>
          <p class="text-sm text-gray-600">
            Confirm these match on the other device
          </p>
        </div>
      )}

      {/* Manual Pairing Options (collapsed by default) */}
      <details class="manual-pairing text-left bg-gray-50 p-4 rounded-lg mb-4">
        <summary class="cursor-pointer text-sm font-medium text-gray-700 hover:text-gray-900">
          Can't scan? Enter manually
        </summary>

        <div class="mt-4 space-y-4">
          {/* Short Code */}
          <div class="short-code-section">
            <label class="block text-xs font-medium text-gray-700 mb-1">
              Short Code:
            </label>
            <div class="flex gap-2">
              <code class="flex-1 px-3 py-2 bg-white border rounded text-sm font-mono break-all">
                {shortCode}
              </code>
              <button
                onClick={copyShortCode}
                class="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded text-sm font-medium transition-colors whitespace-nowrap"
              >
                {copied === 'short' ? '✓ Copied' : 'Copy'}
              </button>
            </div>
          </div>

          {/* Full JSON */}
          <div class="full-json-section">
            <label class="block text-xs font-medium text-gray-700 mb-1">
              Or copy full payload:
            </label>
            <button
              onClick={copyFullJSON}
              class="w-full px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded text-sm font-medium transition-colors"
            >
              {copied === 'json' ? '✓ Copied JSON' : 'Copy JSON'}
            </button>
          </div>
        </div>
      </details>

      {/* Expiry Warning */}
      <p class="text-sm text-gray-500">⏱ Session expires in 5 minutes</p>
    </div>
  )
}
