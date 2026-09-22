import { useTranslation } from 'react-i18next'
import { useJobStageHistoryQuery } from '@/api/hooks/jobs'
import { Card, ListStateBoundary, Table, type TableColumn } from '@/components'
import { formatDateTime } from '@/lib/format'
import type { JobCard, JobStageEvent } from '@/api/types'

export function HistoryTab({ job }: { job: JobCard }) {
  const { t } = useTranslation()
  const historyQuery = useJobStageHistoryQuery(job.id, { sort: 'transitionedAt' })

  const columns: ReadonlyArray<TableColumn<JobStageEvent>> = [
    {
      key: 'fromStage',
      header: t('jobs.history.columns.from'),
      render: (row) => (row.fromStage ? t(`jobs.stages.${row.fromStage}`) : '—'),
    },
    { key: 'toStage', header: t('jobs.history.columns.to'), render: (row) => t(`jobs.stages.${row.toStage}`) },
    {
      key: 'transitionedAt',
      header: t('jobs.history.columns.at'),
      render: (row) => formatDateTime(row.transitionedAt),
    },
    { key: 'reason', header: t('jobs.history.columns.reason'), render: (row) => row.reason ?? '—' },
  ]

  return (
    <Card title={t('jobs.tabs.history')}>
      <ListStateBoundary
        isLoading={historyQuery.isLoading}
        isError={historyQuery.isError}
        error={historyQuery.error}
        onRetry={() => void historyQuery.refetch()}
        isEmpty={(historyQuery.data?.items.length ?? 0) === 0}
        emptyTitle={t('jobs.history.empty.title')}
        emptyDescription=""
      >
        <Table columns={columns} rows={historyQuery.data?.items ?? []} getRowKey={(row) => row.id} />
      </ListStateBoundary>
    </Card>
  )
}
