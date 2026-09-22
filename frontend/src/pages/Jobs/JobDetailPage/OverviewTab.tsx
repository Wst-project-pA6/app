import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { useTransitionJobCardMutation, useUpdateJobCardMutation } from '@/api/hooks/jobs'
import { ApiError } from '@/api/errors'
import { useAuth } from '@/auth/useAuth'
import { hasAnyPermission } from '@/auth/permissions'
import { Alert, Button, Card, ConfirmDialog, FormField, Select, TextInput, useToast } from '@/components'
import { formatDateTime, formatNumber } from '@/lib/format'
import type { JobCard, JobStage, Permission } from '@/api/types'
import styles from './JobDetailPage.module.css'

const schema = z.object({
  complaint: z.string().min(3).max(2000),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']),
  serviceType: z.enum(['MAINTENANCE', 'REPAIR', 'DIAGNOSTIC', 'INSPECTION', 'OTHER']),
  expectedCompletionAt: z.string().min(1),
})

type FormValues = z.infer<typeof schema>

const NEXT_TRANSITION: Partial<Record<JobStage, { toStage: JobStage; permission: Permission }>> = {
  RECEIVED: { toStage: 'IN_PROGRESS', permission: 'jobs.transition.start' },
  IN_PROGRESS: { toStage: 'QUALITY_CHECK', permission: 'jobs.transition.submit-qc' },
  QUALITY_CHECK: { toStage: 'READY', permission: 'jobs.transition.ready' },
  READY: { toStage: 'DELIVERED', permission: 'jobs.transition.deliver' },
}

export function OverviewTab({ job }: { job: JobCard }) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const { showToast } = useToast()
  const canUpdate = hasAnyPermission(user, ['jobs.update']) && job.stage !== 'DELIVERED'
  const updateMutation = useUpdateJobCardMutation(job.id)
  const transitionMutation = useTransitionJobCardMutation(job.id)

  const [reworkOpen, setReworkOpen] = useState(false)
  const [reworkReason, setReworkReason] = useState('')

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  useEffect(() => {
    reset({
      complaint: job.complaint,
      priority: job.priority,
      serviceType: job.serviceType,
      expectedCompletionAt: job.expectedCompletionAt.slice(0, 16),
    })
  }, [job, reset])

  async function onSubmit(values: FormValues) {
    try {
      await updateMutation.mutateAsync({
        version: job.version,
        complaint: values.complaint,
        priority: values.priority,
        serviceType: values.serviceType,
        expectedCompletionAt: new Date(values.expectedCompletionAt).toISOString(),
      })
      showToast(t('jobs.detail.saveSuccess'), 'success')
    } catch {
      // surfaced below
    }
  }

  const next = NEXT_TRANSITION[job.stage]
  const canAdvance = next && hasAnyPermission(user, [next.permission])
  const canRework = job.stage === 'QUALITY_CHECK' && hasAnyPermission(user, ['quality.perform'])

  async function advance() {
    if (!next) return
    try {
      await transitionMutation.mutateAsync({ toStage: next.toStage, expectedFromStage: job.stage })
      showToast(t('jobs.detail.transitionSuccess', { stage: t(`jobs.stages.${next.toStage}`) }), 'success')
    } catch {
      // surfaced below
    }
  }

  async function confirmRework() {
    try {
      await transitionMutation.mutateAsync({
        toStage: 'IN_PROGRESS',
        expectedFromStage: 'QUALITY_CHECK',
        reason: reworkReason,
      })
      showToast(t('jobs.detail.transitionSuccess', { stage: t('jobs.stages.IN_PROGRESS') }), 'success')
    } catch {
      // surfaced below
    } finally {
      setReworkOpen(false)
      setReworkReason('')
    }
  }

  return (
    <div className={styles.grid}>
      <Card title={t('jobs.tabs.overview')}>
        <dl className={styles.readonlyList}>
          <div>
            <dt>{t('jobs.columns.jobNumber')}</dt>
            <dd className="dir-ltr">{job.jobNumber}</dd>
          </div>
          <div>
            <dt>{t('jobs.create.mileageLabel')}</dt>
            <dd className="dir-ltr">{formatNumber(job.mileageAtIntake)}</dd>
          </div>
          <div>
            <dt>{t('common.createdAt')}</dt>
            <dd>{formatDateTime(job.createdAt)}</dd>
          </div>
          {job.scheduledStartAt ? (
            <div>
              <dt>{t('jobs.assignment.scheduledStartLabel')}</dt>
              <dd>{formatDateTime(job.scheduledStartAt)}</dd>
            </div>
          ) : null}
          {job.deliveredAt ? (
            <div>
              <dt>{t('jobs.stages.DELIVERED')}</dt>
              <dd>{formatDateTime(job.deliveredAt)}</dd>
            </div>
          ) : null}
        </dl>

        {updateMutation.isError ? <JobErrorAlert error={updateMutation.error} /> : null}

        <form onSubmit={handleSubmit(onSubmit)} noValidate className={styles.form}>
          <FormField
            id="overview-complaint"
            label={t('jobs.create.complaintLabel')}
            error={errors.complaint ? t('validation.required') : undefined}
            required
          >
            <TextInput disabled={!canUpdate} {...register('complaint')} />
          </FormField>

          <FormField id="overview-service-type" label={t('jobs.create.serviceTypeLabel')} required>
            <Select disabled={!canUpdate} {...register('serviceType')}>
              {(['MAINTENANCE', 'REPAIR', 'DIAGNOSTIC', 'INSPECTION', 'OTHER'] as const).map((option) => (
                <option key={option} value={option}>
                  {t(`jobs.serviceTypeOptions.${option}`)}
                </option>
              ))}
            </Select>
          </FormField>

          <FormField id="overview-priority" label={t('jobs.create.priorityLabel')} required>
            <Select disabled={!canUpdate} {...register('priority')}>
              {(['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const).map((option) => (
                <option key={option} value={option}>
                  {t(`jobs.priorityOptions.${option}`)}
                </option>
              ))}
            </Select>
          </FormField>

          <FormField
            id="overview-expected-completion"
            label={t('jobs.create.expectedCompletionLabel')}
            error={errors.expectedCompletionAt ? t('validation.required') : undefined}
            required
          >
            <TextInput type="datetime-local" dirStable disabled={!canUpdate} {...register('expectedCompletionAt')} />
          </FormField>

          {canUpdate ? (
            <Button type="submit" isLoading={isSubmitting}>
              {isSubmitting ? t('jobs.detail.saving') : t('jobs.detail.saveAction')}
            </Button>
          ) : null}
        </form>
      </Card>

      <Card title={t('jobs.detail.transitionsTitle')}>
        {transitionMutation.isError ? <JobErrorAlert error={transitionMutation.error} /> : null}
        <p className={styles.readonlyList}>{t('jobs.detail.currentStage', { stage: t(`jobs.stages.${job.stage}`) })}</p>

        <div className={styles.actionsRow}>
          {canAdvance ? (
            <Button type="button" onClick={() => void advance()} isLoading={transitionMutation.isPending}>
              {t('jobs.detail.advanceTo', { stage: t(`jobs.stages.${next.toStage}`) })}
            </Button>
          ) : null}
          {canRework ? (
            <Button type="button" variant="secondary" onClick={() => setReworkOpen(true)}>
              {t('jobs.detail.sendToRework')}
            </Button>
          ) : null}
          {!canAdvance && !canRework ? <p>{t('jobs.detail.noActionsAvailable')}</p> : null}
        </div>
      </Card>

      <ConfirmDialog
        open={reworkOpen}
        title={t('jobs.detail.reworkConfirmTitle')}
        description={
          <div className={styles.form}>
            <p>{t('jobs.detail.reworkConfirmDescription')}</p>
            <FormField id="rework-reason" label={t('jobs.detail.reworkReasonLabel')} required>
              <TextInput value={reworkReason} onChange={(event) => setReworkReason(event.target.value)} />
            </FormField>
          </div>
        }
        confirmLabel={t('jobs.detail.sendToRework')}
        isLoading={transitionMutation.isPending}
        onConfirm={() => void confirmRework()}
        onCancel={() => setReworkOpen(false)}
      />
    </div>
  )
}

function JobErrorAlert({ error }: { error: unknown }) {
  const { t } = useTranslation()
  const message = error instanceof ApiError ? error.message : t('errors.unknownError')
  const requestId = error instanceof ApiError ? error.requestId : undefined
  return (
    <Alert variant="danger">
      {message}
      {requestId ? <div className="dir-ltr">{t('common.requestId', { id: requestId })}</div> : null}
    </Alert>
  )
}
