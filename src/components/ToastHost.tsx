import { useEffect, useState, type CSSProperties } from 'react'
import { subscribeToasts, type ToastPayload, type ToastTone } from '@/lib/toastBus'

const TONE_STYLE: Record<ToastTone, CSSProperties> = {
  error: {
    background: 'var(--signal)',
    color: '#FFFFFF',
  },
  success: {
    background: 'var(--inbound)',
    color: '#0A0A12',
  },
  info: {
    background: 'var(--ink)',
    color: 'var(--paper)',
  },
}

const DISMISS_MS = 4_500

export function ToastHost() {
  const [items, setItems] = useState<ToastPayload[]>([])

  useEffect(() => {
    return subscribeToasts((toast) => {
      setItems((prev) => [...prev, toast])
      window.setTimeout(() => {
        setItems((prev) => prev.filter((t) => t.id !== toast.id))
      }, DISMISS_MS)
    })
  }, [])

  if (items.length === 0) return null

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 px-4 pb-24"
      aria-live="polite"
    >
      {items.map((item) => (
        <div
          key={item.id}
          role={item.tone === 'error' ? 'alert' : 'status'}
          className="pointer-events-auto max-w-sm rounded-xl px-4 py-3 text-sm shadow-[var(--shadow-soft)]"
          style={TONE_STYLE[item.tone]}
        >
          {item.message}
        </div>
      ))}
    </div>
  )
}
