import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { usePurchaseOrdersQuery } from '@/api/hooks/purchasing'
import { useAuth } from '@/auth/useAuth'
import { hasAnyPermission } from '@/auth/permissions'
import {
  FilterBar,
  LinkButton,
  ListStateBoundary,
  PageHeader,
  Pagination,
  Select,
  StatusBadge,
  Table,
  TextInput,
  type TableColumn,
} from '@/components'
import { SectionNav } from '@/components/SectionNav/SectionNav'
import { formatDate, formatMoney } from '@/lib/format'
import { useSearchParamPage, useSearchParamState } from '@/hooks/useSearchParamState'
import type { PurchaseOrder } from '@/api/types'

const PAGE_SIZE = 20
const STATUSES = [
  'DRAFT',
  'PENDING_APPROVAL',
  'APPROVED',
  'REJECTED',
  'PARTIALLY_RECEIVED',
  'RECEIVED',
  'CANCELLED',
] as const

const STATUS_TONES = {
  DRAFT: 'neutral',
  PENDING_APPROVAL: 'warning',
  APPROVED: 'info',
  REJECTED: 'danger',
  PARTIALLY_RECEIVED: 'warning',
  RECEIVED: 'success',
  CANCELLED: 'neutral',
} as const

export function PurchaseOrderListPage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const canCreate = hasAnyPermission(user, ['purchasing.create'])

  const [status, setStatus] = useSearchParamState('status')
  const [vendorId, setVendorId] = useSearchParamState('vendorId')
  const [sort, setSort] = useSearchParamState('sort', '-createdAt')
  const [page, setPage] = useSearchParamPage()

  const ordersQuery = usePurchaseOrdersQuery({
    page,
    pageSize: PAGE_SIZE,
    sort,
    status: status || undefined,
    vendorId: vendorId || undefined,
  })

  const columns: ReadonlyArray<TableColumn<PurchaseOrder>> = [
    {
      key: 'poNumber',
      header: t('purchasing.orders.columns.poNumber'),
      render: (row) => <Link to={`/purchasing/orders/${row.id}`}>{row.poNumber}</Link>,
      dirStable: true,
    },
    {
      key: 'status',
      header: t('common.status'),
      render: (row) => (
        <StatusBadge tone={STATUS_TONES[row.status]}>{t(`purchasing.orders.statusOptions.${row.status}`)}</StatusBadge>
      ),
    },
    {
      key: 'total',
      header: t('purchasing.orders.columns.total'),
      render: (row) => <span className="dir-ltr">{formatMoney(row.total)}</span>,
    },
    {
      key: 'expectedDeliveryDate',
      header: t('purchasing.orders.columns.expectedDelivery'),
      render: (row) => (row.expectedDeliveryDate ? formatDate(row.expectedDeliveryDate) : '—'),
    },
    { key: 'createdAt', header: t('common.createdAt'), render: (row) => formatDate(row.createdAt) },
  ]

  return (
    <div>
      <PageHeader
        title={t('purchasing.orders.title')}
        actions={
          canCreate ? (
            <LinkButton to="/purchasing/orders/new">{t('purchasing.orders.createAction')}</LinkButton>
          ) : undefined
        }
      />
      <SectionNav
        items={[
          { to: '/purchasing/vendors', label: t('purchasing.vendors.title') },
          { to: '/purchasing/orders', label: t('purchasing.orders.title') },
          { to: '/purchasing/approval-policy', label: t('purchasing.policy.title') },
        ]}
      />

      <FilterBar>
        <Select aria-label={t('common.status')} value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="">{t('common.allStatuses')}</option>
          {STATUSES.map((option) => (
            <option key={option} value={option}>
              {t(`purchasing.orders.statusOptions.${option}`)}
            </option>
          ))}
        </Select>
        <TextInput
          aria-label={t('purchasing.orders.vendorFilter')}
          placeholder={t('purchasing.orders.vendorFilter')}
          value={vendorId}
          onChange={(event) => setVendorId(event.target.value)}
          className="dir-ltr"
        />
        <Select aria-label={t('common.sortBy')} value={sort} onChange={(event) => setSort(event.target.value)}>
          <option value="-createdAt">{t('common.createdAt')} ↓</option>
          <option value="poNumber">{t('purchasing.orders.columns.poNumber')} ↑</option>
          <option value="-total">{t('purchasing.orders.columns.total')} ↓</option>
        </Select>
      </FilterBar>

      <ListStateBoundary
        isLoading={ordersQuery.isLoading}
        isError={ordersQuery.isError}
        error={ordersQuery.error}
        onRetry={() => void ordersQuery.refetch()}
        isEmpty={(ordersQuery.data?.items.length ?? 0) === 0}
        emptyTitle={t('purchasing.orders.empty.title')}
        emptyDescription={t('purchasing.orders.empty.description')}
      >
        <Table columns={columns} rows={ordersQuery.data?.items ?? []} getRowKey={(row) => row.id} />
        {ordersQuery.data ? (
          <Pagination
            page={ordersQuery.data.page.page}
            pageSize={ordersQuery.data.page.pageSize}
            totalItems={ordersQuery.data.page.totalItems}
            totalPages={ordersQuery.data.page.totalPages}
            onPageChange={setPage}
          />
        ) : null}
      </ListStateBoundary>
    </div>
  )
}
