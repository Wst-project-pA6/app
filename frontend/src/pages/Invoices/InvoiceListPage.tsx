import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { useInvoicesQuery } from '@/api/hooks/finance'
import { ListStateBoundary, PageHeader, Pagination, Select, Table, TextInput, type TableColumn } from '@/components'
import { FilterBar } from '@/components/FilterBar/FilterBar'
import { formatDate, formatMoney } from '@/lib/format'
import { useSearchParamPage, useSearchParamState } from '@/hooks/useSearchParamState'
import type { Invoice } from '@/api/types'
import styles from '../Stage5.module.css'

const STATUSES = ['DRAFT', 'ISSUED', 'PAID', 'VOID'] as const

export function InvoiceListPage() {
  const { t } = useTranslation()
  const [status, setStatus] = useSearchParamState('status')
  const [invoiceNumber, setInvoiceNumber] = useSearchParamState('invoiceNumber')
  const [sort, setSort] = useSearchParamState('sort', '-createdAt')
  const [page, setPage] = useSearchParamPage()
  const query = useInvoicesQuery({
    page,
    pageSize: 20,
    status: status ? (status as (typeof STATUSES)[number]) : undefined,
    invoiceNumber: invoiceNumber || undefined,
    sort,
  })
  const columns: ReadonlyArray<TableColumn<Invoice>> = [
    {
      key: 'invoiceNumber',
      header: t('invoices.columns.number'),
      render: (row) => (
        <Link to={`/invoices/${row.id}`} className="dir-ltr">
          {row.invoiceNumber ?? t('invoices.draft')}
        </Link>
      ),
      dirStable: true,
    },
    {
      key: 'jobNumber',
      header: t('invoices.columns.job'),
      render: (row) => (
        <Link to={`/jobs/${row.jobId}`} className="dir-ltr">
          {row.jobNumber ?? row.jobId}
        </Link>
      ),
      dirStable: true,
    },
    { key: 'status', header: t('common.status'), render: (row) => row.status },
    {
      key: 'total',
      header: t('invoices.columns.total'),
      render: (row) => <span className="dir-ltr">{formatMoney(row.totals.total)}</span>,
    },
    { key: 'createdAt', header: t('common.createdAt'), render: (row) => formatDate(row.createdAt) },
  ]
  return (
    <div className={styles.page}>
      <PageHeader title={t('invoices.title')} />
      <FilterBar>
        <Select aria-label={t('common.status')} value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="">{t('common.allStatuses')}</option>
          {STATUSES.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </Select>
        <TextInput
          aria-label={t('invoices.invoiceNumberFilter')}
          placeholder={t('invoices.invoiceNumberFilter')}
          value={invoiceNumber}
          onChange={(event) => setInvoiceNumber(event.target.value)}
          className="dir-ltr"
        />
        <Select aria-label={t('common.sortBy')} value={sort} onChange={(event) => setSort(event.target.value)}>
          <option value="-createdAt">{t('common.createdAt')} ↓</option>
          <option value="invoiceNumber">{t('invoices.columns.number')} ↑</option>
          <option value="-total">{t('invoices.columns.total')} ↓</option>
        </Select>
      </FilterBar>
      <ListStateBoundary
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={() => void query.refetch()}
        isEmpty={(query.data?.items.length ?? 0) === 0}
        emptyTitle={t('invoices.emptyTitle')}
        emptyDescription={t('invoices.emptyDescription')}
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
