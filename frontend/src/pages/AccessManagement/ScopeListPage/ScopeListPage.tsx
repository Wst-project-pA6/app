import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useOrganizationScopesQuery } from '@/api/hooks/organizationScopes'
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
import type { OrganizationScope } from '@/api/types'
import { CreateScopeDialog } from './CreateScopeDialog'
import { EditScopeDialog } from './EditScopeDialog'

const PAGE_SIZE = 20

export function ScopeListPage() {
  const { t } = useTranslation()
  const { user } = useAuth()

  const [type, setType] = useSearchParamState('type')
  const [sort, setSort] = useSearchParamState('sort', 'name')
  const [page, setPage] = useSearchParamPage()

  const [createOpen, setCreateOpen] = useState(false)
  const [editing, setEditing] = useState<OrganizationScope | null>(null)

  const scopesQuery = useOrganizationScopesQuery({
    page,
    pageSize: PAGE_SIZE,
    sort,
    type: type ? (type as 'BRANCH' | 'STORE' | 'TRAINING_PROGRAM') : undefined,
  })

  const canManage = hasAnyPermission(user, ['scopes.manage'])

  const columns: ReadonlyArray<TableColumn<OrganizationScope>> = [
    { key: 'code', header: t('access.scopes.columns.code'), render: (row) => row.code, dirStable: true },
    { key: 'name', header: t('access.scopes.columns.name'), render: (row) => row.name },
    {
      key: 'type',
      header: t('access.scopes.columns.type'),
      render: (row) => t(`access.scopes.typeOptions.${row.type}`),
    },
    {
      key: 'status',
      header: t('access.scopes.columns.status'),
      render: (row) => (
        <StatusBadge tone={row.status === 'ACTIVE' ? 'success' : 'neutral'}>
          {t(`access.scopes.statusOptions.${row.status}`)}
        </StatusBadge>
      ),
    },
    { key: 'createdAt', header: t('access.scopes.columns.createdAt'), render: (row) => formatDate(row.createdAt) },
    ...(canManage
      ? [
          {
            key: 'actions',
            header: t('common.actions'),
            render: (row: OrganizationScope) => (
              <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(row)}>
                {t('common.edit')}
              </Button>
            ),
          } satisfies TableColumn<OrganizationScope>,
        ]
      : []),
  ]

  return (
    <div>
      <PageHeader
        title={t('access.scopes.title')}
        actions={
          canManage ? (
            <Button type="button" onClick={() => setCreateOpen(true)}>
              {t('access.scopes.createAction')}
            </Button>
          ) : undefined
        }
      />

      <FilterBar>
        <Select
          aria-label={t('access.scopes.typeFilter')}
          value={type}
          onChange={(event) => setType(event.target.value)}
        >
          <option value="">{t('common.allTypes')}</option>
          <option value="BRANCH">{t('access.scopes.typeOptions.BRANCH')}</option>
          <option value="STORE">{t('access.scopes.typeOptions.STORE')}</option>
          <option value="TRAINING_PROGRAM">{t('access.scopes.typeOptions.TRAINING_PROGRAM')}</option>
        </Select>

        <Select aria-label={t('common.sortBy')} value={sort} onChange={(event) => setSort(event.target.value)}>
          <option value="name">{t('access.scopes.columns.name')} ↑</option>
          <option value="-name">{t('access.scopes.columns.name')} ↓</option>
          <option value="code">{t('access.scopes.columns.code')} ↑</option>
          <option value="-code">{t('access.scopes.columns.code')} ↓</option>
          <option value="-createdAt">{t('access.scopes.columns.createdAt')} ↓</option>
          <option value="createdAt">{t('access.scopes.columns.createdAt')} ↑</option>
        </Select>
      </FilterBar>

      <ListStateBoundary
        isLoading={scopesQuery.isLoading}
        isError={scopesQuery.isError}
        error={scopesQuery.error}
        onRetry={() => void scopesQuery.refetch()}
        isEmpty={(scopesQuery.data?.items.length ?? 0) === 0}
        emptyTitle={t('access.scopes.empty.title')}
        emptyDescription={t('access.scopes.empty.description')}
      >
        <Table columns={columns} rows={scopesQuery.data?.items ?? []} getRowKey={(row) => row.id} />
        {scopesQuery.data ? (
          <Pagination
            page={scopesQuery.data.page.page}
            pageSize={scopesQuery.data.page.pageSize}
            totalItems={scopesQuery.data.page.totalItems}
            totalPages={scopesQuery.data.page.totalPages}
            onPageChange={setPage}
          />
        ) : null}
      </ListStateBoundary>

      {canManage ? (
        <>
          <CreateScopeDialog
            open={createOpen}
            onClose={() => setCreateOpen(false)}
            existingScopes={scopesQuery.data?.items ?? []}
          />
          <EditScopeDialog scope={editing} onClose={() => setEditing(null)} />
        </>
      ) : null}
    </div>
  )
}
