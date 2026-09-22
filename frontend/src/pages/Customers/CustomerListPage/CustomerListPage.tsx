import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { useCustomersQuery } from '@/api/hooks/customers'
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
import { formatDate } from '@/lib/format'
import { useSearchParamPage, useSearchParamState } from '@/hooks/useSearchParamState'
import type { Customer } from '@/api/types'

const PAGE_SIZE = 20

export function CustomerListPage() {
  const { t } = useTranslation()
  const { user } = useAuth()

  const [q, setQ] = useSearchParamState('q')
  const [status, setStatus] = useSearchParamState('status')
  const [phone, setPhone] = useSearchParamState('phone')
  const [sort, setSort] = useSearchParamState('sort', 'displayName')
  const [page, setPage] = useSearchParamPage()

  const customersQuery = useCustomersQuery({
    page,
    pageSize: PAGE_SIZE,
    sort,
    q: q || undefined,
    status: status ? (status as 'ACTIVE' | 'ARCHIVED') : undefined,
    phone: phone || undefined,
  })

  const canCreate = hasAnyPermission(user, ['customers.write'])

  const columns: ReadonlyArray<TableColumn<Customer>> = [
    {
      key: 'displayName',
      header: t('customers.columns.displayName'),
      render: (row) => <Link to={`/customers/${row.id}`}>{row.displayName}</Link>,
    },
    { key: 'type', header: t('customers.columns.type'), render: (row) => t(`customers.typeOptions.${row.type}`) },
    { key: 'phone', header: t('customers.columns.phone'), render: (row) => row.phone, dirStable: true },
    { key: 'email', header: t('customers.columns.email'), render: (row) => row.email ?? '—', dirStable: true },
    {
      key: 'channel',
      header: t('customers.columns.channel'),
      render: (row) =>
        row.contactPreferences?.preferredChannel
          ? t(`customers.channelOptions.${row.contactPreferences.preferredChannel}`)
          : '—',
    },
    {
      key: 'status',
      header: t('customers.columns.status'),
      render: (row) => (
        <StatusBadge tone={row.status === 'ACTIVE' ? 'success' : 'neutral'}>
          {t(`customers.statusOptions.${row.status}`)}
        </StatusBadge>
      ),
    },
    { key: 'createdAt', header: t('customers.columns.createdAt'), render: (row) => formatDate(row.createdAt) },
  ]

  return (
    <div>
      <PageHeader
        title={t('customers.title')}
        actions={canCreate ? <LinkButton to="/customers/new">{t('customers.createAction')}</LinkButton> : undefined}
      />

      <FilterBar>
        <SearchInput value={q} onChange={setQ} placeholder={t('customers.searchPlaceholder')} />

        <Select
          aria-label={t('customers.statusFilter')}
          value={status}
          onChange={(event) => setStatus(event.target.value)}
        >
          <option value="">{t('common.allStatuses')}</option>
          <option value="ACTIVE">{t('customers.statusOptions.ACTIVE')}</option>
          <option value="ARCHIVED">{t('customers.statusOptions.ARCHIVED')}</option>
        </Select>

        <TextInput
          aria-label={t('customers.phoneFilter')}
          placeholder={t('customers.phoneFilterPlaceholder')}
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          dirStable
        />

        <Select aria-label={t('common.sortBy')} value={sort} onChange={(event) => setSort(event.target.value)}>
          <option value="displayName">{t('customers.columns.displayName')} ↑</option>
          <option value="-displayName">{t('customers.columns.displayName')} ↓</option>
          <option value="-createdAt">{t('customers.columns.createdAt')} ↓</option>
          <option value="createdAt">{t('customers.columns.createdAt')} ↑</option>
        </Select>
      </FilterBar>

      <ListStateBoundary
        isLoading={customersQuery.isLoading}
        isError={customersQuery.isError}
        error={customersQuery.error}
        onRetry={() => void customersQuery.refetch()}
        isEmpty={(customersQuery.data?.items.length ?? 0) === 0}
        emptyTitle={t('customers.empty.title')}
        emptyDescription={t('customers.empty.description')}
      >
        <Table columns={columns} rows={customersQuery.data?.items ?? []} getRowKey={(row) => row.id} />
        {customersQuery.data ? (
          <Pagination
            page={customersQuery.data.page.page}
            pageSize={customersQuery.data.page.pageSize}
            totalItems={customersQuery.data.page.totalItems}
            totalPages={customersQuery.data.page.totalPages}
            onPageChange={setPage}
          />
        ) : null}
      </ListStateBoundary>
    </div>
  )
}
