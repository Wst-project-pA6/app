import { useTranslation } from 'react-i18next'
import { ApiError } from '@/api/errors'
import { Alert } from '../Alert/Alert'
import { Button } from '../Button/Button'
import styles from './QueryErrorPanel.module.css'

export interface QueryErrorPanelProps {
  error: unknown
  onRetry?: () => void
}

/** Renders a backend error's message and requestId (when structured), falling back to a generic message otherwise. */
export function QueryErrorPanel({ error, onRetry }: QueryErrorPanelProps) {
  const { t } = useTranslation()

  const isApiError = error instanceof ApiError
  const message = isApiError ? error.message : t('errors.unknownError')
  const requestId = isApiError ? error.requestId : undefined

  return (
    <Alert variant="danger" title={t('errors.requestFailed')}>
      <p className={styles.message}>{message}</p>
      {requestId ? (
        <p className={[styles.requestId, 'dir-ltr'].join(' ')}>{t('common.requestId', { id: requestId })}</p>
      ) : null}
      {onRetry ? (
        <Button type="button" variant="secondary" size="sm" onClick={onRetry} className={styles.retryButton}>
          {t('common.retry')}
        </Button>
      ) : null}
    </Alert>
  )
}
