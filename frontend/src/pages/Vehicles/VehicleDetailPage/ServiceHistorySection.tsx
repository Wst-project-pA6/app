import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { useVehicleServiceHistoryQuery } from '@/api/hooks/vehicles'
import { FilterBar, ListStateBoundary, Pagination, Select, Table, type TableColumn } from '@/components'
import { formatDate, formatNumber } from '@/lib/format'
import { useSearchParamPage, useSearchParamState } from '@/hooks/useSearchParamState'
import type { ServiceHistoryItem } from '@/api/types'

const PAGE_SIZE = 10

export function ServiceHistorySection({ vehicleId }: { vehicleId: string }) {
  const { t } = useTranslation()
  const [sort, setSort] = useSearchParamState('historySort', '-deliveredAt')
  const [page, setPage] = useSearchParamPage()

  const historyQuery = useVehicleServiceHistoryQuery(vehicleId, { page, pageSize: PAGE_SIZE, sort })

  const columns: ReadonlyArray<TableColumn<ServiceHistoryItem>> = [
    {
      key: 'jobNumber',
      header: t('vehicles.serviceHistory.columns.jobNumber'),
      render: (row) => <Link to={`/jobs/${row.jobId}`}>{row.jobNumber}</Link>,
      dirStable: true,
    },
    {
      key: 'serviceType',
      header: t('vehicles.serviceHistory.columns.serviceType'),
      render: (row) => row.serviceType,
    },
    { key: 'complaint', header: t('vehicles.serviceHistory.columns.complaint'), render: (row) => row.complaint },
    {
      key: 'mileageAtIntake',
      header: t('vehicles.serviceHistory.columns.mileageAtIntake'),
      render: (row) => <span className="dir-ltr">{formatNumber(row.mileageAtIntake)}</span>,
    },
    {
      key: 'deliveredAt',
      header: t('vehicles.serviceHistory.columns.deliveredAt'),
      render: (row) => formatDate(row.deliveredAt),
    },
  ]

  return (
    <div>
      <FilterBar>
        <Select aria-label={t('common.sortBy')} value={sort} onChange={(event) => setSort(event.target.value)}>
          <option value="-deliveredAt">{t('vehicles.serviceHistory.columns.deliveredAt')} ↓</option>
          <option value="deliveredAt">{t('vehicles.serviceHistory.columns.deliveredAt')} ↑</option>
        </Select>
      </FilterBar>

      <ListStateBoundary
        isLoading={historyQuery.isLoading}
        isError={historyQuery.isError}
        error={historyQuery.error}
        onRetry={() => void historyQuery.refetch()}
        isEmpty={(historyQuery.data?.items.length ?? 0) === 0}
        emptyTitle={t('vehicles.serviceHistory.empty.title')}
        emptyDescription={t('vehicles.serviceHistory.empty.description')}
      >
        <Table columns={columns} rows={historyQuery.data?.items ?? []} getRowKey={(row) => row.jobId} />
        {historyQuery.data ? (
          <Pagination
            page={historyQuery.data.page.page}
            pageSize={historyQuery.data.page.pageSize}
            totalItems={historyQuery.data.page.totalItems}
            totalPages={historyQuery.data.page.totalPages}
            onPageChange={setPage}
          />
        ) : null}
      </ListStateBoundary>
    </div>
  )
}
