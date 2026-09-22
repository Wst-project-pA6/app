import { useTranslation } from 'react-i18next'
import styles from './LoadingIndicator.module.css'

export interface LoadingIndicatorProps {
  label?: string
}

export function LoadingIndicator({ label }: LoadingIndicatorProps) {
  const { t } = useTranslation()
  const text = label ?? t('common.loading')

  return (
    <div className={styles.wrapper} role="status">
      <span className={styles.spinner} aria-hidden="true" />
      <span>{text}</span>
    </div>
  )
}
