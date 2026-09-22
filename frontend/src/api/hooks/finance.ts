import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as financeApi from '../endpoints/finance'
import { queryKeys } from '../queryKeys'
import { generateIdempotencyKey } from '@/lib/idempotencyKey'
import type { InvoiceTransitionRequest, InvoiceUpdateRequest, PaymentCreateRequest } from '../types'

export function useInvoicesQuery(params: financeApi.ListInvoicesParams) {
  return useQuery({
    queryKey: queryKeys.invoices.list(params),
    queryFn: ({ signal }) => financeApi.listInvoices(params, signal),
    placeholderData: keepPreviousData,
  })
}

export function useInvoiceQuery(invoiceId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.invoices.detail(invoiceId ?? ''),
    queryFn: ({ signal }) => financeApi.getInvoice(invoiceId as string, signal),
    enabled: Boolean(invoiceId),
  })
}

export function useUpdateInvoiceMutation(invoiceId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: InvoiceUpdateRequest) => financeApi.updateInvoice(invoiceId, payload),
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKeys.invoices.detail(invoiceId), updated)
      void queryClient.invalidateQueries({ queryKey: queryKeys.invoices.lists() })
    },
  })
}

export function useTransitionInvoiceMutation(invoiceId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: InvoiceTransitionRequest) => financeApi.transitionInvoice(invoiceId, payload),
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKeys.invoices.detail(invoiceId), updated)
      void queryClient.invalidateQueries({ queryKey: queryKeys.invoices.lists() })
    },
  })
}

export function useRecordInvoicePaymentMutation(invoiceId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: PaymentCreateRequest) =>
      financeApi.recordInvoicePayment(invoiceId, payload, generateIdempotencyKey()),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.invoices.detail(invoiceId) })
      void queryClient.invalidateQueries({ queryKey: queryKeys.invoices.lists() })
    },
  })
}

export function useCustomerStatementQuery(customerId: string | undefined, params: financeApi.CustomerStatementParams) {
  return useQuery({
    queryKey: queryKeys.statements.detail(customerId ?? '', params),
    queryFn: ({ signal }) => financeApi.getCustomerStatement(customerId as string, params, signal),
    enabled: Boolean(customerId),
  })
}
