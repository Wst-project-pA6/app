import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { useBaysQuery } from '@/api/hooks/bays'
import { useAssignJobCardMutation, useTechniciansQuery } from '@/api/hooks/jobs'
import { ApiError } from '@/api/errors'
import { Alert, Button, Card, FormField, Select, TextInput, useToast } from '@/components'
import type { JobCard } from '@/api/types'
import styles from './JobDetailPage.module.css'

const schema = z.object({
  bayId: z.string().min(1),
  technicianId: z.string().min(1),
  scheduledStartAt: z.string().min(1),
  expectedCompletionAt: z.string().min(1),
})

type FormValues = z.infer<typeof schema>

export function AssignmentTab({ job }: { job: JobCard }) {
  const { t } = useTranslation()
  const { showToast } = useToast()
  const mutation = useAssignJobCardMutation(job.id)
  const baysQuery = useBaysQuery({ pageSize: 100, status: 'ACTIVE' })
  const techniciansQuery = useTechniciansQuery({ pageSize: 100 })

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  useEffect(() => {
    reset({
      bayId: job.bayId ?? '',
      technicianId: job.technicianId ?? '',
      scheduledStartAt: job.scheduledStartAt ? job.scheduledStartAt.slice(0, 16) : '',
      expectedCompletionAt: job.expectedCompletionAt.slice(0, 16),
    })
  }, [job, reset])

  const disabled = job.stage === 'DELIVERED'

  async function onSubmit(values: FormValues) {
    try {
      await mutation.mutateAsync({
        version: job.version,
        bayId: values.bayId,
        technicianId: values.technicianId,
        scheduledStartAt: new Date(values.scheduledStartAt).toISOString(),
        expectedCompletionAt: new Date(values.expectedCompletionAt).toISOString(),
      })
      showToast(t('jobs.assignment.success'), 'success')
    } catch {
      // surfaced below
    }
  }

  return (
    <Card title={t('jobs.tabs.assignment')}>
      {mutation.isError ? <AssignmentErrorAlert error={mutation.error} /> : null}

      <form onSubmit={handleSubmit(onSubmit)} noValidate className={styles.form}>
        <FormField
          id="assignment-bay"
          label={t('jobs.assignment.bayLabel')}
          error={errors.bayId ? t('validation.required') : undefined}
          required
        >
          <Select disabled={disabled} {...register('bayId')}>
            <option value="">{t('common.unassigned')}</option>
            {baysQuery.data?.items.map((bay) => (
              <option key={bay.id} value={bay.id}>
                {bay.code} — {bay.name}
              </option>
            ))}
          </Select>
        </FormField>

        <FormField
          id="assignment-technician"
          label={t('jobs.assignment.technicianLabel')}
          error={errors.technicianId ? t('validation.required') : undefined}
          required
        >
          <Select disabled={disabled} {...register('technicianId')}>
            <option value="">{t('common.unassigned')}</option>
            {techniciansQuery.data?.items.map((technician) => (
              <option key={technician.id} value={technician.id}>
                {technician.displayName}
              </option>
            ))}
          </Select>
        </FormField>

        <FormField
          id="assignment-scheduled-start"
          label={t('jobs.assignment.scheduledStartLabel')}
          error={errors.scheduledStartAt ? t('validation.required') : undefined}
          required
        >
          <TextInput type="datetime-local" dirStable disabled={disabled} {...register('scheduledStartAt')} />
        </FormField>

        <FormField
          id="assignment-expected-completion"
          label={t('jobs.create.expectedCompletionLabel')}
          error={errors.expectedCompletionAt ? t('validation.required') : undefined}
          required
        >
          <TextInput type="datetime-local" dirStable disabled={disabled} {...register('expectedCompletionAt')} />
        </FormField>

        {!disabled ? (
          <Button type="submit" isLoading={isSubmitting}>
            {isSubmitting ? t('jobs.assignment.saving') : t('jobs.assignment.submit')}
          </Button>
        ) : null}
      </form>
    </Card>
  )
}

function AssignmentErrorAlert({ error }: { error: unknown }) {
  const { t } = useTranslation()

  if (error instanceof ApiError && error.code === 'SCHEDULE_CONFLICT') {
    return (
      <Alert variant="danger" title={t('jobs.assignment.conflictTitle')}>
        {error.message}
      </Alert>
    )
  }

  const message = error instanceof ApiError ? error.message : t('errors.unknownError')
  const requestId = error instanceof ApiError ? error.requestId : undefined
  return (
    <Alert variant="danger">
      {message}
      {requestId ? <div className="dir-ltr">{t('common.requestId', { id: requestId })}</div> : null}
    </Alert>
  )
}
