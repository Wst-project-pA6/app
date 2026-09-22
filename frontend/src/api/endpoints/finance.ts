import { request } from '../client'
import type { QueryParams } from '../queryString'
import type {
  CustomerStatement,
  Invoice,
  InvoicePage,
  InvoiceTransitionRequest,
  InvoiceUpdateRequest,
  PaymentCreateRequest,
  PaymentReference,
} from '../types'

export interface ListInvoicesParams extends QueryParams {
  page?: number
  pageSize?: number
  sort?: string
  from?: string
  to?: string
  status?: 'DRAFT' | 'ISSUED' | 'PAID' | 'VOID'
  jobId?: string
  customerId?: string
  invoiceNumber?: string
}

export function listInvoices(params: ListInvoicesParams = {}, signal?: AbortSignal): Promise<InvoicePage> {
  return request<InvoicePage>('/invoices', { method: 'GET', query: params, signal })
}

export function getInvoice(invoiceId: string, signal?: AbortSignal): Promise<Invoice> {
  return request<Invoice>(`/invoices/${invoiceId}`, { method: 'GET', signal })
}

export function updateInvoice(
  invoiceId: string,
  payload: InvoiceUpdateRequest,
  signal?: AbortSignal,
): Promise<Invoice> {
  return request<Invoice>(`/invoices/${invoiceId}`, { method: 'PATCH', body: payload, signal })
}

export function transitionInvoice(
  invoiceId: string,
  payload: InvoiceTransitionRequest,
  signal?: AbortSignal,
): Promise<Invoice> {
  return request<Invoice>(`/invoices/${invoiceId}/transitions`, { method: 'POST', body: payload, signal })
}

export function recordInvoicePayment(
  invoiceId: string,
  payload: PaymentCreateRequest,
  idempotencyKey: string,
  signal?: AbortSignal,
): Promise<PaymentReference> {
  return request<PaymentReference>(`/invoices/${invoiceId}/payments`, {
    method: 'POST',
    body: payload,
    headers: { 'Idempotency-Key': idempotencyKey },
    signal,
  })
}

export interface CustomerStatementParams extends QueryParams {
  from?: string
  to?: string
}

export function getCustomerStatement(
  customerId: string,
  params: CustomerStatementParams = {},
  signal?: AbortSignal,
): Promise<CustomerStatement> {
  return request<CustomerStatement>(`/customers/${customerId}/statement`, { method: 'GET', query: params, signal })
}
