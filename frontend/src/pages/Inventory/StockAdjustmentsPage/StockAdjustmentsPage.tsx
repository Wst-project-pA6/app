import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import {
  useCreateStockAdjustmentMutation,
  useDecideStockAdjustmentMutation,
  useStockAdjustmentsQuery,
} from '@/api/hooks/inventory'
import { ApiError } from '@/api/errors'
import { useAuth } from '@/auth/useAuth'
import { hasAnyPermission } from '@/auth/permissions'
import {
  Alert,
  Button,
  FilterBar,
  FormField,
  ListStateBoundary,
  Modal,
  PageHeader,
  Pagination,
  Select,
  StatusBadge,
  Table,
  TextInput,
  useToast,
  type TableColumn,
} from '@/components'
import { formatDateTime } from '@/lib/format'
import { useSearchParamPage, useSearchParamState } from '@/hooks/useSearchParamState'
import type { StockAdjustment } from '@/api/types'
import { InventorySectionNav } from '../InventorySectionNav'

const PAGE_SIZE = 20
const REASON_CODES = ['DAMAGE', 'LOSS', 'FOUND', 'COUNT_CORRECTION', 'OTHER'] as const

const createSchema = z.object({
  storeId: z.string().min(1),
  partId: z.string().min(1),
  quantityDelta: z
    .number()
    .int()
    .refine((value) => value !== 0, { message: 'nonZero' }),
  reasonCode: z.enum(REASON_CODES),
})
type CreateFormValues = z.infer<typeof createSchema>

const decisionSchema = z.object({ decision: z.enum(['APPROVED', 'REJECTED']), reason: z.string().max(500).optional() })
type DecisionFormValues = z.infer<typeof decisionSchema>

export function StockAdjustmentsPage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const { showToast } = useToast()
  const canRequest = hasAnyPermission(user, ['inventory.adjust'])
  const canApprove = hasAnyPermission(user, ['inventory.adjust.approve'])

  const [status, setStatus] = useSearchParamState('status')
  const [page, setPage] = useSearchParamPage()

  const adjustmentsQuery = useStockAdjustmentsQuery({
    page,
    pageSize: PAGE_SIZE,
    status: status ? (status as 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED') : undefined,
  })
  const createMutation = useCreateStockAdjustmentMutation()
  const decideMutation = useDecideStockAdjustmentMutation()

  const [createOpen, setCreateOpen] = useState(false)
  const [deciding, setDeciding] = useState<StockAdjustment | null>(null)

  const createForm = useForm<CreateFormValues>({
    resolver: zodResolver(createSchema),
    defaultValues: { storeId: '', partId: '', quantityDelta: 1, reasonCode: 'COUNT_CORRECTION' },
  })
  const decisionForm = useForm<DecisionFormValues>({
    resolver: zodResolver(decisionSchema),
    defaultValues: { decision: 'APPROVED' },
  })

  async function onCreate(values: CreateFormValues) {
    try {
      await createMutation.mutateAsync(values)
      showToast(t('inventory.adjustments.createSuccess'), 'success')
      createForm.reset({ storeId: '', partId: '', quantityDelta: 1, reasonCode: 'COUNT_CORRECTION' })
      setCreateOpen(false)
    } catch {
      // surfaced below
    }
  }

  async function onDecide(values: DecisionFormValues) {
    if (!deciding) return
    try {
      await decideMutation.mutateAsync({ adjustmentId: deciding.id, payload: values })
      showToast(t('inventory.adjustments.decisionSuccess'), 'success')
      setDeciding(null)
    } catch {
      // surfaced below
    }
  }

  const columns: ReadonlyArray<TableColumn<StockAdjustment>> = [
    { key: 'partId', header: t('jobs.parts.columns.partId'), render: (row) => row.partId, dirStable: true },
    { key: 'storeId', header: t('jobs.parts.storeLabel'), render: (row) => row.storeId, dirStable: true },
    {
      key: 'quantityDelta',
      header: t('inventory.adjustments.columns.quantityDelta'),
      render: (row) => <span className="dir-ltr">{row.quantityDelta}</span>,
    },
    {
      key: 'reasonCode',
      header: t('inventory.adjustments.columns.reason'),
      render: (row) => t(`inventory.adjustments.reasonOptions.${row.reasonCode}`),
    },
    {
      key: 'status',
      header: t('common.status'),
      render: (row) => (
        <StatusBadge tone={row.status === 'APPROVED' ? 'success' : row.status === 'REJECTED' ? 'danger' : 'warning'}>
          {t(`inventory.adjustments.statusOptions.${row.status}`)}
        </StatusBadge>
      ),
    },
    { key: 'createdAt', header: t('common.createdAt'), render: (row) => formatDateTime(row.createdAt) },
    {
      key: 'actions',
      header: t('common.actions'),
      render: (row) =>
        row.status === 'PENDING_APPROVAL' && canApprove ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => setDeciding(row)}>
            {t('inventory.adjustments.decideAction')}
          </Button>
        ) : null,
    },
  ]

  return (
    <div>
      <PageHeader
        title={t('inventory.adjustments.title')}
        actions={
          canRequest ? (
            <Button type="button" onClick={() => setCreateOpen(true)}>
              {t('inventory.adjustments.createAction')}
            </Button>
          ) : undefined
        }
      />
      <InventorySectionNav />

      <FilterBar>
        <Select aria-label={t('common.status')} value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="">{t('common.allStatuses')}</option>
          <option value="PENDING_APPROVAL">{t('inventory.adjustments.statusOptions.PENDING_APPROVAL')}</option>
          <option value="APPROVED">{t('inventory.adjustments.statusOptions.APPROVED')}</option>
          <option value="REJECTED">{t('inventory.adjustments.statusOptions.REJECTED')}</option>
        </Select>
      </FilterBar>

      <ListStateBoundary
        isLoading={adjustmentsQuery.isLoading}
        isError={adjustmentsQuery.isError}
        error={adjustmentsQuery.error}
        onRetry={() => void adjustmentsQuery.refetch()}
        isEmpty={(adjustmentsQuery.data?.items.length ?? 0) === 0}
        emptyTitle={t('inventory.adjustments.empty.title')}
        emptyDescription={t('inventory.adjustments.empty.description')}
      >
        <Table columns={columns} rows={adjustmentsQuery.data?.items ?? []} getRowKey={(row) => row.id} />
        {adjustmentsQuery.data ? (
          <Pagination
            page={adjustmentsQuery.data.page.page}
            pageSize={adjustmentsQuery.data.page.pageSize}
            totalItems={adjustmentsQuery.data.page.totalItems}
            totalPages={adjustmentsQuery.data.page.totalPages}
            onPageChange={setPage}
          />
        ) : null}
      </ListStateBoundary>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title={t('inventory.adjustments.createAction')}>
        <form onSubmit={createForm.handleSubmit(onCreate)} noValidate>
          {createMutation.isError ? (
            <Alert variant="danger">
              {createMutation.error instanceof ApiError ? createMutation.error.message : t('errors.unknownError')}
            </Alert>
          ) : null}
          <FormField id="adjustment-store" label={t('jobs.parts.storeLabel')} required>
            <TextInput dirStable className="dir-ltr" {...createForm.register('storeId')} />
          </FormField>
          <FormField id="adjustment-part" label={t('jobs.parts.columns.partId')} required>
            <TextInput dirStable className="dir-ltr" {...createForm.register('partId')} />
          </FormField>
          <FormField
            id="adjustment-quantity"
            label={t('inventory.adjustments.columns.quantityDelta')}
            hint={t('inventory.adjustments.quantityHint')}
            required
          >
            <TextInput type="number" dirStable {...createForm.register('quantityDelta', { valueAsNumber: true })} />
          </FormField>
          <FormField id="adjustment-reason" label={t('inventory.adjustments.columns.reason')} required>
            <Select {...createForm.register('reasonCode')}>
              {REASON_CODES.map((option) => (
                <option key={option} value={option}>
                  {t(`inventory.adjustments.reasonOptions.${option}`)}
                </option>
              ))}
            </Select>
          </FormField>
          <Button type="submit" isLoading={createForm.formState.isSubmitting}>
            {t('inventory.adjustments.createAction')}
          </Button>
        </form>
      </Modal>

      <Modal open={deciding !== null} onClose={() => setDeciding(null)} title={t('inventory.adjustments.decideAction')}>
        <form onSubmit={decisionForm.handleSubmit(onDecide)} noValidate>
          {decideMutation.isError ? (
            <Alert variant="danger">
              {decideMutation.error instanceof ApiError ? decideMutation.error.message : t('errors.unknownError')}
            </Alert>
          ) : null}
          <FormField id="decision-choice" label={t('jobs.approvals.decisionLabel')} required>
            <Select {...decisionForm.register('decision')}>
              <option value="APPROVED">{t('inventory.adjustments.statusOptions.APPROVED')}</option>
              <option value="REJECTED">{t('inventory.adjustments.statusOptions.REJECTED')}</option>
            </Select>
          </FormField>
          <FormField id="decision-reason" label={t('jobs.labor.reasonLabel')} hint={t('common.optional')}>
            <TextInput {...decisionForm.register('reason')} />
          </FormField>
          <Button type="submit" isLoading={decisionForm.formState.isSubmitting}>
            {t('inventory.adjustments.decideAction')}
          </Button>
        </form>
      </Modal>
    </div>
  )
}
