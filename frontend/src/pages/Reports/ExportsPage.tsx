import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import {
  useAuthorizeExportDownloadMutation,
  useCreateExportJobMutation,
  useExportJobQuery,
  useExportJobsQuery,
} from '@/api/hooks/exports'
import { ApiError } from '@/api/errors'
import { useAuth } from '@/auth/useAuth'
import { hasAnyPermission } from '@/auth/permissions'
import {
  Alert,
  Button,
  Card,
  ListStateBoundary,
  PageHeader,
  Select,
  Table,
  TextInput,
  useToast,
  type TableColumn,
} from '@/components'
import { formatDateTime, formatDecimalString } from '@/lib/format'
import type { ExportJob, ExportType } from '@/api/types'
import styles from '../Stage5.module.css'

const EXPORT_TYPES: ExportType[] = [
  'JOBS',
  'LABOR_ENTRIES',
  'PART_ISSUES',
  'STOCK_BALANCES',
  'STOCK_MOVEMENTS',
  'PURCHASE_ORDERS',
  'INVOICES',
  'CUSTOMER_STATEMENT',
  'ATTENDANCE',
  'ASSESSMENTS',
  'CERTIFICATES',
  'REORDER_SUGGESTIONS',
  'TRAINING_RISK',
  'DASHBOARD_WORKSHOP',
  'DASHBOARD_INVENTORY_FINANCE',
  'DASHBOARD_TRAINING',
  'DASHBOARD_AI_DATA',
  'AUDIT_EVENTS',
]

export function ExportsPage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const { showToast } = useToast()
  const canCreate = hasAnyPermission(user, ['exports.create'])
  const [exportType, setExportType] = useState<ExportType>('INVOICES')
  const [format, setFormat] = useState<'CSV' | 'PDF'>('CSV')
  const [customerId, setCustomerId] = useState('')
  const [selectedId, setSelectedId] = useState<string>()
  const jobsQuery = useExportJobsQuery({ page: 1, pageSize: 20, sort: '-createdAt' })
  const selectedQuery = useExportJobQuery(selectedId)
  const createMutation = useCreateExportJobMutation()
  const authorizeMutation = useAuthorizeExportDownloadMutation()

  async function create() {
    try {
      const job = await createMutation.mutateAsync({ exportType, format, ...(customerId ? { customerId } : {}) })
      setSelectedId(job.id)
      showToast(t('reports.exportCreated'), 'success')
    } catch {
      // The mutation error is rendered below with the backend message.
    }
  }

  async function download(job: ExportJob) {
    try {
      const authorization = await authorizeMutation.mutateAsync(job.id)
      window.open(authorization.url, '_blank', 'noopener,noreferrer')
    } catch {
      // The mutation error is rendered below.
    }
  }

  const columns: ReadonlyArray<TableColumn<ExportJob>> = [
    {
      key: 'exportType',
      header: t('reports.exportType'),
      render: (row) => <span className="dir-ltr">{row.exportType}</span>,
    },
    { key: 'format', header: t('reports.format'), render: (row) => row.format },
    { key: 'status', header: t('common.status'), render: (row) => row.status },
    { key: 'createdAt', header: t('common.createdAt'), render: (row) => formatDateTime(row.createdAt) },
    {
      key: 'actions',
      header: t('common.actions'),
      render: (row) => (
        <div className={styles.actions}>
          <Button type="button" size="sm" variant="ghost" onClick={() => setSelectedId(row.id)}>
            {t('common.view')}
          </Button>
          {row.status === 'COMPLETED' ? (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => void download(row)}
              isLoading={authorizeMutation.isPending}
            >
              {t('reports.download')}
            </Button>
          ) : null}
        </div>
      ),
    },
  ]

  return (
    <div className={styles.page}>
      <PageHeader title={t('reports.exportsTitle')} actions={<Link to="/reports">{t('reports.dashboardLink')}</Link>} />
      {canCreate ? (
        <Card title={t('reports.createExportTitle')}>
          <div className={styles.formGrid}>
            <label>
              {t('reports.exportType')}
              <Select value={exportType} onChange={(event) => setExportType(event.target.value as ExportType)}>
                {EXPORT_TYPES.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </Select>
            </label>
            <label>
              {t('reports.format')}
              <Select value={format} onChange={(event) => setFormat(event.target.value as 'CSV' | 'PDF')}>
                <option value="CSV">CSV</option>
                <option value="PDF">PDF</option>
              </Select>
            </label>
            {exportType === 'CUSTOMER_STATEMENT' ? (
              <label>
                {t('reports.customerId')}
                <TextInput
                  value={customerId}
                  onChange={(event) => setCustomerId(event.target.value)}
                  className="dir-ltr"
                  required
                />
              </label>
            ) : null}
          </div>
          <div className={styles.actions}>
            <Button type="button" onClick={() => void create()} isLoading={createMutation.isPending}>
              {t('reports.startExport')}
            </Button>
          </div>
        </Card>
      ) : null}
      {createMutation.isError ? <ExportError error={createMutation.error} /> : null}
      {authorizeMutation.isError ? <ExportError error={authorizeMutation.error} /> : null}
      {selectedQuery.data ? (
        <ExportStatusCard job={selectedQuery.data} onDownload={() => void download(selectedQuery.data)} />
      ) : null}
      {selectedQuery.isError ? <ExportError error={selectedQuery.error} /> : null}
      <ListStateBoundary
        isLoading={jobsQuery.isLoading}
        isError={jobsQuery.isError}
        error={jobsQuery.error}
        onRetry={() => void jobsQuery.refetch()}
        isEmpty={(jobsQuery.data?.items.length ?? 0) === 0}
        emptyTitle={t('reports.noExports')}
        emptyDescription={t('reports.noExportsDescription')}
      >
        <Table columns={columns} rows={jobsQuery.data?.items ?? []} getRowKey={(row) => row.id} />
      </ListStateBoundary>
    </div>
  )
}

function ExportStatusCard({ job, onDownload }: { job: ExportJob; onDownload: () => void }) {
  const { t } = useTranslation()
  return (
    <Card title={t('reports.selectedExport')}>
      <dl className={styles.detailGrid}>
        <div>
          <dt>{t('reports.exportType')}</dt>
          <dd className="dir-ltr">{job.exportType}</dd>
        </div>
        <div>
          <dt>{t('common.status')}</dt>
          <dd>{job.status}</dd>
        </div>
        <div>
          <dt>{t('reports.filterFingerprint')}</dt>
          <dd className="dir-ltr">{job.filterFingerprint}</dd>
        </div>
        <div>
          <dt>{t('reports.rowCount')}</dt>
          <dd>{job.rowCount ?? '—'}</dd>
        </div>
      </dl>
      {job.failureMessage ? <p className={styles.error}>{job.failureMessage}</p> : null}
      {job.status === 'COMPLETED' ? (
        <Button type="button" onClick={onDownload}>
          {t('reports.download')}
        </Button>
      ) : null}
      <p className={styles.meta}>
        {job.expiresAt
          ? t('reports.expiresAt', { date: formatDateTime(job.expiresAt) })
          : t('reports.waitingForCompletion')}
      </p>
      {job.totals?.length ? (
        <ul>
          {job.totals.map((metric) => (
            <li key={metric.key}>
              {metric.label}:{' '}
              <span className="dir-ltr">
                {metric.unit === 'MONEY' ? formatDecimalString(metric.value, metric.currencyCode) : metric.value}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  )
}

function ExportError({ error }: { error: unknown }) {
  const { t } = useTranslation()
  const unavailable =
    error instanceof ApiError && (error.status === 404 || error.status === 501 || error.code === 'NETWORK_ERROR')
  return (
    <Alert
      variant={unavailable ? 'warning' : 'danger'}
      title={unavailable ? t('reports.unavailableTitle') : t('errors.requestFailed')}
    >
      {unavailable
        ? t('reports.unavailableMessage')
        : error instanceof ApiError
          ? error.message
          : t('errors.unknownError')}
    </Alert>
  )
}
