import { useTranslation } from 'react-i18next'
import { useJobInvoiceSummaryQuery, useRegenerateJobInvoiceMutation } from '@/api/hooks/jobs'
import { useAuth } from '@/auth/useAuth'
import { hasAnyPermission } from '@/auth/permissions'
import { Alert, Button, Card, ListStateBoundary, Table, useToast, type TableColumn } from '@/components'
import { formatDateTime, formatMoney } from '@/lib/format'
import type { InvoiceLine } from '@/api/types'
import type { JobCard } from '@/api/types'

export function InvoicePreviewTab({ job }: { job: JobCard }) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const { showToast } = useToast()
  const query = useJobInvoiceSummaryQuery(job.id)
  const regenerate = useRegenerateJobInvoiceMutation(job.id)
  const canRegenerate = hasAnyPermission(user, ['invoices.manage'])
  const columns: ReadonlyArray<TableColumn<InvoiceLine>> = [
    { key: 'lineType', header: t('invoices.columns.type'), render: (row) => row.lineType },
    { key: 'description', header: t('invoices.columns.description'), render: (row) => row.description },
    {
      key: 'quantity',
      header: t('invoices.columns.quantity'),
      render: (row) => <span className="dir-ltr">{row.quantity}</span>,
    },
    {
      key: 'lineTotal',
      header: t('invoices.columns.total'),
      render: (row) => <span className="dir-ltr">{formatMoney(row.lineTotal)}</span>,
    },
  ]
  async function handleRegenerate() {
    try {
      await regenerate.mutateAsync()
      showToast(t('invoices.regenerated'), 'success')
    } catch {
      /* rendered below */
    }
  }
  return (
    <Card title={t('jobs.invoicePreviewTitle')}>
      <ListStateBoundary
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={() => void query.refetch()}
        isEmpty={(query.data?.lines.length ?? 0) === 0}
        emptyTitle={t('invoices.emptyLines')}
        emptyDescription={t('invoices.emptyLinesDescription')}
      >
        {query.data ? (
          <>
            <div>{t('jobs.calculatedAt', { date: formatDateTime(query.data.calculatedAt) })}</div>
            <Table columns={columns} rows={query.data.lines} getRowKey={(row) => row.id} />
            <dl>
              <dt>{t('invoices.total')}</dt>
              <dd className="dir-ltr">{formatMoney(query.data.totals.total)}</dd>
            </dl>
          </>
        ) : null}
      </ListStateBoundary>
      {canRegenerate ? (
        <Button type="button" onClick={() => void handleRegenerate()} isLoading={regenerate.isPending}>
          {t('jobs.regenerateInvoice')}
        </Button>
      ) : null}
      {regenerate.isError ? <Alert variant="danger">{t('errors.requestFailed')}</Alert> : null}
    </Card>
  )
}
