import { useTranslation } from 'react-i18next'
import { useStockMovementsQuery } from '@/api/hooks/inventory'
import { useAuth } from '@/auth/useAuth'
import { hasAnyPermission } from '@/auth/permissions'
import {
  FilterBar,
  ListStateBoundary,
  PageHeader,
  Pagination,
  Select,
  Table,
  TextInput,
  type TableColumn,
} from '@/components'
import { formatDateTime, formatMoney } from '@/lib/format'
import { useSearchParamPage, useSearchParamState } from '@/hooks/useSearchParamState'
import type { StockMovement } from '@/api/types'
import { InventorySectionNav } from '../InventorySectionNav'

const PAGE_SIZE = 30
const MOVEMENT_TYPES = [
  'RECEIPT',
  'ISSUE',
  'ISSUE_REVERSAL',
  'RESERVATION',
  'RESERVATION_RELEASE',
  'ADJUSTMENT',
] as const

export function StockMovementsPage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const canReadCost = hasAnyPermission(user, ['inventory.cost.read'])

  const [storeId, setStoreId] = useSearchParamState('storeId')
  const [partId, setPartId] = useSearchParamState('partId')
  const [type, setType] = useSearchParamState('type')
  const [sort, setSort] = useSearchParamState('sort', '-occurredAt')
  const [page, setPage] = useSearchParamPage()

  const movementsQuery = useStockMovementsQuery({
    page,
    pageSize: PAGE_SIZE,
    sort,
    storeId: storeId || undefined,
    partId: partId || undefined,
    type: type || undefined,
  })

  const columns: ReadonlyArray<TableColumn<StockMovement>> = [
    {
      key: 'occurredAt',
      header: t('inventory.movements.columns.occurredAt'),
      render: (row) => formatDateTime(row.occurredAt),
    },
    {
      key: 'type',
      header: t('inventory.movements.columns.type'),
      render: (row) => t(`inventory.movements.typeOptions.${row.type}`),
    },
    { key: 'partId', header: t('jobs.parts.columns.partId'), render: (row) => row.partId, dirStable: true },
    {
      key: 'onHandDelta',
      header: t('inventory.movements.columns.onHandDelta'),
      render: (row) => <span className="dir-ltr">{row.onHandDelta}</span>,
    },
    {
      key: 'reservedDelta',
      header: t('inventory.movements.columns.reservedDelta'),
      render: (row) => <span className="dir-ltr">{row.reservedDelta}</span>,
    },
    ...(canReadCost
      ? [
          {
            key: 'unitCost',
            header: t('jobs.parts.columns.unitCost'),
            render: (row: StockMovement) => (
              <span className="dir-ltr">{row.unitCost ? formatMoney(row.unitCost) : '—'}</span>
            ),
          } satisfies TableColumn<StockMovement>,
        ]
      : []),
    { key: 'reason', header: t('inventory.movements.columns.reason'), render: (row) => row.reason ?? '—' },
  ]

  return (
    <div>
      <PageHeader title={t('inventory.movements.title')} />
      <InventorySectionNav />

      <FilterBar>
        <TextInput
          aria-label={t('jobs.parts.storeLabel')}
          placeholder={t('jobs.parts.storeLabel')}
          value={storeId}
          onChange={(event) => setStoreId(event.target.value)}
          className="dir-ltr"
        />
        <TextInput
          aria-label={t('jobs.parts.columns.partId')}
          placeholder={t('jobs.parts.columns.partId')}
          value={partId}
          onChange={(event) => setPartId(event.target.value)}
          className="dir-ltr"
        />
        <Select
          aria-label={t('inventory.movements.columns.type')}
          value={type}
          onChange={(event) => setType(event.target.value)}
        >
          <option value="">{t('common.allTypes')}</option>
          {MOVEMENT_TYPES.map((option) => (
            <option key={option} value={option}>
              {t(`inventory.movements.typeOptions.${option}`)}
            </option>
          ))}
        </Select>
        <Select aria-label={t('common.sortBy')} value={sort} onChange={(event) => setSort(event.target.value)}>
          <option value="-occurredAt">{t('inventory.movements.columns.occurredAt')} ↓</option>
          <option value="occurredAt">{t('inventory.movements.columns.occurredAt')} ↑</option>
        </Select>
      </FilterBar>

      <ListStateBoundary
        isLoading={movementsQuery.isLoading}
        isError={movementsQuery.isError}
        error={movementsQuery.error}
        onRetry={() => void movementsQuery.refetch()}
        isEmpty={(movementsQuery.data?.items.length ?? 0) === 0}
        emptyTitle={t('inventory.movements.empty.title')}
        emptyDescription={t('inventory.movements.empty.description')}
      >
        <Table columns={columns} rows={movementsQuery.data?.items ?? []} getRowKey={(row) => row.id} />
        {movementsQuery.data ? (
          <Pagination
            page={movementsQuery.data.page.page}
            pageSize={movementsQuery.data.page.pageSize}
            totalItems={movementsQuery.data.page.totalItems}
            totalPages={movementsQuery.data.page.totalPages}
            onPageChange={setPage}
          />
        ) : null}
      </ListStateBoundary>
    </div>
  )
}
