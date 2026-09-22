import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router-dom'
import { usePurchaseOrderQuery, useTransitionPurchaseOrderMutation } from '@/api/hooks/purchasing'
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
  PageHeader,
  StatusBadge,
  Table,
  TextInput,
  useToast,
  type TableColumn,
} from '@/components'
import { formatDate, formatMoney } from '@/lib/format'
import type { PurchaseOrderLine, PurchaseOrderStatus } from '@/api/types'
import { ApprovalsSection } from './ApprovalsSection'
import { GoodsReceiptsSection } from './GoodsReceiptsSection'

const STATUS_TONES = {
  DRAFT: 'neutral',
  PENDING_APPROVAL: 'warning',
  APPROVED: 'info',
  REJECTED: 'danger',
  PARTIALLY_RECEIVED: 'warning',
  RECEIVED: 'success',
  CANCELLED: 'neutral',
} as const

export function PurchaseOrderDetailPage() {
  const { purchaseOrderId } = useParams<{ purchaseOrderId: string }>()
  const { t } = useTranslation()
  const { user } = useAuth()
  const { showToast } = useToast()
  const canManage = hasAnyPermission(user, ['purchasing.create'])
  const canReceive = hasAnyPermission(user, ['purchasing.receive'])

  const orderQuery = usePurchaseOrderQuery(purchaseOrderId)
  const transitionMutation = useTransitionPurchaseOrderMutation(purchaseOrderId ?? '')

  const [cancelOpen, setCancelOpen] = useState(false)
  const [cancelReason, setCancelReason] = useState('')

  async function submitForApproval() {
    try {
      await transitionMutation.mutateAsync({ toStatus: 'PENDING_APPROVAL' })
      showToast(t('purchasing.orders.detail.submitSuccess'), 'success')
    } catch {
      // surfaced below
    }
  }

  async function confirmCancel() {
    try {
      await transitionMutation.mutateAsync({ toStatus: 'CANCELLED', reason: cancelReason })
      showToast(t('purchasing.orders.detail.cancelSuccess'), 'success')
    } catch {
      // surfaced below
    } finally {
      setCancelOpen(false)
      setCancelReason('')
    }
  }

  const lineColumns: ReadonlyArray<TableColumn<PurchaseOrderLine>> = [
    { key: 'sku', header: t('inventory.parts.columns.sku'), render: (row) => row.sku, dirStable: true },
    {
      key: 'quantityOrdered',
      header: t('purchasing.orders.columns.quantityOrdered'),
      render: (row) => <span className="dir-ltr">{row.quantityOrdered}</span>,
    },
    {
      key: 'quantityAccepted',
      header: t('purchasing.orders.columns.quantityAccepted'),
      render: (row) => <span className="dir-ltr">{row.quantityAccepted}</span>,
    },
    {
      key: 'quantityRejected',
      header: t('purchasing.orders.columns.quantityRejected'),
      render: (row) => <span className="dir-ltr">{row.quantityRejected}</span>,
    },
    {
      key: 'unitCost',
      header: t('purchasing.orders.unitCostLabel'),
      render: (row) => <span className="dir-ltr">{formatMoney(row.unitCost)}</span>,
    },
    {
      key: 'lineTotal',
      header: t('purchasing.orders.columns.lineTotal'),
      render: (row) => <span className="dir-ltr">{formatMoney(row.lineTotal)}</span>,
    },
  ]

  return (
    <div>
      <PageHeader
        title={t('purchasing.orders.detail.title')}
        actions={<Link to="/purchasing/orders">{t('purchasing.orders.detail.backToList')}</Link>}
      />

      <ListStateBoundary
        isLoading={orderQuery.isLoading}
        isError={orderQuery.isError}
        error={orderQuery.error}
        onRetry={() => void orderQuery.refetch()}
        isEmpty={false}
        emptyTitle=""
      >
        {orderQuery.data ? (
          <>
            <Card
              title={
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <span className="dir-ltr">{orderQuery.data.poNumber}</span>
                  <StatusBadge tone={STATUS_TONES[orderQuery.data.status]}>
                    {t(`purchasing.orders.statusOptions.${orderQuery.data.status}`)}
                  </StatusBadge>
                </div>
              }
            >
              {transitionMutation.isError ? <TransitionErrorAlert error={transitionMutation.error} /> : null}

              <dl style={{ display: 'grid', gap: '0.5rem', marginBottom: '1rem' }}>
                <div>
                  <dt>{t('purchasing.orders.columns.total')}</dt>
                  <dd className="dir-ltr">{formatMoney(orderQuery.data.total)}</dd>
                </div>
                {orderQuery.data.expectedDeliveryDate ? (
                  <div>
                    <dt>{t('purchasing.orders.columns.expectedDelivery')}</dt>
                    <dd>{formatDate(orderQuery.data.expectedDeliveryDate)}</dd>
                  </div>
                ) : null}
                {orderQuery.data.requiredApprovals ? (
                  <div>
                    <dt>{t('purchasing.orders.approvalsProgress')}</dt>
                    <dd className="dir-ltr">
                      {orderQuery.data.approvalsRecorded} / {orderQuery.data.requiredApprovals}
                    </dd>
                  </div>
                ) : null}
              </dl>

              <Table columns={lineColumns} rows={orderQuery.data.lines} getRowKey={(row) => row.id} />

              {canManage ? (
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                  {orderQuery.data.status === 'DRAFT' ? (
                    <Button
                      type="button"
                      onClick={() => void submitForApproval()}
                      isLoading={transitionMutation.isPending}
                    >
                      {t('purchasing.orders.detail.submitAction')}
                    </Button>
                  ) : null}
                  {(['DRAFT', 'PENDING_APPROVAL', 'APPROVED'] as ReadonlyArray<PurchaseOrderStatus>).includes(
                    orderQuery.data.status,
                  ) ? (
                    <Button type="button" variant="danger" onClick={() => setCancelOpen(true)}>
                      {t('purchasing.orders.detail.cancelAction')}
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </Card>

            <ApprovalsSection order={orderQuery.data} />
            {canReceive || orderQuery.data.status !== 'DRAFT' ? <GoodsReceiptsSection order={orderQuery.data} /> : null}
          </>
        ) : null}
      </ListStateBoundary>

      <ConfirmDialog
        open={cancelOpen}
        title={t('purchasing.orders.detail.cancelConfirmTitle')}
        description={
          <FormField id="po-cancel-reason" label={t('jobs.labor.reasonLabel')} required>
            <TextInput value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} />
          </FormField>
        }
        tone="danger"
        isLoading={transitionMutation.isPending}
        onConfirm={() => void confirmCancel()}
        onCancel={() => setCancelOpen(false)}
      />
    </div>
  )
}

function TransitionErrorAlert({ error }: { error: unknown }) {
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
