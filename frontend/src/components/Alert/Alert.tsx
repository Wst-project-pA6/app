import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react'
import type { ReactNode } from 'react'
import styles from './Alert.module.css'

export type AlertVariant = 'info' | 'success' | 'warning' | 'danger'

export interface AlertProps {
  variant?: AlertVariant
  title?: ReactNode
  children: ReactNode
}

const ICONS: Record<AlertVariant, typeof Info> = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: XCircle,
}

/** Renders as `role="alert"` for danger/warning so assistive tech announces it immediately. */
export function Alert({ variant = 'info', title, children }: AlertProps) {
  const Icon = ICONS[variant]
  const isAssertive = variant === 'danger' || variant === 'warning'

  return (
    <div
      className={[styles.alert, styles[variant]].join(' ')}
      role="alert"
      aria-live={isAssertive ? 'assertive' : 'polite'}
    >
      <Icon size={20} aria-hidden="true" className={styles.icon} />
      <div>
        {title ? <p className={styles.title}>{title}</p> : null}
        <div className={styles.body}>{children}</div>
      </div>
    </div>
  )
}
