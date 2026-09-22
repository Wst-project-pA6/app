import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { useDecidePurchaseOrderMutation, usePurchaseApprovalsQuery } from '@/api/hooks/purchasing'
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
  Table,
  TextInput,
  useToast,
  type TableColumn,
} from '@/components'
import { formatDateTime } from '@/lib/format'
import type { PurchaseApproval, PurchaseOrder } from '@/api/types'

const schema = z.object({ decision: z.enum(['APPROVED', 'REJECTED']), reason: z.string().max(500).optional() })
type FormValues = z.infer<typeof schema>

export function ApprovalsSection({ order }: { order: PurchaseOrder }) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const { showToast } = useToast()
  const canApprove = hasAnyPermission(user, ['purchasing.approve']) && order.status === 'PENDING_APPROVAL'

  const approvalsQuery = usePurchaseApprovalsQuery(order.id, {})
  const decideMutation = useDecidePurchaseOrderMutation(order.id)
  const [open, setOpen] = useState(false)

  const { register, handleSubmit, reset, formState } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { decision: 'APPROVED' },
  })

  async function onSubmit(values: FormValues) {
    try {
      await decideMutation.mutateAsync(values)
      showToast(t('purchasing.orders.approvals.success'), 'success')
      reset({ decision: 'APPROVED', reason: '' })
      setOpen(false)
    } catch {
      // surfaced below
    }
  }

  const columns: ReadonlyArray<TableColumn<PurchaseApproval>> = [
    {
      key: 'decision',
      header: t('jobs.approvals.decisionLabel'),
      render: (row) => t(`jobs.approvals.statusOptions.${row.decision === 'APPROVED' ? 'APPROVED' : 'REJECTED'}`),
    },
    { key: 'reason', header: t('jobs.labor.reasonLabel'), render: (row) => row.reason ?? '—' },
    {
      key: 'decidedAt',
      header: t('purchasing.orders.approvals.decidedAt'),
      render: (row) => formatDateTime(row.decidedAt),
    },
  ]

  return (
    <Card title={t('purchasing.orders.approvals.title')}>
      {canApprove ? (
        <Button type="button" onClick={() => setOpen(true)} style={{ marginBottom: '1rem' }}>
          {t('purchasing.orders.approvals.decideAction')}
        </Button>
      ) : null}

      <ListStateBoundary
        isLoading={approvalsQuery.isLoading}
        isError={approvalsQuery.isError}
        error={approvalsQuery.error}
        onRetry={() => void approvalsQuery.refetch()}
        isEmpty={(approvalsQuery.data?.items.length ?? 0) === 0}
        emptyTitle={t('purchasing.orders.approvals.empty')}
        emptyDescription=""
      >
        <Table columns={columns} rows={approvalsQuery.data?.items ?? []} getRowKey={(row) => row.id} />
      </ListStateBoundary>

      <Modal open={open} onClose={() => setOpen(false)} title={t('purchasing.orders.approvals.decideAction')}>
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          {decideMutation.isError ? (
            <Alert variant="danger">
              {decideMutation.error instanceof ApiError ? decideMutation.error.message : t('errors.unknownError')}
            </Alert>
          ) : null}
          <FormField id="po-approval-decision" label={t('jobs.approvals.decisionLabel')} required>
            <Select {...register('decision')}>
              <option value="APPROVED">{t('jobs.approvals.statusOptions.APPROVED')}</option>
              <option value="REJECTED">{t('jobs.approvals.statusOptions.REJECTED')}</option>
            </Select>
          </FormField>
          <FormField id="po-approval-reason" label={t('jobs.labor.reasonLabel')} hint={t('common.optional')}>
            <TextInput {...register('reason')} />
          </FormField>
          <Button type="submit" isLoading={formState.isSubmitting}>
            {t('purchasing.orders.approvals.decideAction')}
          </Button>
        </form>
      </Modal>
    </Card>
  )
}
