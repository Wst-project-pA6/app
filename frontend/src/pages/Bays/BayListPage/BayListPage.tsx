import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { useBaysQuery } from '@/api/hooks/bays'
import { useAuth } from '@/auth/useAuth'
import { hasAnyPermission } from '@/auth/permissions'
import {
  Button,
  FilterBar,
  ListStateBoundary,
  PageHeader,
  Pagination,
  Select,
  StatusBadge,
  Table,
  type TableColumn,
} from '@/components'
import { formatDate } from '@/lib/format'
import { useSearchParamPage, useSearchParamState } from '@/hooks/useSearchParamState'
import type { Bay } from '@/api/types'
import { CreateBayDialog } from './CreateBayDialog'
import { EditBayDialog } from './EditBayDialog'

const PAGE_SIZE = 20

export function BayListPage() {
  const { t } = useTranslation()
  const { user } = useAuth()

  const [status, setStatus] = useSearchParamState('status')
  const [sort, setSort] = useSearchParamState('sort', 'code')
  const [page, setPage] = useSearchParamPage()

  const [createOpen, setCreateOpen] = useState(false)
  const [editing, setEditing] = useState<Bay | null>(null)

  const baysQuery = useBaysQuery({
    page,
    pageSize: PAGE_SIZE,
    sort,
    status: status ? (status as 'ACTIVE' | 'MAINTENANCE' | 'INACTIVE') : undefined,
  })

  const canManage = hasAnyPermission(user, ['bays.manage'])

  const statusTone = { ACTIVE: 'success', MAINTENANCE: 'warning', INACTIVE: 'neutral' } as const

  const columns: ReadonlyArray<TableColumn<Bay>> = [
    { key: 'code', header: t('bays.columns.code'), render: (row) => row.code, dirStable: true },
    {
      key: 'name',
      header: t('bays.columns.name'),
      render: (row) => <Link to={`/bays/${row.id}/calendar`}>{row.name}</Link>,
    },
    { key: 'capacity', header: t('bays.columns.capacity'), render: (row) => row.capacity, dirStable: true },
    {
      key: 'status',
      header: t('bays.columns.status'),
      render: (row) => <StatusBadge tone={statusTone[row.status]}>{t(`bays.statusOptions.${row.status}`)}</StatusBadge>,
    },
    { key: 'createdAt', header: t('bays.columns.createdAt'), render: (row) => formatDate(row.createdAt) },
    {
      key: 'actions',
      header: t('common.actions'),
      render: (row) => (
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <Link to={`/bays/${row.id}/calendar`}>{t('bays.viewCalendar')}</Link>
          {canManage ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(row)}>
              {t('common.edit')}
            </Button>
          ) : null}
        </div>
      ),
    },
  ]

  return (
    <div>
      <PageHeader
        title={t('bays.title')}
        actions={
          canManage ? (
            <Button type="button" onClick={() => setCreateOpen(true)}>
              {t('bays.createAction')}
            </Button>
          ) : undefined
        }
      />

      <FilterBar>
        <Select aria-label={t('bays.statusFilter')} value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="">{t('common.allStatuses')}</option>
          <option value="ACTIVE">{t('bays.statusOptions.ACTIVE')}</option>
          <option value="MAINTENANCE">{t('bays.statusOptions.MAINTENANCE')}</option>
          <option value="INACTIVE">{t('bays.statusOptions.INACTIVE')}</option>
        </Select>

        <Select aria-label={t('common.sortBy')} value={sort} onChange={(event) => setSort(event.target.value)}>
          <option value="code">{t('bays.columns.code')} ↑</option>
          <option value="-code">{t('bays.columns.code')} ↓</option>
          <option value="name">{t('bays.columns.name')} ↑</option>
          <option value="-name">{t('bays.columns.name')} ↓</option>
        </Select>
      </FilterBar>

      <ListStateBoundary
        isLoading={baysQuery.isLoading}
        isError={baysQuery.isError}
        error={baysQuery.error}
        onRetry={() => void baysQuery.refetch()}
        isEmpty={(baysQuery.data?.items.length ?? 0) === 0}
        emptyTitle={t('bays.empty.title')}
        emptyDescription={t('bays.empty.description')}
      >
        <Table columns={columns} rows={baysQuery.data?.items ?? []} getRowKey={(row) => row.id} />
        {baysQuery.data ? (
          <Pagination
            page={baysQuery.data.page.page}
            pageSize={baysQuery.data.page.pageSize}
            totalItems={baysQuery.data.page.totalItems}
            totalPages={baysQuery.data.page.totalPages}
            onPageChange={setPage}
          />
        ) : null}
      </ListStateBoundary>

      {canManage ? (
        <>
          <CreateBayDialog open={createOpen} onClose={() => setCreateOpen(false)} />
          <EditBayDialog bay={editing} onClose={() => setEditing(null)} />
        </>
      ) : null}
    </div>
  )
}
