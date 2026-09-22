import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { useAuditEventsQuery } from '@/api/hooks/audit'
import { ListStateBoundary, PageHeader, Pagination, Select, Table, TextInput, type TableColumn } from '@/components'
import { FilterBar } from '@/components/FilterBar/FilterBar'
import { formatDateTime } from '@/lib/format'
import { useSearchParamPage, useSearchParamState } from '@/hooks/useSearchParamState'
import type { AuditEvent } from '@/api/types'
import styles from '../Stage5.module.css'

export function AuditListPage() {
  const { t } = useTranslation()
  const [entityType, setEntityType] = useSearchParamState('entityType')
  const [entityId, setEntityId] = useSearchParamState('entityId')
  const [outcome, setOutcome] = useSearchParamState('outcome')
  const [page, setPage] = useSearchParamPage()
  const query = useAuditEventsQuery({
    page,
    pageSize: 20,
    sort: '-occurredAt',
    entityType: entityType || undefined,
    entityId: entityId || undefined,
    outcome: outcome as 'SUCCESS' | 'DENIED' | 'FAILED' | undefined,
  })
  const columns: ReadonlyArray<TableColumn<AuditEvent>> = [
    { key: 'occurredAt', header: t('audit.occurredAt'), render: (row) => formatDateTime(row.occurredAt) },
    {
      key: 'action',
      header: t('audit.action'),
      render: (row) => (
        <Link to={`/audit/${row.id}`} className="dir-ltr">
          {row.action}
        </Link>
      ),
    },
    {
      key: 'entity',
      header: t('audit.entity'),
      render: (row) => (
        <span className="dir-ltr">
          {row.entityType}
          {row.entityId ? ` · ${row.entityId}` : ''}
        </span>
      ),
    },
    { key: 'outcome', header: t('common.status'), render: (row) => row.outcome },
    { key: 'summary', header: t('audit.summary'), render: (row) => row.summary ?? '—' },
  ]
  return (
    <div className={styles.page}>
      <PageHeader title={t('audit.title')} />
      <FilterBar>
        <TextInput
          aria-label={t('audit.entityType')}
          placeholder={t('audit.entityType')}
          value={entityType}
          onChange={(event) => setEntityType(event.target.value)}
        />
        <TextInput
          aria-label={t('audit.entityId')}
          placeholder={t('audit.entityId')}
          value={entityId}
          onChange={(event) => setEntityId(event.target.value)}
          className="dir-ltr"
        />
        <Select aria-label={t('common.status')} value={outcome} onChange={(event) => setOutcome(event.target.value)}>
          <option value="">{t('common.allStatuses')}</option>
          <option value="SUCCESS">SUCCESS</option>
          <option value="DENIED">DENIED</option>
          <option value="FAILED">FAILED</option>
        </Select>
      </FilterBar>
      <ListStateBoundary
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={() => void query.refetch()}
        isEmpty={(query.data?.items.length ?? 0) === 0}
        emptyTitle={t('audit.emptyTitle')}
        emptyDescription={t('audit.emptyDescription')}
      >
        <Table columns={columns} rows={query.data?.items ?? []} getRowKey={(row) => row.id} />
        {query.data ? (
          <Pagination
            page={query.data.page.page}
            pageSize={query.data.page.pageSize}
            totalItems={query.data.page.totalItems}
            totalPages={query.data.page.totalPages}
            onPageChange={setPage}
          />
        ) : null}
      </ListStateBoundary>
    </div>
  )
}
