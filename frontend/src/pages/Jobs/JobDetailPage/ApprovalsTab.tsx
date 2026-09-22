import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import {
  useCreateJobApprovalMutation,
  useDecideJobApprovalMutation,
  useJobApprovalsQuery,
} from '@/api/hooks/jobApprovals'
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
import type { JobApproval, JobCard } from '@/api/types'

const createSchema = z.object({
  scope: z.enum(['INITIAL_WORK', 'ADDITIONAL_WORK', 'SUBLET']),
  description: z.string().min(3).max(1000),
})
type CreateFormValues = z.infer<typeof createSchema>

const decisionSchema = z.object({
  decision: z.enum(['APPROVED', 'REJECTED']),
  method: z.enum(['IN_PERSON', 'PHONE', 'MESSAGE', 'EMAIL', 'SIGNED_FORM']),
  approvedByName: z.string().min(1).max(120),
  notes: z.string().max(1000).optional(),
})
type DecisionFormValues = z.infer<typeof decisionSchema>

export function ApprovalsTab({ job }: { job: JobCard }) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const { showToast } = useToast()
  const canRecord = hasAnyPermission(user, ['approvals.record'])

  const approvalsQuery = useJobApprovalsQuery(job.id, {})
  const createMutation = useCreateJobApprovalMutation(job.id)
  const decideMutation = useDecideJobApprovalMutation(job.id)

  const [createOpen, setCreateOpen] = useState(false)
  const [deciding, setDeciding] = useState<JobApproval | null>(null)

  const createForm = useForm<CreateFormValues>({
    resolver: zodResolver(createSchema),
    defaultValues: { scope: 'INITIAL_WORK', description: '' },
  })
  const decisionForm = useForm<DecisionFormValues>({
    resolver: zodResolver(decisionSchema),
    defaultValues: { decision: 'APPROVED', method: 'IN_PERSON', approvedByName: '' },
  })

  async function onCreate(values: CreateFormValues) {
    try {
      await createMutation.mutateAsync(values)
      showToast(t('jobs.approvals.createSuccess'), 'success')
      createForm.reset({ scope: 'INITIAL_WORK', description: '' })
      setCreateOpen(false)
    } catch {
      // surfaced below
    }
  }

  async function onDecide(values: DecisionFormValues) {
    if (!deciding) return
    try {
      await decideMutation.mutateAsync({ approvalId: deciding.id, payload: values })
      showToast(t('jobs.approvals.decisionSuccess'), 'success')
      setDeciding(null)
    } catch {
      // surfaced below
    }
  }

  const columns: ReadonlyArray<TableColumn<JobApproval>> = [
    {
      key: 'scope',
      header: t('jobs.approvals.columns.scope'),
      render: (row) => t(`jobs.approvals.scopeOptions.${row.scope}`),
    },
    { key: 'description', header: t('jobs.approvals.columns.description'), render: (row) => row.description },
    {
      key: 'status',
      header: t('common.status'),
      render: (row) => (
        <StatusBadge tone={row.status === 'APPROVED' ? 'success' : row.status === 'REJECTED' ? 'danger' : 'warning'}>
          {t(`jobs.approvals.statusOptions.${row.status}`)}
        </StatusBadge>
      ),
    },
    { key: 'createdAt', header: t('common.createdAt'), render: (row) => formatDateTime(row.createdAt) },
    {
      key: 'actions',
      header: t('common.actions'),
      render: (row) =>
        row.status === 'PENDING' && canRecord ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => setDeciding(row)}>
            {t('jobs.approvals.decideAction')}
          </Button>
        ) : null,
    },
  ]

  return (
    <Card title={t('jobs.tabs.approvals')}>
      {canRecord ? (
        <Button type="button" onClick={() => setCreateOpen(true)} style={{ marginBottom: '1rem' }}>
          {t('jobs.approvals.createAction')}
        </Button>
      ) : null}

      <ListStateBoundary
        isLoading={approvalsQuery.isLoading}
        isError={approvalsQuery.isError}
        error={approvalsQuery.error}
        onRetry={() => void approvalsQuery.refetch()}
        isEmpty={(approvalsQuery.data?.items.length ?? 0) === 0}
        emptyTitle={t('jobs.approvals.empty.title')}
        emptyDescription={t('jobs.approvals.empty.description')}
      >
        <Table columns={columns} rows={approvalsQuery.data?.items ?? []} getRowKey={(row) => row.id} />
      </ListStateBoundary>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title={t('jobs.approvals.createAction')}>
        <form onSubmit={createForm.handleSubmit(onCreate)} noValidate>
          {createMutation.isError ? (
            <Alert variant="danger">
              {createMutation.error instanceof ApiError ? createMutation.error.message : t('errors.unknownError')}
            </Alert>
          ) : null}
          <FormField id="approval-scope" label={t('jobs.approvals.columns.scope')} required>
            <Select {...createForm.register('scope')}>
              {(['INITIAL_WORK', 'ADDITIONAL_WORK', 'SUBLET'] as const).map((option) => (
                <option key={option} value={option}>
                  {t(`jobs.approvals.scopeOptions.${option}`)}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField
            id="approval-description"
            label={t('jobs.approvals.columns.description')}
            error={createForm.formState.errors.description ? t('validation.required') : undefined}
            required
          >
            <TextInput {...createForm.register('description')} />
          </FormField>
          <Button type="submit" isLoading={createForm.formState.isSubmitting}>
            {t('jobs.approvals.createAction')}
          </Button>
        </form>
      </Modal>

      <Modal open={deciding !== null} onClose={() => setDeciding(null)} title={t('jobs.approvals.decideAction')}>
        <form onSubmit={decisionForm.handleSubmit(onDecide)} noValidate>
          {decideMutation.isError ? (
            <Alert variant="danger">
              {decideMutation.error instanceof ApiError ? decideMutation.error.message : t('errors.unknownError')}
            </Alert>
          ) : null}
          <FormField id="decision-decision" label={t('jobs.approvals.decisionLabel')} required>
            <Select {...decisionForm.register('decision')}>
              <option value="APPROVED">{t('jobs.approvals.statusOptions.APPROVED')}</option>
              <option value="REJECTED">{t('jobs.approvals.statusOptions.REJECTED')}</option>
            </Select>
          </FormField>
          <FormField id="decision-method" label={t('jobs.approvals.methodLabel')} required>
            <Select {...decisionForm.register('method')}>
              {(['IN_PERSON', 'PHONE', 'MESSAGE', 'EMAIL', 'SIGNED_FORM'] as const).map((option) => (
                <option key={option} value={option}>
                  {t(`jobs.approvals.methodOptions.${option}`)}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField
            id="decision-approved-by"
            label={t('jobs.approvals.approvedByNameLabel')}
            error={decisionForm.formState.errors.approvedByName ? t('validation.required') : undefined}
            required
          >
            <TextInput {...decisionForm.register('approvedByName')} />
          </FormField>
          <FormField id="decision-notes" label={t('jobs.approvals.notesLabel')} hint={t('common.optional')}>
            <TextInput {...decisionForm.register('notes')} />
          </FormField>
          <Button type="submit" isLoading={decisionForm.formState.isSubmitting}>
            {t('jobs.approvals.decideAction')}
          </Button>
        </form>
      </Modal>
    </Card>
  )
}
