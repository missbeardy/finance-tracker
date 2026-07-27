export type ToastTone = 'error' | 'success' | 'info'

export type ToastPayload = {
  id: string
  message: string
  tone: ToastTone
}

type Listener = (toast: ToastPayload) => void

const listeners = new Set<Listener>()

export function subscribeToasts(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function emit(message: string, tone: ToastTone) {
  const toast: ToastPayload = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    message,
    tone,
  }
  for (const listener of listeners) listener(toast)
}

export const toast = {
  error: (message: string) => emit(message, 'error'),
  success: (message: string) => emit(message, 'success'),
  info: (message: string) => emit(message, 'info'),
}
