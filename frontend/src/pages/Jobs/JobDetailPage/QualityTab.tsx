import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { useCreateQualityCheckMutation, useQualityChecksQuery } from '@/api/hooks/jobApprovals'
import { ApiError } from '@/api/errors'
import { useAuth } from '@/auth/useAuth'
import { hasAnyPermission } from '@/auth/permissions'
import {
  Alert,
  Button,
  Card,
  FormField,
  ListStateBoundary,
  Modal,
  Select,
  StatusBadge,
  Table,
  TextInput,
  useToast,
  type TableColumn,
} from '@/components'
import { formatDateTime } from '@/lib/format'
import type { JobCard, QualityCheck } from '@/api/types'

const schema = z
  .object({
    result: z.enum(['PASSED', 'FAILED']),
    notes: z.string().max(2000).optional(),
  })
  .refine((data) => data.result !== 'FAILED' || Boolean(data.notes && data.notes.length > 0), {
    message: 'notesRequired',
    path: ['notes'],
  })
type FormValues = z.infer<typeof schema>

export function QualityTab({ job }: { job: JobCard }) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const { showToast } = useToast()
  const canRecord = hasAnyPermission(user, ['quality.perform']) && job.stage === 'QUALITY_CHECK'

  const checksQuery = useQualityChecksQuery(job.id, {})
  const createMutation = useCreateQualityCheckMutation(job.id)

  const [open, setOpen] = useState(false)
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { result: 'PASSED', notes: '' } })

  async function onSubmit(values: FormValues) {
    try {
      await createMutation.mutateAsync(values)
      showToast(t('jobs.quality.createSuccess'), 'success')
      reset({ result: 'PASSED', notes: '' })
      setOpen(false)
    } catch {
      // surfaced below
    }
  }

  const columns: ReadonlyArray<TableColumn<QualityCheck>> = [
    {
      key: 'result',
      header: t('common.status'),
      render: (row) => (
        <StatusBadge tone={row.result === 'PASSED' ? 'success' : 'danger'}>
          {t(`jobs.quality.resultOptions.${row.result}`)}
        </StatusBadge>
      ),
    },
    { key: 'notes', header: t('jobs.quality.notesLabel'), render: (row) => row.notes ?? '—' },
    {
      key: 'performedAt',
      header: t('jobs.quality.performedAtLabel'),
      render: (row) => formatDateTime(row.performedAt),
    },
  ]

  return (
    <Card title={t('jobs.tabs.quality')}>
      {canRecord ? (
        <Button type="button" onClick={() => setOpen(true)} style={{ marginBottom: '1rem' }}>
          {t('jobs.quality.createAction')}
        </Button>
      ) : null}

      <ListStateBoundary
        isLoading={checksQuery.isLoading}
        isError={checksQuery.isError}
        error={checksQuery.error}
        onRetry={() => void checksQuery.refetch()}
        isEmpty={(checksQuery.data?.items.length ?? 0) === 0}
        emptyTitle={t('jobs.quality.empty.title')}
        emptyDescription={t('jobs.quality.empty.description')}
      >
        <Table columns={columns} rows={checksQuery.data?.items ?? []} getRowKey={(row) => row.id} />
      </ListStateBoundary>

      <Modal open={open} onClose={() => setOpen(false)} title={t('jobs.quality.createAction')}>
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          {createMutation.isError ? (
            <Alert variant="danger">
              {createMutation.error instanceof ApiError ? createMutation.error.message : t('errors.unknownError')}
            </Alert>
          ) : null}
          <FormField id="quality-result" label={t('common.status')} required>
            <Select {...register('result')}>
              <option value="PASSED">{t('jobs.quality.resultOptions.PASSED')}</option>
              <option value="FAILED">{t('jobs.quality.resultOptions.FAILED')}</option>
            </Select>
          </FormField>
          <FormField
            id="quality-notes"
            label={t('jobs.quality.notesLabel')}
            error={errors.notes ? t('jobs.quality.notesRequiredOnFail') : undefined}
          >
            <TextInput {...register('notes')} />
          </FormField>
          <Button type="submit" isLoading={isSubmitting}>
            {t('jobs.quality.createAction')}
          </Button>
        </form>
      </Modal>
    </Card>
  )
}
