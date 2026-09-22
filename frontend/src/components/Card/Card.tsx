import type { ReactNode } from 'react'
import styles from './Card.module.css'

export interface CardProps {
  title?: ReactNode
  children: ReactNode
  className?: string
}

export function Card({ title, children, className }: CardProps) {
  return (
    <section className={[styles.card, className].filter(Boolean).join(' ')}>
      {title ? <h2 className={styles.title}>{title}</h2> : null}
      {children}
    </section>
  )
}
