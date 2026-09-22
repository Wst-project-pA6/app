import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useDashboardQuery } from '@/api/hooks/dashboards'
import { ApiError } from '@/api/errors'
import { useAuth } from '@/auth/useAuth'
import { hasAnyPermission } from '@/auth/permissions'
import { Alert, Card, PageHeader, TextInput } from '@/components'
import { formatDateTime, formatDecimalString } from '@/lib/format'
import type { Metric } from '@/api/types'
import styles from '../Stage5.module.css'

type DashboardKey = 'workshop' | 'inventory-finance' | 'training' | 'ai-data'
const DASHBOARDS: ReadonlyArray<{
  key: DashboardKey
  permission: 'dashboards.workshop' | 'dashboards.inventory-finance' | 'dashboards.training' | 'dashboards.ai-data'
  labelKey: 'reports.workshop' | 'reports.inventoryFinance' | 'reports.training' | 'reports.aiData'
}> = [
  { key: 'workshop', permission: 'dashboards.workshop', labelKey: 'reports.workshop' },
  { key: 'inventory-finance', permission: 'dashboards.inventory-finance', labelKey: 'reports.inventoryFinance' },
  { key: 'training', permission: 'dashboards.training', labelKey: 'reports.training' },
  { key: 'ai-data', permission: 'dashboards.ai-data', labelKey: 'reports.aiData' },
]

export function ReportsPage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const navigate = useNavigate()
  const { dashboard } = useParams<{ dashboard?: string }>()
  const available = DASHBOARDS.filter((item) => hasAnyPermission(user, [item.permission]))
  const selected = (available.some((item) => item.key === dashboard) ? dashboard : available[0]?.key) as
    DashboardKey | undefined
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const params = useMemo(() => ({ from: toTimestamp(from), to: toTimestamp(to) }), [from, to])
  const query = useDashboardQuery(selected ?? 'workshop', params, Boolean(selected))

  if (!selected) {
    return (
      <div className={styles.page}>
        <PageHeader title={t('reports.title')} />
        <Alert variant="info">{t('reports.noDashboardAccess')}</Alert>
        <Link to="/reports/exports">{t('reports.exportsLink')}</Link>
      </div>
    )
  }

  const data = query.data
  return (
    <div className={styles.page}>
      <PageHeader
        title={t('reports.title')}
        description={t('reports.description')}
        actions={<Link to="/reports/exports">{t('reports.exportsLink')}</Link>}
      />
      <nav className={styles.tabs} aria-label={t('reports.dashboardTabs')}>
        {available.map((item) => (
          <button
            key={item.key}
            type="button"
            className={[styles.tab, selected === item.key ? styles.tabActive : ''].join(' ')}
            onClick={() => navigate(`/reports/${item.key}`)}
          >
            {t(item.labelKey)}
          </button>
        ))}
      </nav>
      <Card title={t('reports.filtersTitle')}>
        <div className={styles.formGrid}>
          <label>
            {t('reports.from')}
            <TextInput type="datetime-local" value={from} onChange={(event) => setFrom(event.target.value)} />
          </label>
          <label>
            {t('reports.to')}
            <TextInput type="datetime-local" value={to} onChange={(event) => setTo(event.target.value)} />
          </label>
        </div>
      </Card>
      {query.isError ? <AvailabilityError error={query.error} onRetry={() => void query.refetch()} /> : null}
      {query.isLoading ? (
        <div role="status" aria-busy="true">
          {t('common.loading')}
        </div>
      ) : null}
      {data ? <DashboardData data={data} /> : null}
    </div>
  )
}

function DashboardData({ data }: { data: NonNullable<ReturnType<typeof useDashboardQuery>['data']> }) {
  const { t } = useTranslation()
  return (
    <>
      <div className={styles.meta}>
        {t('reports.generatedAt', { date: formatDateTime(data.generatedAt) })} ·{' '}
        {t('reports.dataAsOf', { date: formatDateTime(data.dataAsOf) })}
      </div>
      <div className={styles.grid}>
        {data.metrics.map((metric) => (
          <MetricCard key={metric.key} metric={metric} />
        ))}
      </div>
      <Card title={t('reports.reconciliationTitle')}>
        <dl className={styles.detailGrid}>
          <div>
            <dt>{t('reports.filterFingerprint')}</dt>
            <dd className="dir-ltr">{data.filterFingerprint}</dd>
          </div>
          <div>
            <dt>{t('reports.metricCount')}</dt>
            <dd>{data.metrics.length}</dd>
          </div>
        </dl>
      </Card>
    </>
  )
}

function MetricCard({ metric }: { metric: Metric }) {
  const value =
    metric.unit === 'MONEY'
      ? formatDecimalString(metric.value, metric.currencyCode)
      : metric.unit === 'PERCENT'
        ? `${metric.value}%`
        : metric.value
  const { t } = useTranslation()
  return (
    <Card className={styles.metric}>
      <div className={styles.metricLabel}>{metric.label}</div>
      <div className={[styles.metricValue, 'dir-ltr'].join(' ')}>{value}</div>
      <div className={styles.meta}>{t('reports.sourceRecords', { count: metric.recordCount })}</div>
      {metric.breakdown?.length ? (
        <ul>
          {metric.breakdown.map((item) => (
            <li key={item.key}>
              <span>{item.label}: </span>
              <span className="dir-ltr">{item.value}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  )
}

function AvailabilityError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const { t } = useTranslation()
  const unavailable =
    error instanceof ApiError && (error.status === 404 || error.status === 501 || error.code === 'NETWORK_ERROR')
  return (
    <Alert
      variant={unavailable ? 'warning' : 'danger'}
      title={unavailable ? t('reports.unavailableTitle') : t('errors.requestFailed')}
    >
      <p>
        {unavailable
          ? t('reports.unavailableMessage')
          : error instanceof ApiError
            ? error.message
            : t('errors.unknownError')}
      </p>
      <button type="button" onClick={onRetry}>
        {t('common.retry')}
      </button>
    </Alert>
  )
}

function toTimestamp(value: string): string | undefined {
  if (!value) return undefined
  const timestamp = new Date(value)
  return Number.isNaN(timestamp.getTime()) ? undefined : timestamp.toISOString()
}
