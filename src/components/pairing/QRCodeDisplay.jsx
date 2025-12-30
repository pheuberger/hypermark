/**
 * QRCodeDisplay Component
 * Displays QR code for pairing initiator with verification words and manual fallbacks
 * See: docs/plans/2025-12-27-qrcodedisplay-component-design.md
 */

import { useState, useEffect } from 'preact/hooks'
import QRCode from 'qrcode'
import { encodeShortCode } from '../../utils/qr'
import { Button } from '../ui/Button'

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
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy JSON:', err)
      onError(new Error('Failed to copy JSON'))
    }
  }

  // Show loading state if no session
  if (!session) {
    return (
      <div className="max-w-md mx-auto p-6 text-center">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-base-300 rounded w-3/4 mx-auto"></div>
          <div className="h-4 bg-base-300 rounded w-1/2 mx-auto mb-8"></div>
          <div className="w-[300px] h-[300px] bg-base-300 rounded-lg mx-auto"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-md mx-auto p-6 text-center">
      {/* Header */}
      <div className="mb-8">
        <h2 className="text-2xl font-bold mb-2">Scan to Pair</h2>
        <p className="text-base-content/60 text-sm">
          Scan this QR code with your other device
        </p>
      </div>

      {/* QR Code */}
      {qrDataUrl && (
        <div className="bg-white p-4 rounded-xl shadow-sm border border-base-300 inline-block mb-8">
          <img
            src={qrDataUrl}
            alt="Pairing QR Code"
            className="w-[280px] h-[280px]"
          />
        </div>
      )}

      {/* Verification Words (progressive disclosure) */}
      {verificationWords && (
        <div className="bg-primary/5 border border-primary/20 p-6 rounded-lg mb-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
          <h3 className="text-sm font-semibold text-base-content/80 mb-4 uppercase tracking-wider">Verification Words</h3>
          <div className="flex justify-center items-center gap-4 mb-2">
            <span className="text-3xl font-bold lowercase text-primary">
              {verificationWords[0]}
            </span>
            <span className="text-2xl text-base-content/20">·</span>
            <span className="text-3xl font-bold lowercase text-primary">
              {verificationWords[1]}
            </span>
          </div>
          <p className="text-sm text-base-content/60 mt-2">
            Confirm these match on the other device
          </p>
        </div>
      )}

      {/* Manual Pairing Options (collapsed by default) */}
      <details className="group bg-base-200/50 border border-base-200 rounded-lg overflow-hidden transition-all duration-200">
        <summary className="cursor-pointer p-4 text-sm font-medium text-base-content/80 hover:text-base-content hover:bg-base-200 flex items-center justify-between">
          <span>Can't scan? Enter manually</span>
          <span className="text-xs opacity-50 group-open:rotate-180 transition-transform">▼</span>
        </summary>

        <div className="p-4 pt-0 space-y-4 border-t border-base-200/50">
          {/* Short Code */}
          <div className="pt-4">
            <label className="block text-xs font-medium text-base-content/70 mb-2 text-left">
              Short Code
            </label>
            <div className="flex gap-2">
              <code className="flex-1 px-3 py-2 bg-base-100 border border-base-300 rounded-md text-sm font-mono break-all text-left">
                {shortCode}
              </code>
              <Button
                onClick={copyShortCode}
                size="small"
                variant="secondary"
              >
                {copied === 'short' ? 'Copied' : 'Copy'}
              </Button>
            </div>
          </div>

          {/* Full JSON */}
          <div>
            <label className="block text-xs font-medium text-base-content/70 mb-2 text-left">
              Or copy full payload
            </label>
            <Button
              onClick={copyFullJSON}
              variant="secondary"
              className="w-full justify-center"
            >
              {copied === 'json' ? 'Copied JSON' : 'Copy JSON'}
            </Button>
          </div>
        </div>
      </details>

      {/* Expiry Warning */}
      <p className="text-xs text-base-content/40 mt-6 font-medium">⏱ Session expires in 5 minutes</p>
    </div>
  )
}
