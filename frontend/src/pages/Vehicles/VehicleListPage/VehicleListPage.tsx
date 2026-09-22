import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { useVehiclesQuery } from '@/api/hooks/vehicles'
import { useAuth } from '@/auth/useAuth'
import { hasAnyPermission } from '@/auth/permissions'
import {
  FilterBar,
  LinkButton,
  ListStateBoundary,
  PageHeader,
  Pagination,
  SearchInput,
  Select,
  StatusBadge,
  Table,
  TextInput,
  type TableColumn,
} from '@/components'
import { formatDate, formatNumber } from '@/lib/format'
import { useSearchParamPage, useSearchParamState } from '@/hooks/useSearchParamState'
import type { Vehicle } from '@/api/types'

const PAGE_SIZE = 20

export function VehicleListPage() {
  const { t } = useTranslation()
  const { user } = useAuth()

  const [q, setQ] = useSearchParamState('q')
  const [customerId, setCustomerId] = useSearchParamState('customerId')
  const [plate, setPlate] = useSearchParamState('plate')
  const [vin, setVin] = useSearchParamState('vin')
  const [make, setMake] = useSearchParamState('make')
  const [model, setModel] = useSearchParamState('model')
  const [status, setStatus] = useSearchParamState('status')
  const [sort, setSort] = useSearchParamState('sort', 'plate')
  const [page, setPage] = useSearchParamPage()

  const vehiclesQuery = useVehiclesQuery({
    page,
    pageSize: PAGE_SIZE,
    sort,
    q: q || undefined,
    customerId: customerId || undefined,
    plate: plate || undefined,
    vin: vin || undefined,
    make: make || undefined,
    model: model || undefined,
    status: status ? (status as 'ACTIVE' | 'ARCHIVED') : undefined,
  })

  const canCreate = hasAnyPermission(user, ['vehicles.write'])

  const columns: ReadonlyArray<TableColumn<Vehicle>> = [
    {
      key: 'plate',
      header: t('vehicles.columns.plate'),
      render: (row) => <Link to={`/vehicles/${row.id}`}>{row.plate}</Link>,
      dirStable: true,
    },
    { key: 'vin', header: t('vehicles.columns.vin'), render: (row) => row.vin, dirStable: true },
    { key: 'make', header: t('vehicles.columns.make'), render: (row) => row.make },
    { key: 'model', header: t('vehicles.columns.model'), render: (row) => row.model },
    { key: 'year', header: t('vehicles.columns.year'), render: (row) => row.year, dirStable: true },
    {
      key: 'mileage',
      header: t('vehicles.columns.mileage'),
      render: (row) => (
        <span className="dir-ltr">
          {formatNumber(row.mileage)} {t(`vehicles.mileageUnitOptions.${row.mileageUnit}`)}
        </span>
      ),
    },
    {
      key: 'status',
      header: t('vehicles.columns.status'),
      render: (row) => (
        <StatusBadge tone={row.status === 'ACTIVE' ? 'success' : 'neutral'}>
          {t(`vehicles.statusOptions.${row.status}`)}
        </StatusBadge>
      ),
    },
    { key: 'createdAt', header: t('vehicles.columns.createdAt'), render: (row) => formatDate(row.createdAt) },
  ]

  return (
    <div>
      <PageHeader
        title={t('vehicles.title')}
        actions={canCreate ? <LinkButton to="/vehicles/new">{t('vehicles.createAction')}</LinkButton> : undefined}
      />

      <FilterBar>
        <SearchInput value={q} onChange={setQ} placeholder={t('vehicles.searchPlaceholder')} />
        <TextInput
          aria-label={t('vehicles.plateFilter')}
          placeholder={t('vehicles.plateFilter')}
          value={plate}
          onChange={(event) => setPlate(event.target.value)}
          dirStable
        />
        <TextInput
          aria-label={t('vehicles.vinFilter')}
          placeholder={t('vehicles.vinFilter')}
          value={vin}
          onChange={(event) => setVin(event.target.value)}
          dirStable
        />
        <TextInput
          aria-label={t('vehicles.makeFilter')}
          placeholder={t('vehicles.makeFilter')}
          value={make}
          onChange={(event) => setMake(event.target.value)}
        />
        <TextInput
          aria-label={t('vehicles.modelFilter')}
          placeholder={t('vehicles.modelFilter')}
          value={model}
          onChange={(event) => setModel(event.target.value)}
        />
        <TextInput
          aria-label={t('vehicles.customerFilter')}
          placeholder={t('vehicles.customerFilter')}
          value={customerId}
          onChange={(event) => setCustomerId(event.target.value)}
          className="dir-ltr"
        />

        <Select
          aria-label={t('vehicles.statusFilter')}
          value={status}
          onChange={(event) => setStatus(event.target.value)}
        >
          <option value="">{t('common.allStatuses')}</option>
          <option value="ACTIVE">{t('vehicles.statusOptions.ACTIVE')}</option>
          <option value="ARCHIVED">{t('vehicles.statusOptions.ARCHIVED')}</option>
        </Select>

        <Select aria-label={t('common.sortBy')} value={sort} onChange={(event) => setSort(event.target.value)}>
          <option value="plate">{t('vehicles.columns.plate')} ↑</option>
          <option value="-plate">{t('vehicles.columns.plate')} ↓</option>
          <option value="make">{t('vehicles.columns.make')} ↑</option>
          <option value="-make">{t('vehicles.columns.make')} ↓</option>
          <option value="-createdAt">{t('vehicles.columns.createdAt')} ↓</option>
          <option value="createdAt">{t('vehicles.columns.createdAt')} ↑</option>
        </Select>
      </FilterBar>

      <ListStateBoundary
        isLoading={vehiclesQuery.isLoading}
        isError={vehiclesQuery.isError}
        error={vehiclesQuery.error}
        onRetry={() => void vehiclesQuery.refetch()}
        isEmpty={(vehiclesQuery.data?.items.length ?? 0) === 0}
        emptyTitle={t('vehicles.empty.title')}
        emptyDescription={t('vehicles.empty.description')}
      >
        <Table columns={columns} rows={vehiclesQuery.data?.items ?? []} getRowKey={(row) => row.id} />
        {vehiclesQuery.data ? (
          <Pagination
            page={vehiclesQuery.data.page.page}
            pageSize={vehiclesQuery.data.page.pageSize}
            totalItems={vehiclesQuery.data.page.totalItems}
            totalPages={vehiclesQuery.data.page.totalPages}
            onPageChange={setPage}
          />
        ) : null}
      </ListStateBoundary>
    </div>
  )
}
