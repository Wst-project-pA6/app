import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router-dom'
import { useJobCardQuery } from '@/api/hooks/jobs'
import { useAuth } from '@/auth/useAuth'
import { hasAnyPermission } from '@/auth/permissions'
import { JobStageStepper, ListStateBoundary, PageHeader, StatusBadge, Tabs } from '@/components'
import { OverviewTab } from './OverviewTab'
import { AssignmentTab } from './AssignmentTab'
import { WorkItemsTab } from './WorkItemsTab'
import { ApprovalsTab } from './ApprovalsTab'
import { LaborTab } from './LaborTab'
import { QualityTab } from './QualityTab'
import { PartsTab } from './PartsTab'
import { AttachmentsTab } from './AttachmentsTab'
import { InvoicePreviewTab } from './InvoicePreviewTab'
import { HistoryTab } from './HistoryTab'
import styles from './JobDetailPage.module.css'

type TabKey =
  | 'overview'
  | 'assignment'
  | 'workItems'
  | 'approvals'
  | 'labor'
  | 'quality'
  | 'parts'
  | 'invoice'
  | 'attachments'
  | 'history'

export function JobDetailPage() {
  const { jobId } = useParams<{ jobId: string }>()
  const { t } = useTranslation()
  const { user } = useAuth()
  const [tab, setTab] = useState<TabKey>('overview')

  const jobQuery = useJobCardQuery(jobId)
  const job = jobQuery.data

  const tabs: Array<{ key: TabKey; label: string }> = [
    { key: 'overview', label: t('jobs.tabs.overview') },
    ...(hasAnyPermission(user, ['jobs.assign'])
      ? [{ key: 'assignment' as const, label: t('jobs.tabs.assignment') }]
      : []),
    { key: 'workItems', label: t('jobs.tabs.workItems') },
    ...(hasAnyPermission(user, ['approvals.read'])
      ? [{ key: 'approvals' as const, label: t('jobs.tabs.approvals') }]
      : []),
    ...(hasAnyPermission(user, ['labor.read']) ? [{ key: 'labor' as const, label: t('jobs.tabs.labor') }] : []),
    ...(hasAnyPermission(user, ['jobs.read', 'jobs.read.assigned', 'quality.perform'])
      ? [{ key: 'quality' as const, label: t('jobs.tabs.quality') }]
      : []),
    ...(hasAnyPermission(user, ['inventory.read', 'inventory.issue', 'inventory.reverse'])
      ? [{ key: 'parts' as const, label: t('jobs.tabs.parts') }]
      : []),
    ...(hasAnyPermission(user, ['invoices.read', 'jobs.read'])
      ? [{ key: 'invoice' as const, label: t('jobs.tabs.invoice') }]
      : []),
    { key: 'attachments', label: t('jobs.tabs.attachments') },
    { key: 'history', label: t('jobs.tabs.history') },
  ]

  return (
    <div>
      <PageHeader
        title={job ? job.jobNumber : t('jobs.detail.title')}
        description={
          job ? (
            <span className={styles.subtitle}>
              <span className="dir-ltr">{job.vehiclePlate}</span>
              {job.customerDisplayName ? ` — ${job.customerDisplayName}` : ''}
            </span>
          ) : undefined
        }
        actions={
          <div className={styles.headerActions}>
            {job ? (
              <StatusBadge tone={job.priority === 'URGENT' || job.priority === 'HIGH' ? 'danger' : 'neutral'}>
                {t(`jobs.priorityOptions.${job.priority}`)}
              </StatusBadge>
            ) : null}
            <Link to="/jobs">{t('jobs.detail.backToList')}</Link>
          </div>
        }
      />

      <ListStateBoundary
        isLoading={jobQuery.isLoading}
        isError={jobQuery.isError}
        error={jobQuery.error}
        onRetry={() => void jobQuery.refetch()}
        isEmpty={false}
        emptyTitle=""
      >
        {job ? (
          <>
            <JobStageStepper stage={job.stage} />

            <Tabs tabs={tabs} activeKey={tab} onChange={(key) => setTab(key as TabKey)} />

            <div role="tabpanel">
              {tab === 'overview' ? <OverviewTab job={job} /> : null}
              {tab === 'assignment' ? <AssignmentTab job={job} /> : null}
              {tab === 'workItems' ? <WorkItemsTab job={job} /> : null}
              {tab === 'approvals' ? <ApprovalsTab job={job} /> : null}
              {tab === 'labor' ? <LaborTab job={job} /> : null}
              {tab === 'quality' ? <QualityTab job={job} /> : null}
              {tab === 'parts' ? <PartsTab job={job} /> : null}
              {tab === 'invoice' ? <InvoicePreviewTab job={job} /> : null}
              {tab === 'attachments' ? <AttachmentsTab job={job} /> : null}
              {tab === 'history' ? <HistoryTab job={job} /> : null}
            </div>
          </>
        ) : null}
      </ListStateBoundary>
    </div>
  )
}
