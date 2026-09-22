import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router-dom'
import { useAuditEventQuery } from '@/api/hooks/audit'
import { Card, ListStateBoundary, PageHeader } from '@/components'
import { formatDateTime } from '@/lib/format'
import styles from '../Stage5.module.css'

export function AuditDetailPage() {
  const { auditEventId } = useParams<{ auditEventId: string }>()
  const { t } = useTranslation()
  const query = useAuditEventQuery(auditEventId)
  const event = query.data
  return (
    <div className={styles.page}>
      <PageHeader title={t('audit.detailTitle')} actions={<Link to="/audit">{t('audit.backToList')}</Link>} />
      <ListStateBoundary
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={() => void query.refetch()}
        isEmpty={false}
        emptyTitle=""
      >
        {event ? (
          <>
            <Card title={event.action}>
              <dl className={styles.detailGrid}>
                <div>
                  <dt>{t('audit.occurredAt')}</dt>
                  <dd>{formatDateTime(event.occurredAt)}</dd>
                </div>
                <div>
                  <dt>{t('audit.entity')}</dt>
                  <dd className="dir-ltr">
                    {event.entityType}
                    {event.entityId ? ` · ${event.entityId}` : ''}
                  </dd>
                </div>
                <div>
                  <dt>{t('audit.outcome')}</dt>
                  <dd>{event.outcome}</dd>
                </div>
                <div>
                  <dt>{t('audit.requestId')}</dt>
                  <dd className="dir-ltr">{event.requestId}</dd>
                </div>
                <div>
                  <dt>{t('audit.actor')}</dt>
                  <dd className="dir-ltr">{event.actorUserId ?? '—'}</dd>
                </div>
                <div>
                  <dt>{t('audit.summary')}</dt>
                  <dd>{event.summary ?? '—'}</dd>
                </div>
              </dl>
            </Card>
            {event.changes?.length ? (
              <Card title={t('audit.changes')}>
                <ul>
                  {event.changes.map((change) => (
                    <li key={change.field}>
                      <span className="dir-ltr">{change.field}</span>:{' '}
                      <span className="dir-ltr">
                        {change.before ?? '—'} → {change.after ?? '—'}
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
            ) : null}
          </>
        ) : null}
      </ListStateBoundary>
    </div>
  )
}
