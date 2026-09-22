import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { useJobCardsQuery } from '@/api/hooks/jobs'
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
import { formatDateTime } from '@/lib/format'
import { useSearchParamPage, useSearchParamState } from '@/hooks/useSearchParamState'
import type { JobCard } from '@/api/types'

const PAGE_SIZE = 20

const STAGE_TONES = {
  RECEIVED: 'neutral',
  IN_PROGRESS: 'info',
  QUALITY_CHECK: 'warning',
  READY: 'success',
  DELIVERED: 'success',
} as const

export function JobListPage() {
  const { t } = useTranslation()
  const { user } = useAuth()

  const [q, setQ] = useSearchParamState('q')
  const [stage, setStage] = useSearchParamState('stage')
  const [priority, setPriority] = useSearchParamState('priority')
  const [technicianId, setTechnicianId] = useSearchParamState('technicianId')
  const [bayId, setBayId] = useSearchParamState('bayId')
  const [sort, setSort] = useSearchParamState('sort', '-createdAt')
  const [page, setPage] = useSearchParamPage()

  const jobsQuery = useJobCardsQuery({
    page,
    pageSize: PAGE_SIZE,
    sort,
    q: q || undefined,
    stage: stage || undefined,
    priority: priority || undefined,
    technicianId: technicianId || undefined,
    bayId: bayId || undefined,
  })

  const canCreate = hasAnyPermission(user, ['jobs.create'])

  const columns: ReadonlyArray<TableColumn<JobCard>> = [
    {
      key: 'jobNumber',
      header: t('jobs.columns.jobNumber'),
      render: (row) => <Link to={`/jobs/${row.id}`}>{row.jobNumber}</Link>,
      dirStable: true,
    },
    {
      key: 'vehiclePlate',
      header: t('jobs.columns.vehicle'),
      render: (row) => row.vehiclePlate ?? '—',
      dirStable: true,
    },
    {
      key: 'customer',
      header: t('jobs.columns.customer'),
      render: (row) => row.customerDisplayName ?? '—',
    },
    {
      key: 'stage',
      header: t('jobs.columns.stage'),
      render: (row) => <StatusBadge tone={STAGE_TONES[row.stage]}>{t(`jobs.stages.${row.stage}`)}</StatusBadge>,
    },
    {
      key: 'priority',
      header: t('jobs.columns.priority'),
      render: (row) => t(`jobs.priorityOptions.${row.priority}`),
    },
    {
      key: 'expectedCompletionAt',
      header: t('jobs.columns.expectedCompletionAt'),
      render: (row) => formatDateTime(row.expectedCompletionAt),
    },
  ]

  return (
    <div>
      <PageHeader
        title={t('jobs.title')}
        actions={canCreate ? <LinkButton to="/jobs/new">{t('jobs.createAction')}</LinkButton> : undefined}
      />

      <FilterBar>
        <SearchInput value={q} onChange={setQ} placeholder={t('jobs.searchPlaceholder')} />

        <Select aria-label={t('jobs.columns.stage')} value={stage} onChange={(event) => setStage(event.target.value)}>
          <option value="">{t('common.allStatuses')}</option>
          {(['RECEIVED', 'IN_PROGRESS', 'QUALITY_CHECK', 'READY', 'DELIVERED'] as const).map((s) => (
            <option key={s} value={s}>
              {t(`jobs.stages.${s}`)}
            </option>
          ))}
        </Select>

        <Select
          aria-label={t('jobs.columns.priority')}
          value={priority}
          onChange={(event) => setPriority(event.target.value)}
        >
          <option value="">{t('jobs.allPriorities')}</option>
          {(['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const).map((p) => (
            <option key={p} value={p}>
              {t(`jobs.priorityOptions.${p}`)}
            </option>
          ))}
        </Select>

        <TextInput
          aria-label={t('jobs.technicianFilter')}
          placeholder={t('jobs.technicianFilter')}
          value={technicianId}
          onChange={(event) => setTechnicianId(event.target.value)}
          className="dir-ltr"
        />

        <TextInput
          aria-label={t('jobs.bayFilter')}
          placeholder={t('jobs.bayFilter')}
          value={bayId}
          onChange={(event) => setBayId(event.target.value)}
          className="dir-ltr"
        />

        <Select aria-label={t('common.sortBy')} value={sort} onChange={(event) => setSort(event.target.value)}>
          <option value="-createdAt">{t('common.createdAt')} ↓</option>
          <option value="createdAt">{t('common.createdAt')} ↑</option>
          <option value="jobNumber">{t('jobs.columns.jobNumber')} ↑</option>
          <option value="-jobNumber">{t('jobs.columns.jobNumber')} ↓</option>
          <option value="expectedCompletionAt">{t('jobs.columns.expectedCompletionAt')} ↑</option>
          <option value="-priority">{t('jobs.columns.priority')} ↓</option>
        </Select>
      </FilterBar>

      <ListStateBoundary
        isLoading={jobsQuery.isLoading}
        isError={jobsQuery.isError}
        error={jobsQuery.error}
        onRetry={() => void jobsQuery.refetch()}
        isEmpty={(jobsQuery.data?.items.length ?? 0) === 0}
        emptyTitle={t('jobs.empty.title')}
        emptyDescription={t('jobs.empty.description')}
      >
        <Table columns={columns} rows={jobsQuery.data?.items ?? []} getRowKey={(row) => row.id} />
        {jobsQuery.data ? (
          <Pagination
            page={jobsQuery.data.page.page}
            pageSize={jobsQuery.data.page.pageSize}
            totalItems={jobsQuery.data.page.totalItems}
            totalPages={jobsQuery.data.page.totalPages}
            onPageChange={setPage}
          />
        ) : null}
      </ListStateBoundary>
    </div>
  )
}
