import type { ElementType, ReactNode } from 'react'
import styles from './VisuallyHidden.module.css'

interface VisuallyHiddenProps {
  children: ReactNode
  as?: ElementType
}

/** Renders content that is available to assistive technology but not sighted users. */
export function VisuallyHidden({ children, as: Component = 'span' }: VisuallyHiddenProps) {
  return <Component className={styles.root}>{children}</Component>
}
