import { useState, useEffect } from 'react'
import QRCode from 'qrcode'
import { encodeShortCode } from '../../utils/qr'
import { Button } from '../ui/Button'

export default function QRCodeDisplay({ session, onError }) {
  const [qrDataUrl, setQrDataUrl] = useState(null)
  const [shortCode, setShortCode] = useState(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!session) return
    generateQR()
  }, [session])

  async function generateQR() {
    try {
      const payload = JSON.stringify(session)

      const dataUrl = await QRCode.toDataURL(payload, {
        errorCorrectionLevel: 'M',
        margin: 0,
        width: 300,
        color: {
          dark: '#000000',
          light: '#FFFFFF',
        },
      })

      setQrDataUrl(dataUrl)

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
      const json = JSON.stringify(session, null, 2)
      await navigator.clipboard.writeText(json)
      setCopied('json')
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy JSON:', err)
      onError(new Error('Failed to copy JSON'))
    }
  }

  if (!session) {
    return (
      <div className="animate-pulse space-y-4 w-full">
        <div className="w-[200px] h-[200px] bg-muted/20 rounded-lg mx-auto"></div>
      </div>
    )
  }

  return (
    <div className="text-center w-full">
      {qrDataUrl && (
        <div className="bg-white p-6 rounded-2xl inline-block mb-6 shadow-sm ring-1 ring-black/5">
          <img
            src={qrDataUrl}
            alt="Pairing QR Code"
            className="w-[200px] h-[200px] sm:w-[240px] sm:h-[240px]"
          />
        </div>
      )}

      <div className="max-w-xs mx-auto">
        <details className="group border border-border/50 rounded-lg overflow-hidden bg-card/30">
          <summary className="cursor-pointer p-3 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent/50 flex items-center justify-between select-none">
            <span>Can't scan? Enter manually</span>
            <span className="text-[10px] opacity-50 group-open:rotate-180 transition-transform">▼</span>
          </summary>

          <div className="p-3 pt-0 border-t border-border/50 bg-background/50">
            <div className="pt-3 mb-3">
              <label className="block text-[10px] font-medium text-muted-foreground mb-1.5 text-left uppercase tracking-wider">
                Short Code
              </label>
              <div className="flex gap-2">
                <code className="flex-1 px-2 py-1.5 bg-muted/20 border border-border/50 rounded text-xs font-mono break-all text-left text-foreground">
                  {shortCode}
                </code>
                <Button
                  onClick={copyShortCode}
                  size="small"
                  variant="ghost"
                  className="h-full border border-border/50"
                >
                  {copied === 'short' ? 'Copied' : 'Copy'}
                </Button>
              </div>
            </div>

            <div>
              <Button
                onClick={copyFullJSON}
                variant="ghost"
                size="small"
                className="w-full justify-center text-xs h-8 border border-border/50"
              >
                {copied === 'json' ? 'Copied JSON' : 'Copy Full Payload'}
              </Button>
            </div>
          </div>
        </details>
        
        <p className="text-[10px] text-muted-foreground/60 mt-4 font-medium uppercase tracking-wider">
          Session expires in 5 minutes
        </p>
      </div>
    </div>
  )
}
