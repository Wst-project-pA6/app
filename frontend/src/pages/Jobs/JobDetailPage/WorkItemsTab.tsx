import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { useCreateWorkItemMutation, useUpdateWorkItemMutation, useWorkItemsQuery } from '@/api/hooks/jobs'
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
  StatusBadge,
  Table,
  TextInput,
  useToast,
  type TableColumn,
} from '@/components'
import type { JobCard, WorkItem } from '@/api/types'

const createSchema = z.object({
  description: z.string().min(1).max(300),
  isAdditionalWork: z.boolean(),
})
type CreateFormValues = z.infer<typeof createSchema>

export function WorkItemsTab({ job }: { job: JobCard }) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const { showToast } = useToast()
  const canCreate = hasAnyPermission(user, ['jobs.update']) && (job.stage === 'RECEIVED' || job.stage === 'IN_PROGRESS')
  const canChangeStatus = hasAnyPermission(user, ['labor.write']) && job.stage === 'IN_PROGRESS'
  const canCancel = hasAnyPermission(user, ['jobs.update'])

  const [createOpen, setCreateOpen] = useState(false)
  const itemsQuery = useWorkItemsQuery(job.id, {})
  const createMutation = useCreateWorkItemMutation(job.id)
  const updateMutation = useUpdateWorkItemMutation(job.id)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateFormValues>({
    resolver: zodResolver(createSchema),
    defaultValues: { description: '', isAdditionalWork: false },
  })

  async function onCreate(values: CreateFormValues) {
    try {
      await createMutation.mutateAsync(values)
      showToast(t('jobs.workItems.createSuccess'), 'success')
      reset({ description: '', isAdditionalWork: false })
      setCreateOpen(false)
    } catch {
      // surfaced below
    }
  }

  async function setStatus(item: WorkItem, status: 'DONE' | 'CANCELLED') {
    try {
      await updateMutation.mutateAsync({ workItemId: item.id, payload: { status } })
      showToast(t('jobs.workItems.updateSuccess'), 'success')
    } catch {
      // surfaced via list refresh; keep UI responsive without blocking dialogs here
    }
  }

  const columns: ReadonlyArray<TableColumn<WorkItem>> = [
    { key: 'description', header: t('jobs.workItems.columns.description'), render: (row) => row.description },
    {
      key: 'isAdditionalWork',
      header: t('jobs.workItems.columns.additional'),
      render: (row) => (row.isAdditionalWork ? t('common.yes') : t('common.no')),
    },
    {
      key: 'status',
      header: t('common.status'),
      render: (row) => (
        <StatusBadge tone={row.status === 'DONE' ? 'success' : row.status === 'CANCELLED' ? 'neutral' : 'info'}>
          {t(`jobs.workItems.statusOptions.${row.status}`)}
        </StatusBadge>
      ),
    },
    {
      key: 'actions',
      header: t('common.actions'),
      render: (row) =>
        row.status === 'PENDING' ? (
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {canChangeStatus ? (
              <Button type="button" variant="ghost" size="sm" onClick={() => void setStatus(row, 'DONE')}>
                {t('jobs.workItems.markDone')}
              </Button>
            ) : null}
            {canCancel ? (
              <Button type="button" variant="ghost" size="sm" onClick={() => void setStatus(row, 'CANCELLED')}>
                {t('common.cancel')}
              </Button>
            ) : null}
          </div>
        ) : null,
    },
  ]

  return (
    <Card title={t('jobs.tabs.workItems')}>
      {canCreate ? (
        <Button type="button" onClick={() => setCreateOpen(true)} style={{ marginBottom: '1rem' }}>
          {t('jobs.workItems.createAction')}
        </Button>
      ) : null}

      <ListStateBoundary
        isLoading={itemsQuery.isLoading}
        isError={itemsQuery.isError}
        error={itemsQuery.error}
        onRetry={() => void itemsQuery.refetch()}
        isEmpty={(itemsQuery.data?.items.length ?? 0) === 0}
        emptyTitle={t('jobs.workItems.empty.title')}
        emptyDescription={t('jobs.workItems.empty.description')}
      >
        <Table columns={columns} rows={itemsQuery.data?.items ?? []} getRowKey={(row) => row.id} />
      </ListStateBoundary>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title={t('jobs.workItems.createAction')}>
        <form onSubmit={handleSubmit(onCreate)} noValidate>
          {createMutation.isError ? (
            <Alert variant="danger">
              {createMutation.error instanceof ApiError ? createMutation.error.message : t('errors.unknownError')}
            </Alert>
          ) : null}
          <FormField
            id="work-item-description"
            label={t('jobs.workItems.columns.description')}
            error={errors.description ? t('validation.required') : undefined}
            required
          >
            <TextInput {...register('description')} />
          </FormField>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0.5rem 0' }}>
            <input type="checkbox" {...register('isAdditionalWork')} />
            {t('jobs.workItems.isAdditionalWorkLabel')}
          </label>
          <Button type="submit" isLoading={isSubmitting}>
            {isSubmitting ? t('jobs.workItems.creating') : t('jobs.workItems.createAction')}
          </Button>
        </form>
      </Modal>
    </Card>
  )
}
