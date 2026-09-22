import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { usePartsQuery, useStoresQuery } from '@/api/hooks/inventory'
import {
  useIssuePartMutation,
  usePartIssuesQuery,
  usePartReservationsQuery,
  useReleasePartReservationMutation,
  useReservePartMutation,
  useReversePartIssueMutation,
} from '@/api/hooks/jobParts'
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
  Select,
  StatusBadge,
  Table,
  TextInput,
  useToast,
  type TableColumn,
} from '@/components'
import { formatMoney } from '@/lib/format'
import type { JobCard, PartIssue, PartReservation } from '@/api/types'

const issueSchema = z.object({
  partId: z.string().min(1),
  storeId: z.string().min(1),
  quantity: z.number().int().min(1),
})
type IssueFormValues = z.infer<typeof issueSchema>

export function PartsTab({ job }: { job: JobCard }) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const { showToast } = useToast()
  const canReadCost = hasAnyPermission(user, ['inventory.cost.read'])
  const canIssue = hasAnyPermission(user, ['inventory.issue'])
  const canReverse = hasAnyPermission(user, ['inventory.reverse'])

  const issuesQuery = usePartIssuesQuery(job.id, {})
  const reservationsQuery = usePartReservationsQuery(job.id, {})
  const storesQuery = useStoresQuery({ pageSize: 100, status: 'ACTIVE' })
  const partsQuery = usePartsQuery({ pageSize: 50, status: 'ACTIVE' })

  const issueMutation = useIssuePartMutation(job.id)
  const reserveMutation = useReservePartMutation(job.id)
  const reverseMutation = useReversePartIssueMutation(job.id)
  const releaseMutation = useReleasePartReservationMutation(job.id)

  const [issueOpen, setIssueOpen] = useState(false)
  const [reserveOpen, setReserveOpen] = useState(false)
  const [reversing, setReversing] = useState<PartIssue | null>(null)
  const [reverseReason, setReverseReason] = useState('')

  const issueForm = useForm<IssueFormValues>({
    resolver: zodResolver(issueSchema),
    defaultValues: { partId: '', storeId: '', quantity: 1 },
  })
  const reserveForm = useForm<IssueFormValues>({
    resolver: zodResolver(issueSchema),
    defaultValues: { partId: '', storeId: '', quantity: 1 },
  })

  async function onIssue(values: IssueFormValues) {
    try {
      await issueMutation.mutateAsync(values)
      showToast(t('jobs.parts.issueSuccess'), 'success')
      issueForm.reset({ partId: '', storeId: '', quantity: 1 })
      setIssueOpen(false)
    } catch {
      // surfaced below
    }
  }

  async function onReserve(values: IssueFormValues) {
    try {
      await reserveMutation.mutateAsync(values)
      showToast(t('jobs.parts.reserveSuccess'), 'success')
      reserveForm.reset({ partId: '', storeId: '', quantity: 1 })
      setReserveOpen(false)
    } catch {
      // surfaced below
    }
  }

  async function confirmReverse() {
    if (!reversing) return
    try {
      await reverseMutation.mutateAsync({
        partIssueId: reversing.id,
        payload: { quantity: reversing.quantity - reversing.reversedQuantity, reason: reverseReason },
      })
      showToast(t('jobs.parts.reverseSuccess'), 'success')
    } catch {
      // surfaced via list
    } finally {
      setReversing(null)
      setReverseReason('')
    }
  }

  async function release(reservationId: string) {
    try {
      await releaseMutation.mutateAsync(reservationId)
      showToast(t('jobs.parts.releaseSuccess'), 'success')
    } catch {
      // surfaced via list
    }
  }

  const issueColumns: ReadonlyArray<TableColumn<PartIssue>> = [
    { key: 'partSku', header: t('jobs.parts.columns.sku'), render: (row) => row.partSku, dirStable: true },
    {
      key: 'quantity',
      header: t('jobs.parts.columns.quantity'),
      render: (row) => <span className="dir-ltr">{row.quantity}</span>,
    },
    {
      key: 'lineTotal',
      header: t('jobs.parts.columns.lineTotal'),
      render: (row) => <span className="dir-ltr">{formatMoney(row.lineTotal)}</span>,
    },
    ...(canReadCost
      ? [
          {
            key: 'unitCost',
            header: t('jobs.parts.columns.unitCost'),
            render: (row: PartIssue) => (
              <span className="dir-ltr">{row.unitCost ? formatMoney(row.unitCost) : '—'}</span>
            ),
          } satisfies TableColumn<PartIssue>,
        ]
      : []),
    {
      key: 'status',
      header: t('common.status'),
      render: (row) => (
        <StatusBadge tone={row.status === 'ISSUED' ? 'success' : row.status === 'REVERSED' ? 'neutral' : 'warning'}>
          {t(`jobs.parts.issueStatusOptions.${row.status}`)}
        </StatusBadge>
      ),
    },
    {
      key: 'actions',
      header: t('common.actions'),
      render: (row) =>
        canReverse && row.status !== 'REVERSED' ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => setReversing(row)}>
            {t('jobs.parts.reverseAction')}
          </Button>
        ) : null,
    },
  ]

  const reservationColumns: ReadonlyArray<TableColumn<PartReservation>> = [
    { key: 'partId', header: t('jobs.parts.columns.partId'), render: (row) => row.partId, dirStable: true },
    {
      key: 'quantity',
      header: t('jobs.parts.columns.quantity'),
      render: (row) => <span className="dir-ltr">{row.quantity}</span>,
    },
    {
      key: 'consumedQuantity',
      header: t('jobs.parts.columns.consumed'),
      render: (row) => <span className="dir-ltr">{row.consumedQuantity}</span>,
    },
    {
      key: 'status',
      header: t('common.status'),
      render: (row) => (
        <StatusBadge tone={row.status === 'ACTIVE' ? 'info' : 'neutral'}>
          {t(`jobs.parts.reservationStatusOptions.${row.status}`)}
        </StatusBadge>
      ),
    },
    {
      key: 'actions',
      header: t('common.actions'),
      render: (row) =>
        canIssue && row.status === 'ACTIVE' ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => void release(row.id)}>
            {t('jobs.parts.releaseAction')}
          </Button>
        ) : null,
    },
  ]

  return (
    <div>
      <Card title={t('jobs.parts.issuesTitle')}>
        {canIssue ? (
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
            <Button type="button" onClick={() => setIssueOpen(true)}>
              {t('jobs.parts.issueAction')}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setReserveOpen(true)}>
              {t('jobs.parts.reserveAction')}
            </Button>
          </div>
        ) : null}

        <ListStateBoundary
          isLoading={issuesQuery.isLoading}
          isError={issuesQuery.isError}
          error={issuesQuery.error}
          onRetry={() => void issuesQuery.refetch()}
          isEmpty={(issuesQuery.data?.items.length ?? 0) === 0}
          emptyTitle={t('jobs.parts.empty.title')}
          emptyDescription={t('jobs.parts.empty.description')}
        >
          <Table columns={issueColumns} rows={issuesQuery.data?.items ?? []} getRowKey={(row) => row.id} />
        </ListStateBoundary>
      </Card>

      <Card title={t('jobs.parts.reservationsTitle')}>
        <ListStateBoundary
          isLoading={reservationsQuery.isLoading}
          isError={reservationsQuery.isError}
          error={reservationsQuery.error}
          onRetry={() => void reservationsQuery.refetch()}
          isEmpty={(reservationsQuery.data?.items.length ?? 0) === 0}
          emptyTitle={t('jobs.parts.reservationsEmpty.title')}
          emptyDescription={t('jobs.parts.reservationsEmpty.description')}
        >
          <Table columns={reservationColumns} rows={reservationsQuery.data?.items ?? []} getRowKey={(row) => row.id} />
        </ListStateBoundary>
      </Card>

      <Modal open={issueOpen} onClose={() => setIssueOpen(false)} title={t('jobs.parts.issueAction')}>
        <form onSubmit={issueForm.handleSubmit(onIssue)} noValidate>
          {issueMutation.isError ? <PartsErrorAlert error={issueMutation.error} /> : null}
          <FormField id="issue-part" label={t('jobs.parts.partLabel')} required>
            <Select {...issueForm.register('partId')}>
              <option value="">{t('common.unassigned')}</option>
              {partsQuery.data?.items.map((part) => (
                <option key={part.id} value={part.id}>
                  {part.sku} — {part.name.en}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField id="issue-store" label={t('jobs.parts.storeLabel')} required>
            <Select {...issueForm.register('storeId')}>
              <option value="">{t('common.unassigned')}</option>
              {storesQuery.data?.items.map((store) => (
                <option key={store.id} value={store.id}>
                  {store.name}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField id="issue-quantity" label={t('jobs.parts.columns.quantity')} required>
            <TextInput type="number" dirStable {...issueForm.register('quantity', { valueAsNumber: true })} />
          </FormField>
          <Button type="submit" isLoading={issueForm.formState.isSubmitting}>
            {t('jobs.parts.issueAction')}
          </Button>
        </form>
      </Modal>

      <Modal open={reserveOpen} onClose={() => setReserveOpen(false)} title={t('jobs.parts.reserveAction')}>
        <form onSubmit={reserveForm.handleSubmit(onReserve)} noValidate>
          {reserveMutation.isError ? <PartsErrorAlert error={reserveMutation.error} /> : null}
          <FormField id="reserve-part" label={t('jobs.parts.partLabel')} required>
            <Select {...reserveForm.register('partId')}>
              <option value="">{t('common.unassigned')}</option>
              {partsQuery.data?.items.map((part) => (
                <option key={part.id} value={part.id}>
                  {part.sku} — {part.name.en}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField id="reserve-store" label={t('jobs.parts.storeLabel')} required>
            <Select {...reserveForm.register('storeId')}>
              <option value="">{t('common.unassigned')}</option>
              {storesQuery.data?.items.map((store) => (
                <option key={store.id} value={store.id}>
                  {store.name}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField id="reserve-quantity" label={t('jobs.parts.columns.quantity')} required>
            <TextInput type="number" dirStable {...reserveForm.register('quantity', { valueAsNumber: true })} />
          </FormField>
          <Button type="submit" isLoading={reserveForm.formState.isSubmitting}>
            {t('jobs.parts.reserveAction')}
          </Button>
        </form>
      </Modal>

      <ConfirmDialog
        open={reversing !== null}
        title={t('jobs.parts.reverseConfirmTitle')}
        description={
          <FormField id="reverse-reason" label={t('jobs.labor.reasonLabel')} required>
            <TextInput value={reverseReason} onChange={(event) => setReverseReason(event.target.value)} />
          </FormField>
        }
        tone="danger"
        isLoading={reverseMutation.isPending}
        onConfirm={() => void confirmReverse()}
        onCancel={() => setReversing(null)}
      />
    </div>
  )
}

function PartsErrorAlert({ error }: { error: unknown }) {
  const { t } = useTranslation()

  if (error instanceof ApiError && error.code === 'INSUFFICIENT_STOCK') {
    return (
      <Alert variant="danger" title={t('jobs.parts.insufficientStockTitle')}>
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
