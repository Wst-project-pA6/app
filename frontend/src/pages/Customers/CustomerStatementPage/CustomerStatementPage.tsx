import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router-dom'
import { useCustomerStatementQuery } from '@/api/hooks/finance'
import { Alert, Card, ListStateBoundary, PageHeader, Table, type TableColumn } from '@/components'
import { formatDateTime, formatMoney } from '@/lib/format'
import type { StatementLine } from '@/api/types'
import styles from '../../Stage5.module.css'

export function CustomerStatementPage() {
  const { customerId } = useParams<{ customerId: string }>()
  const { t } = useTranslation()
  const query = useCustomerStatementQuery(customerId, {})
  const columns: ReadonlyArray<TableColumn<StatementLine>> = [
    {
      key: 'invoiceNumber',
      header: t('invoices.columns.number'),
      render: (row) => (
        <Link to={`/invoices/${row.invoiceId}`} className="dir-ltr">
          {row.invoiceNumber ?? row.invoiceId}
        </Link>
      ),
    },
    {
      key: 'jobNumber',
      header: t('invoices.columns.job'),
      render: (row) => <span className="dir-ltr">{row.jobNumber}</span>,
    },
    { key: 'status', header: t('common.status'), render: (row) => row.status },
    {
      key: 'total',
      header: t('invoices.columns.total'),
      render: (row) => <span className="dir-ltr">{formatMoney(row.total)}</span>,
    },
    {
      key: 'paidAmount',
      header: t('statement.paid'),
      render: (row) => <span className="dir-ltr">{formatMoney(row.paidAmount)}</span>,
    },
    {
      key: 'issuedAt',
      header: t('invoices.issuedAt'),
      render: (row) => (row.issuedAt ? formatDateTime(row.issuedAt) : '—'),
    },
  ]
  return (
    <div className={styles.page}>
      <PageHeader
        title={query.data?.customerDisplayName ?? t('statement.title')}
        actions={<Link to={`/customers/${customerId}`}>{t('statement.backToCustomer')}</Link>}
      />
      <ListStateBoundary
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={() => void query.refetch()}
        isEmpty={false}
        emptyTitle=""
      >
        {query.data ? (
          <>
            <div className={styles.meta}>
              {t('statement.generatedAt', { date: formatDateTime(query.data.generatedAt) })}
            </div>
            <Card title={t('statement.linesTitle')}>
              <Table columns={columns} rows={query.data.lines} getRowKey={(row) => row.invoiceId} />
            </Card>
            <Card title={t('statement.summaryTitle')}>
              <dl className={styles.detailGrid}>
                <div>
                  <dt>{t('statement.totalInvoiced')}</dt>
                  <dd className="dir-ltr">{formatMoney(query.data.totalInvoiced)}</dd>
                </div>
                <div>
                  <dt>{t('statement.totalPaid')}</dt>
                  <dd className="dir-ltr">{formatMoney(query.data.totalPaid)}</dd>
                </div>
                <div>
                  <dt>{t('statement.totalOutstanding')}</dt>
                  <dd className="dir-ltr">{formatMoney(query.data.totalOutstanding)}</dd>
                </div>
              </dl>
            </Card>
          </>
        ) : null}
      </ListStateBoundary>
      {query.isError ? <Alert variant="warning">{t('statement.unavailable')}</Alert> : null}
    </div>
  )
}
