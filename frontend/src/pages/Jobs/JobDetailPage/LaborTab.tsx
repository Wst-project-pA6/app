import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { useCreateLaborEntryMutation, useLaborEntriesQuery, useVoidLaborEntryMutation } from '@/api/hooks/jobLabor'
import { ApiError } from '@/api/errors'
import { useAuth } from '@/auth/useAuth'
import { hasAnyPermission } from '@/auth/permissions'
import {
  Alert,
  Button,
  Card,
  ConfirmDialog,
  FormField,
  ListStateBoundary,
  Modal,
  StatusBadge,
  Table,
  TextInput,
  useToast,
  type TableColumn,
} from '@/components'
import { formatDate, formatMoney } from '@/lib/format'
import type { JobCard, LaborEntry } from '@/api/types'

const createSchema = z.object({
  workDate: z.string().min(1),
  durationMinutes: z.number().int().min(1).max(1440),
  description: z.string().max(500).optional(),
})
type CreateFormValues = z.infer<typeof createSchema>

export function LaborTab({ job }: { job: JobCard }) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const { showToast } = useToast()
  const canWrite =
    hasAnyPermission(user, ['labor.write']) && (job.stage === 'IN_PROGRESS' || job.stage === 'QUALITY_CHECK')
  const canCreate = hasAnyPermission(user, ['labor.write']) && job.stage === 'IN_PROGRESS'

  const entriesQuery = useLaborEntriesQuery(job.id, {})
  const createMutation = useCreateLaborEntryMutation(job.id)
  const voidMutation = useVoidLaborEntryMutation(job.id)

  const [createOpen, setCreateOpen] = useState(false)
  const [voiding, setVoiding] = useState<LaborEntry | null>(null)
  const [voidReason, setVoidReason] = useState('')

  const { register, handleSubmit, reset, formState } = useForm<CreateFormValues>({
    resolver: zodResolver(createSchema),
    defaultValues: { workDate: new Date().toISOString().slice(0, 10), durationMinutes: 60, description: '' },
  })

  async function onCreate(values: CreateFormValues) {
    try {
      await createMutation.mutateAsync(values)
      showToast(t('jobs.labor.createSuccess'), 'success')
      reset()
      setCreateOpen(false)
    } catch {
      // surfaced below
    }
  }

  async function confirmVoid() {
    if (!voiding) return
    try {
      await voidMutation.mutateAsync({ laborEntryId: voiding.id, payload: { reason: voidReason } })
      showToast(t('jobs.labor.voidSuccess'), 'success')
    } catch {
      // surfaced via list state
    } finally {
      setVoiding(null)
      setVoidReason('')
    }
  }

  const columns: ReadonlyArray<TableColumn<LaborEntry>> = [
    { key: 'workDate', header: t('jobs.labor.columns.workDate'), render: (row) => formatDate(row.workDate) },
    {
      key: 'durationMinutes',
      header: t('jobs.labor.columns.duration'),
      render: (row) => <span className="dir-ltr">{row.durationMinutes}</span>,
    },
    { key: 'description', header: t('jobs.labor.columns.description'), render: (row) => row.description ?? '—' },
    {
      key: 'amount',
      header: t('jobs.labor.columns.amount'),
      render: (row) => <span className="dir-ltr">{formatMoney(row.amount)}</span>,
    },
    {
      key: 'status',
      header: t('common.status'),
      render: (row) => (
        <StatusBadge tone={row.status === 'ACTIVE' ? 'success' : 'neutral'}>
          {t(`jobs.labor.statusOptions.${row.status}`)}
        </StatusBadge>
      ),
    },
    {
      key: 'actions',
      header: t('common.actions'),
      render: (row) =>
        row.status === 'ACTIVE' && canWrite ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => setVoiding(row)}>
            {t('jobs.labor.voidAction')}
          </Button>
        ) : null,
    },
  ]

  return (
    <Card title={t('jobs.tabs.labor')}>
      {canCreate ? (
        <Button type="button" onClick={() => setCreateOpen(true)} style={{ marginBottom: '1rem' }}>
          {t('jobs.labor.createAction')}
        </Button>
      ) : null}

      <ListStateBoundary
        isLoading={entriesQuery.isLoading}
        isError={entriesQuery.isError}
        error={entriesQuery.error}
        onRetry={() => void entriesQuery.refetch()}
        isEmpty={(entriesQuery.data?.items.length ?? 0) === 0}
        emptyTitle={t('jobs.labor.empty.title')}
        emptyDescription={t('jobs.labor.empty.description')}
      >
        <Table columns={columns} rows={entriesQuery.data?.items ?? []} getRowKey={(row) => row.id} />
      </ListStateBoundary>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title={t('jobs.labor.createAction')}>
        <form onSubmit={handleSubmit(onCreate)} noValidate>
          {createMutation.isError ? (
            <Alert variant="danger">
              {createMutation.error instanceof ApiError ? createMutation.error.message : t('errors.unknownError')}
            </Alert>
          ) : null}
          <FormField id="labor-work-date" label={t('jobs.labor.columns.workDate')} required>
            <TextInput type="date" dirStable {...register('workDate')} />
          </FormField>
          <FormField id="labor-duration" label={t('jobs.labor.durationLabel')} required>
            <TextInput type="number" dirStable {...register('durationMinutes', { valueAsNumber: true })} />
          </FormField>
          <FormField id="labor-description" label={t('jobs.labor.columns.description')} hint={t('common.optional')}>
            <TextInput {...register('description')} />
          </FormField>
          <Button type="submit" isLoading={formState.isSubmitting}>
            {t('jobs.labor.createAction')}
          </Button>
        </form>
      </Modal>

      <ConfirmDialog
        open={voiding !== null}
        title={t('jobs.labor.voidConfirmTitle')}
        description={
          <FormField id="labor-void-reason" label={t('jobs.labor.reasonLabel')} required>
            <TextInput value={voidReason} onChange={(event) => setVoidReason(event.target.value)} />
          </FormField>
        }
        tone="danger"
        isLoading={voidMutation.isPending}
        onConfirm={() => void confirmVoid()}
        onCancel={() => setVoiding(null)}
      />
    </Card>
  )
}
