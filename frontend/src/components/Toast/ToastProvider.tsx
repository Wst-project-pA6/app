import { CheckCircle2, Info, XCircle } from 'lucide-react'
import type { ReactNode } from 'react'
import { useCallback, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ToastContext, type ToastVariant } from './ToastContext'
import styles from './ToastProvider.module.css'

interface ToastItem {
  id: number
  message: string
  variant: ToastVariant
}

const ICONS: Record<ToastVariant, typeof Info> = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
}

const AUTO_DISMISS_MS = 5000

/** Accessible toast/notification host: an `aria-live="polite"` region rendered once at the app root. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const nextId = useRef(0)

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const showToast = useCallback(
    (message: string, variant: ToastVariant = 'success') => {
      const id = nextId.current++
      setToasts((current) => [...current, { id, message, variant }])
      setTimeout(() => dismiss(id), AUTO_DISMISS_MS)
    },
    [dismiss],
  )

  const value = useMemo(() => ({ showToast }), [showToast])

  return (
    <ToastContext value={value}>
      {children}
      {createPortal(
        <div className={styles.region} role="status" aria-live="polite">
          {toasts.map((toast) => {
            const Icon = ICONS[toast.variant]
            return (
              <div key={toast.id} className={[styles.toast, styles[toast.variant]].join(' ')}>
                <Icon size={18} aria-hidden="true" />
                <span>{toast.message}</span>
              </div>
            )
          })}
        </div>,
        document.body,
      )}
    </ToastContext>
  )
}
