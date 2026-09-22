import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { useOrganizationScopesQuery } from '@/api/hooks/organizationScopes'
import { useRolesQuery } from '@/api/hooks/roles'
import { useUsersQuery } from '@/api/hooks/users'
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
  type TableColumn,
} from '@/components'
import { formatDate } from '@/lib/format'
import { useSearchParamPage, useSearchParamState } from '@/hooks/useSearchParamState'
import type { User } from '@/api/types'
import styles from './UserListPage.module.css'

const PAGE_SIZE = 20

export function UserListPage() {
  const { t } = useTranslation()
  const { user: currentUser } = useAuth()

  const [q, setQ] = useSearchParamState('q')
  const [role, setRole] = useSearchParamState('role')
  const [status, setStatus] = useSearchParamState('status')
  const [scopeId, setScopeId] = useSearchParamState('scopeId')
  const [sort, setSort] = useSearchParamState('sort', '-createdAt')
  const [page, setPage] = useSearchParamPage()

  const usersQuery = useUsersQuery({
    page,
    pageSize: PAGE_SIZE,
    sort,
    q: q || undefined,
    role: role || undefined,
    status: status ? (status as 'ACTIVE' | 'DISABLED') : undefined,
    organizationScopeId: scopeId || undefined,
  })

  const rolesQuery = useRolesQuery()
  const scopesQuery = useOrganizationScopesQuery({ pageSize: 100, sort: 'name' })

  const canCreate = hasAnyPermission(currentUser, ['users.manage'])

  const columns: ReadonlyArray<TableColumn<User>> = [
    {
      key: 'displayName',
      header: t('access.users.columns.displayName'),
      render: (row) => <Link to={`/access/users/${row.id}`}>{row.displayName}</Link>,
    },
    {
      key: 'email',
      header: t('access.users.columns.email'),
      render: (row) => row.email,
      dirStable: true,
    },
    {
      key: 'status',
      header: t('access.users.columns.status'),
      render: (row) => (
        <StatusBadge tone={row.status === 'ACTIVE' ? 'success' : 'neutral'}>
          {t(`access.users.statusOptions.${row.status}`)}
        </StatusBadge>
      ),
    },
    {
      key: 'roles',
      header: t('access.users.columns.roles'),
      render: (row) => (
        <div className={styles.badgeRow}>
          {row.roles.map((r) => (
            <StatusBadge key={r} tone="info">
              <span className="dir-ltr">{r}</span>
            </StatusBadge>
          ))}
        </div>
      ),
    },
    {
      key: 'locale',
      header: t('access.users.columns.locale'),
      render: (row) => row.preferredLocale,
    },
    {
      key: 'scopes',
      header: t('access.users.columns.scopes'),
      render: (row) => t('access.users.scopeCount', { count: row.organizationScopeIds.length }),
    },
    {
      key: 'createdAt',
      header: t('access.users.columns.createdAt'),
      render: (row) => formatDate(row.createdAt),
    },
  ]

  return (
    <div>
      <PageHeader
        title={t('access.users.title')}
        actions={
          canCreate ? <LinkButton to="/access/users/new">{t('access.users.createAction')}</LinkButton> : undefined
        }
      />

      <FilterBar>
        <SearchInput value={q} onChange={setQ} placeholder={t('access.users.searchPlaceholder')} />

        <Select
          aria-label={t('access.users.roleFilter')}
          value={role}
          onChange={(event) => setRole(event.target.value)}
        >
          <option value="">{t('access.users.allRoles')}</option>
          {rolesQuery.data?.items.map((r) => (
            <option key={r.code} value={r.code}>
              {r.code}
            </option>
          ))}
        </Select>

        <Select aria-label={t('common.status')} value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="">{t('common.allStatuses')}</option>
          <option value="ACTIVE">{t('access.users.statusOptions.ACTIVE')}</option>
          <option value="DISABLED">{t('access.users.statusOptions.DISABLED')}</option>
        </Select>

        <Select
          aria-label={t('access.users.scopeFilter')}
          value={scopeId}
          onChange={(event) => setScopeId(event.target.value)}
        >
          <option value="">{t('access.users.allScopes')}</option>
          {scopesQuery.data?.items.map((scope) => (
            <option key={scope.id} value={scope.id}>
              {scope.name}
            </option>
          ))}
        </Select>

        <Select aria-label={t('common.sortBy')} value={sort} onChange={(event) => setSort(event.target.value)}>
          <option value="-createdAt">{t('access.users.columns.createdAt')} ↓</option>
          <option value="createdAt">{t('access.users.columns.createdAt')} ↑</option>
          <option value="displayName">{t('access.users.columns.displayName')} ↑</option>
          <option value="-displayName">{t('access.users.columns.displayName')} ↓</option>
          <option value="email">{t('access.users.columns.email')} ↑</option>
          <option value="-email">{t('access.users.columns.email')} ↓</option>
        </Select>
      </FilterBar>

      <ListStateBoundary
        isLoading={usersQuery.isLoading}
        isError={usersQuery.isError}
        error={usersQuery.error}
        onRetry={() => void usersQuery.refetch()}
        isEmpty={(usersQuery.data?.items.length ?? 0) === 0}
        emptyTitle={t('access.users.empty.title')}
        emptyDescription={t('access.users.empty.description')}
      >
        <Table columns={columns} rows={usersQuery.data?.items ?? []} getRowKey={(row) => row.id} />
        {usersQuery.data ? (
          <Pagination
            page={usersQuery.data.page.page}
            pageSize={usersQuery.data.page.pageSize}
            totalItems={usersQuery.data.page.totalItems}
            totalPages={usersQuery.data.page.totalPages}
            onPageChange={setPage}
          />
        ) : null}
      </ListStateBoundary>
    </div>
  )
}
