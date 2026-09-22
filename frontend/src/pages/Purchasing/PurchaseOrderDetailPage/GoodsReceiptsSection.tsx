import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useFieldArray, useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { useCreateGoodsReceiptMutation, useGoodsReceiptsQuery } from '@/api/hooks/purchasing'
import { ApiError } from '@/api/errors'
import { useAuth } from '@/auth/useAuth'
import { hasAnyPermission } from '@/auth/permissions'
import {
  Alert,
  Button,
  Card,
  ListStateBoundary,
  Modal,
  Table,
  TextInput,
  useToast,
  type TableColumn,
} from '@/components'
import { formatDateTime } from '@/lib/format'
import type { GoodsReceipt, PurchaseOrder } from '@/api/types'

const lineSchema = z.object({
  purchaseOrderLineId: z.string(),
  quantityReceived: z.number().int().min(0),
  quantityAccepted: z.number().int().min(0),
  quantityRejected: z.number().int().min(0),
  rejectionReason: z.string().max(300).optional(),
})
const schema = z.object({ lines: z.array(lineSchema).min(1) })
type FormValues = z.infer<typeof schema>

export function GoodsReceiptsSection({ order }: { order: PurchaseOrder }) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const { showToast } = useToast()
  const canReceive =
    hasAnyPermission(user, ['purchasing.receive']) &&
    (order.status === 'APPROVED' || order.status === 'PARTIALLY_RECEIVED')

  const receiptsQuery = useGoodsReceiptsQuery(order.id, {})
  const createMutation = useCreateGoodsReceiptMutation(order.id)
  const [open, setOpen] = useState(false)

  const { control, register, handleSubmit, reset, formState } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      lines: order.lines.map((line) => ({
        purchaseOrderLineId: line.id,
        quantityReceived: line.quantityOrdered - line.quantityAccepted - line.quantityRejected,
        quantityAccepted: line.quantityOrdered - line.quantityAccepted - line.quantityRejected,
        quantityRejected: 0,
        rejectionReason: '',
      })),
    },
  })
  const { fields } = useFieldArray({ control, name: 'lines' })

  async function onSubmit(values: FormValues) {
    try {
      await createMutation.mutateAsync({
        lines: values.lines.map((line) => ({
          purchaseOrderLineId: line.purchaseOrderLineId,
          quantityReceived: line.quantityReceived,
          quantityAccepted: line.quantityAccepted,
          quantityRejected: line.quantityRejected,
          ...(line.rejectionReason ? { rejectionReason: line.rejectionReason } : {}),
        })),
      })
      showToast(t('purchasing.orders.receipts.success'), 'success')
      setOpen(false)
      reset()
    } catch {
      // surfaced below
    }
  }

  const columns: ReadonlyArray<TableColumn<GoodsReceipt>> = [
    {
      key: 'receiptNumber',
      header: t('purchasing.orders.receipts.columns.receiptNumber'),
      render: (row) => row.receiptNumber,
      dirStable: true,
    },
    {
      key: 'receivedAt',
      header: t('purchasing.orders.receipts.columns.receivedAt'),
      render: (row) => formatDateTime(row.receivedAt),
    },
    {
      key: 'lineCount',
      header: t('purchasing.orders.receipts.columns.lines'),
      render: (row) => <span className="dir-ltr">{row.lines.length}</span>,
    },
  ]

  return (
    <Card title={t('purchasing.orders.receipts.title')}>
      {canReceive ? (
        <Button type="button" onClick={() => setOpen(true)} style={{ marginBottom: '1rem' }}>
          {t('purchasing.orders.receipts.createAction')}
        </Button>
      ) : null}

      <ListStateBoundary
        isLoading={receiptsQuery.isLoading}
        isError={receiptsQuery.isError}
        error={receiptsQuery.error}
        onRetry={() => void receiptsQuery.refetch()}
        isEmpty={(receiptsQuery.data?.items.length ?? 0) === 0}
        emptyTitle={t('purchasing.orders.receipts.empty')}
        emptyDescription=""
      >
        <Table columns={columns} rows={receiptsQuery.data?.items ?? []} getRowKey={(row) => row.id} />
      </ListStateBoundary>

      <Modal open={open} onClose={() => setOpen(false)} title={t('purchasing.orders.receipts.createAction')}>
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          {createMutation.isError ? (
            <Alert variant="danger">
              {createMutation.error instanceof ApiError ? createMutation.error.message : t('errors.unknownError')}
            </Alert>
          ) : null}
          {fields.map((field, index) => {
            const line = order.lines[index]
            return (
              <div
                key={field.id}
                style={{
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-md)',
                  padding: '0.75rem',
                  marginBottom: '0.75rem',
                }}
              >
                <p className="dir-ltr" style={{ fontWeight: 600 }}>
                  {line?.sku}
                </p>
                <label>
                  {t('purchasing.orders.receipts.receivedLabel')}
                  <TextInput
                    type="number"
                    dirStable
                    {...register(`lines.${index}.quantityReceived` as const, { valueAsNumber: true })}
                  />
                </label>
                <label>
                  {t('purchasing.orders.receipts.acceptedLabel')}
                  <TextInput
                    type="number"
                    dirStable
                    {...register(`lines.${index}.quantityAccepted` as const, { valueAsNumber: true })}
                  />
                </label>
                <label>
                  {t('purchasing.orders.receipts.rejectedLabel')}
                  <TextInput
                    type="number"
                    dirStable
                    {...register(`lines.${index}.quantityRejected` as const, { valueAsNumber: true })}
                  />
                </label>
                <label>
                  {t('purchasing.orders.receipts.rejectionReasonLabel')}
                  <TextInput {...register(`lines.${index}.rejectionReason` as const)} />
                </label>
              </div>
            )
          })}
          <Button type="submit" isLoading={formState.isSubmitting}>
            {t('purchasing.orders.receipts.createAction')}
          </Button>
        </form>
      </Modal>
    </Card>
  )
}
