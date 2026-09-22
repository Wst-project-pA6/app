import type { ReactNode } from 'react'
import styles from './StatusBadge.module.css'

export type StatusTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info'

export interface StatusBadgeProps {
  tone?: StatusTone
  children: ReactNode
}

export function StatusBadge({ tone = 'neutral', children }: StatusBadgeProps) {
  return <span className={[styles.badge, styles[tone]].join(' ')}>{children}</span>
}
