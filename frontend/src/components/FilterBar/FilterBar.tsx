import type { ReactNode } from 'react'
import styles from './FilterBar.module.css'

export interface FilterBarProps {
  children: ReactNode
}

/** Responsive wrap-row layout for a list page's search box, filter selects and sort control. */
export function FilterBar({ children }: FilterBarProps) {
  return <div className={styles.bar}>{children}</div>
}
