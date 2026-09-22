import styles from './Skeleton.module.css'

export interface SkeletonProps {
  width?: string | number
  height?: string | number
  circle?: boolean
}

/** Decorative loading placeholder; hidden from assistive tech (the parent should expose its own loading status). */
export function Skeleton({ width = '100%', height = '1rem', circle = false }: SkeletonProps) {
  return (
    <span
      aria-hidden="true"
      className={[styles.skeleton, circle ? styles.circle : ''].filter(Boolean).join(' ')}
      style={{ width, height }}
    />
  )
}
