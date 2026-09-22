import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { usePartsQuery } from '@/api/hooks/inventory'
import { useAuth } from '@/auth/useAuth'
import { hasAnyPermission } from '@/auth/permissions'
import {
  Button,
  FilterBar,
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
import { formatMoney } from '@/lib/format'
import { useSearchParamPage, useSearchParamState } from '@/hooks/useSearchParamState'
import type { Part } from '@/api/types'
import { CreatePartDialog } from './CreatePartDialog'
import { InventorySectionNav } from '../InventorySectionNav'

const PAGE_SIZE = 20

export function PartListPage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const canWrite = hasAnyPermission(user, ['parts.write'])

  const [q, setQ] = useSearchParamState('q')
  const [sku, setSku] = useSearchParamState('sku')
  const [category, setCategory] = useSearchParamState('category')
  const [status, setStatus] = useSearchParamState('status')
  const [sort, setSort] = useSearchParamState('sort', 'sku')
  const [page, setPage] = useSearchParamPage()
  const [createOpen, setCreateOpen] = useState(false)

  const partsQuery = usePartsQuery({
    page,
    pageSize: PAGE_SIZE,
    sort,
    q: q || undefined,
    sku: sku || undefined,
    category: category || undefined,
    status: status ? (status as 'ACTIVE' | 'ARCHIVED') : undefined,
  })

  const columns: ReadonlyArray<TableColumn<Part>> = [
    {
      key: 'sku',
      header: t('inventory.parts.columns.sku'),
      render: (row) => <Link to={`/inventory/parts/${row.id}`}>{row.sku}</Link>,
      dirStable: true,
    },
    { key: 'name', header: t('inventory.parts.columns.name'), render: (row) => row.name.en },
    { key: 'category', header: t('inventory.parts.columns.category'), render: (row) => row.category },
    {
      key: 'sellingPrice',
      header: t('inventory.parts.columns.sellingPrice'),
      render: (row) => <span className="dir-ltr">{formatMoney(row.sellingPrice)}</span>,
    },
    {
      key: 'status',
      header: t('common.status'),
      render: (row) => (
        <StatusBadge tone={row.status === 'ACTIVE' ? 'success' : 'neutral'}>
          {t(`vehicles.statusOptions.${row.status}`)}
        </StatusBadge>
      ),
    },
  ]

  return (
    <div>
      <PageHeader
        title={t('inventory.parts.title')}
        actions={
          canWrite ? (
            <Button type="button" onClick={() => setCreateOpen(true)}>
              {t('inventory.parts.createAction')}
            </Button>
          ) : undefined
        }
      />
      <InventorySectionNav />

      <FilterBar>
        <SearchInput value={q} onChange={setQ} placeholder={t('inventory.parts.searchPlaceholder')} />
        <TextInput
          aria-label={t('inventory.parts.columns.sku')}
          placeholder={t('inventory.parts.columns.sku')}
          value={sku}
          onChange={(event) => setSku(event.target.value)}
          className="dir-ltr"
        />
        <TextInput
          aria-label={t('inventory.parts.columns.category')}
          placeholder={t('inventory.parts.columns.category')}
          value={category}
          onChange={(event) => setCategory(event.target.value)}
        />
        <Select aria-label={t('common.status')} value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="">{t('common.allStatuses')}</option>
          <option value="ACTIVE">{t('vehicles.statusOptions.ACTIVE')}</option>
          <option value="ARCHIVED">{t('vehicles.statusOptions.ARCHIVED')}</option>
        </Select>
        <Select aria-label={t('common.sortBy')} value={sort} onChange={(event) => setSort(event.target.value)}>
          <option value="sku">{t('inventory.parts.columns.sku')} ↑</option>
          <option value="name">{t('inventory.parts.columns.name')} ↑</option>
          <option value="category">{t('inventory.parts.columns.category')} ↑</option>
          <option value="-createdAt">{t('common.createdAt')} ↓</option>
        </Select>
      </FilterBar>

      <ListStateBoundary
        isLoading={partsQuery.isLoading}
        isError={partsQuery.isError}
        error={partsQuery.error}
        onRetry={() => void partsQuery.refetch()}
        isEmpty={(partsQuery.data?.items.length ?? 0) === 0}
        emptyTitle={t('inventory.parts.empty.title')}
        emptyDescription={t('inventory.parts.empty.description')}
      >
        <Table columns={columns} rows={partsQuery.data?.items ?? []} getRowKey={(row) => row.id} />
        {partsQuery.data ? (
          <Pagination
            page={partsQuery.data.page.page}
            pageSize={partsQuery.data.page.pageSize}
            totalItems={partsQuery.data.page.totalItems}
            totalPages={partsQuery.data.page.totalPages}
            onPageChange={setPage}
          />
        ) : null}
      </ListStateBoundary>

      <CreatePartDialog open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  )
}
