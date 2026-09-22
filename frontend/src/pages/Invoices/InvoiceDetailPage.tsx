import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router-dom'
import {
  useInvoiceQuery,
  useRecordInvoicePaymentMutation,
  useTransitionInvoiceMutation,
  useUpdateInvoiceMutation,
} from '@/api/hooks/finance'
import { ApiError } from '@/api/errors'
import { useAuth } from '@/auth/useAuth'
import { hasAnyPermission } from '@/auth/permissions'
import {
  Alert,
  Button,
  Card,
  FormField,
  ListStateBoundary,
  PageHeader,
  Select,
  TextInput,
  useToast,
} from '@/components'
import { formatDateTime, formatMoney } from '@/lib/format'
import type { Invoice } from '@/api/types'
import styles from '../Stage5.module.css'

export function InvoiceDetailPage() {
  const { invoiceId } = useParams<{ invoiceId: string }>()
  const { t } = useTranslation()
  const { user } = useAuth()
  const { showToast } = useToast()
  const query = useInvoiceQuery(invoiceId)
  const invoice = query.data
  const canManage = hasAnyPermission(user, ['invoices.manage'])
  const canPay = hasAnyPermission(user, ['payments.record'])
  const updateMutation = useUpdateInvoiceMutation(invoiceId ?? '')
  const transitionMutation = useTransitionInvoiceMutation(invoiceId ?? '')
  const paymentMutation = useRecordInvoicePaymentMutation(invoiceId ?? '')
  const [discountType, setDiscountType] = useState<'PERCENT' | 'AMOUNT'>('PERCENT')
  const [discountValue, setDiscountValue] = useState('')
  const [discountReason, setDiscountReason] = useState('')
  const [notes, setNotes] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'CARD' | 'BANK_TRANSFER' | 'CHEQUE' | 'OTHER'>('CASH')
  const [paymentReference, setPaymentReference] = useState('')
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paidAt, setPaidAt] = useState(() => new Date().toISOString().slice(0, 16))

  useEffect(() => {
    if (!invoice) return
    // Server data is the source of truth when a new invoice version arrives.
    /* eslint-disable react-hooks/set-state-in-effect */
    setDiscountType(invoice.discount?.type ?? 'PERCENT')
    setDiscountValue(invoice.discount?.value ?? '')
    setDiscountReason(invoice.discount?.reason ?? '')
    setNotes(invoice.notes ?? '')
    setPaymentAmount(invoice.totals.total.amount)
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [invoice])

  async function saveDraft(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!invoice) return
    try {
      await updateMutation.mutateAsync({
        version: invoice.version,
        notes,
        ...(discountValue ? { discount: { type: discountType, value: discountValue, reason: discountReason } } : {}),
      })
      showToast(t('invoices.saved'), 'success')
    } catch {
      // Render mutation error below.
    }
  }

  async function transition(toStatus: 'ISSUED' | 'VOID') {
    if (!invoice) return
    const reason = toStatus === 'VOID' ? (window.prompt(t('invoices.voidReasonPrompt')) ?? '') : undefined
    if (toStatus === 'VOID' && !reason) return
    try {
      await transitionMutation.mutateAsync({ toStatus, ...(reason ? { reason } : {}) })
      showToast(t('invoices.transitioned'), 'success')
    } catch {
      // Render mutation error below.
    }
  }

  async function recordPayment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    try {
      await paymentMutation.mutateAsync({
        method: paymentMethod,
        reference: paymentReference,
        amount: { amount: paymentAmount, currency: invoice?.currencyCode ?? '' },
        paidAt: new Date(paidAt).toISOString(),
      })
      showToast(t('invoices.paymentRecorded'), 'success')
    } catch {
      // Render mutation error below.
    }
  }

  return (
    <div className={styles.page}>
      <PageHeader
        title={invoice?.invoiceNumber ?? t('invoices.detailTitle')}
        actions={<Link to="/invoices">{t('invoices.backToList')}</Link>}
      />
      <ListStateBoundary
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={() => void query.refetch()}
        isEmpty={false}
        emptyTitle=""
      >
        {invoice ? (
          <>
            <div className={styles.toolbar}>
              <span>{invoice.status}</span>
              <span className="dir-ltr">{invoice.jobNumber ?? invoice.jobId}</span>
              <span>{formatDateTime(invoice.createdAt)}</span>
            </div>
            <Card title={t('invoices.linesTitle')}>
              <TableLike invoice={invoice} />
            </Card>
            <Card title={t('invoices.totalsTitle')}>
              <dl className={styles.detailGrid}>
                {[
                  ['subtotal', invoice.totals.subtotal],
                  ['discount', invoice.totals.discountTotal],
                  ['taxable', invoice.totals.taxableAmount],
                  ['tax', invoice.totals.taxAmount],
                  ['total', invoice.totals.total],
                ].map(([label, money]) => (
                  <div key={label as string}>
                    <dt>{t(`invoices.${label as string}`)}</dt>
                    <dd className="dir-ltr">{formatMoney(money as { amount: string; currency: string })}</dd>
                  </div>
                ))}
              </dl>
            </Card>
            {canManage && invoice.status === 'DRAFT' ? (
              <Card title={t('invoices.editDraftTitle')}>
                <form onSubmit={(event) => void saveDraft(event)} className={styles.formGrid}>
                  <FormField id="discount-type" label={t('invoices.discountType')}>
                    <Select
                      value={discountType}
                      onChange={(event) => setDiscountType(event.target.value as 'PERCENT' | 'AMOUNT')}
                    >
                      <option value="PERCENT">PERCENT</option>
                      <option value="AMOUNT">AMOUNT</option>
                    </Select>
                  </FormField>
                  <FormField id="discount-value" label={t('invoices.discountValue')}>
                    <TextInput
                      value={discountValue}
                      onChange={(event) => setDiscountValue(event.target.value)}
                      className="dir-ltr"
                    />
                  </FormField>
                  <FormField id="discount-reason" label={t('invoices.discountReason')}>
                    <TextInput value={discountReason} onChange={(event) => setDiscountReason(event.target.value)} />
                  </FormField>
                  <FormField id="invoice-notes" label={t('invoices.notes')}>
                    <TextInput value={notes} onChange={(event) => setNotes(event.target.value)} />
                  </FormField>
                  <div className={styles.actions}>
                    <Button type="submit" isLoading={updateMutation.isPending}>
                      {t('common.save')}
                    </Button>
                  </div>
                </form>
              </Card>
            ) : null}
            {canManage && invoice.status === 'DRAFT' ? (
              <Button type="button" onClick={() => void transition('ISSUED')} isLoading={transitionMutation.isPending}>
                {t('invoices.issue')}
              </Button>
            ) : null}
            {canManage && invoice.status === 'ISSUED' ? (
              <Button
                type="button"
                variant="danger"
                onClick={() => void transition('VOID')}
                isLoading={transitionMutation.isPending}
              >
                {t('invoices.void')}
              </Button>
            ) : null}
            {canPay && invoice.status === 'ISSUED' ? (
              <Card title={t('invoices.paymentTitle')}>
                <form onSubmit={(event) => void recordPayment(event)} className={styles.formGrid}>
                  <FormField id="payment-method" label={t('invoices.paymentMethod')}>
                    <Select
                      value={paymentMethod}
                      onChange={(event) => setPaymentMethod(event.target.value as typeof paymentMethod)}
                    >
                      <option value="CASH">CASH</option>
                      <option value="CARD">CARD</option>
                      <option value="BANK_TRANSFER">BANK_TRANSFER</option>
                      <option value="CHEQUE">CHEQUE</option>
                      <option value="OTHER">OTHER</option>
                    </Select>
                  </FormField>
                  <FormField id="payment-reference" label={t('invoices.paymentReference')}>
                    <TextInput value={paymentReference} onChange={(event) => setPaymentReference(event.target.value)} />
                  </FormField>
                  <FormField
                    id="payment-amount"
                    label={t('invoices.paymentAmount')}
                    hint={t('invoices.exactAmountHint')}
                  >
                    <TextInput
                      value={paymentAmount}
                      onChange={(event) => setPaymentAmount(event.target.value)}
                      className="dir-ltr"
                    />
                  </FormField>
                  <FormField id="paid-at" label={t('invoices.paidAt')}>
                    <TextInput
                      type="datetime-local"
                      value={paidAt}
                      onChange={(event) => setPaidAt(event.target.value)}
                    />
                  </FormField>
                  <div className={styles.actions}>
                    <Button type="submit" isLoading={paymentMutation.isPending}>
                      {t('invoices.recordPayment')}
                    </Button>
                  </div>
                </form>
              </Card>
            ) : null}
            {updateMutation.isError || transitionMutation.isError || paymentMutation.isError ? (
              <Alert variant="danger" title={t('errors.requestFailed')}>
                {getMutationMessage(
                  updateMutation.error ?? transitionMutation.error ?? paymentMutation.error,
                  t('errors.unknownError'),
                )}
              </Alert>
            ) : null}
          </>
        ) : null}
      </ListStateBoundary>
    </div>
  )
}

function TableLike({ invoice }: { invoice: Invoice }) {
  const { t } = useTranslation()
  return (
    <div role="table">
      <div role="row">
        <strong>{t('invoices.columns.description')}</strong>
        <strong>{t('invoices.columns.quantity')}</strong>
        <strong>{t('invoices.columns.total')}</strong>
      </div>
      {invoice.lines.map((line) => (
        <div role="row" key={line.id}>
          <span>{line.description}</span>
          <span className="dir-ltr">{line.quantity}</span>
          <span className="dir-ltr">{formatMoney(line.lineTotal)}</span>
        </div>
      ))}
    </div>
  )
}

function getMutationMessage(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback
}
