import { request } from '../client'
import type { QueryParams } from '../queryString'
import type {
  GoodsReceipt,
  GoodsReceiptCreateRequest,
  GoodsReceiptPage,
  PurchaseApproval,
  PurchaseApprovalPage,
  PurchaseApprovalPolicy,
  PurchaseApprovalPolicyUpdateRequest,
  PurchaseApprovalRequest,
  PurchaseOrder,
  PurchaseOrderCreateRequest,
  PurchaseOrderPage,
  PurchaseOrderTransitionRequest,
  PurchaseOrderUpdateRequest,
  Vendor,
  VendorCreateRequest,
  VendorPage,
  VendorUpdateRequest,
} from '../types'

export interface ListVendorsParams extends QueryParams {
  page?: number
  pageSize?: number
  sort?: string
  q?: string
  status?: 'ACTIVE' | 'INACTIVE'
}

export function listVendors(params: ListVendorsParams = {}, signal?: AbortSignal): Promise<VendorPage> {
  return request<VendorPage>('/vendors', { method: 'GET', query: params, signal })
}

export function createVendor(payload: VendorCreateRequest, signal?: AbortSignal): Promise<Vendor> {
  return request<Vendor>('/vendors', { method: 'POST', body: payload, signal })
}

export function updateVendor(vendorId: string, payload: VendorUpdateRequest, signal?: AbortSignal): Promise<Vendor> {
  return request<Vendor>(`/vendors/${vendorId}`, { method: 'PATCH', body: payload, signal })
}

export function getPurchaseApprovalPolicy(signal?: AbortSignal): Promise<PurchaseApprovalPolicy> {
  return request<PurchaseApprovalPolicy>('/config/purchase-approval-policy', { method: 'GET', signal })
}

export function replacePurchaseApprovalPolicy(
  payload: PurchaseApprovalPolicyUpdateRequest,
  signal?: AbortSignal,
): Promise<PurchaseApprovalPolicy> {
  return request<PurchaseApprovalPolicy>('/config/purchase-approval-policy', {
    method: 'PUT',
    body: payload,
    signal,
  })
}

export interface ListPurchaseOrdersParams extends QueryParams {
  page?: number
  pageSize?: number
  sort?: string
  from?: string
  to?: string
  status?: string
  vendorId?: string
  storeId?: string
  poNumber?: string
}

export function listPurchaseOrders(
  params: ListPurchaseOrdersParams = {},
  signal?: AbortSignal,
): Promise<PurchaseOrderPage> {
  return request<PurchaseOrderPage>('/purchase-orders', { method: 'GET', query: params, signal })
}

export function createPurchaseOrder(payload: PurchaseOrderCreateRequest, signal?: AbortSignal): Promise<PurchaseOrder> {
  return request<PurchaseOrder>('/purchase-orders', { method: 'POST', body: payload, signal })
}

export function getPurchaseOrder(purchaseOrderId: string, signal?: AbortSignal): Promise<PurchaseOrder> {
  return request<PurchaseOrder>(`/purchase-orders/${purchaseOrderId}`, { method: 'GET', signal })
}

export function updatePurchaseOrder(
  purchaseOrderId: string,
  payload: PurchaseOrderUpdateRequest,
  signal?: AbortSignal,
): Promise<PurchaseOrder> {
  return request<PurchaseOrder>(`/purchase-orders/${purchaseOrderId}`, { method: 'PATCH', body: payload, signal })
}

export function transitionPurchaseOrder(
  purchaseOrderId: string,
  payload: PurchaseOrderTransitionRequest,
  signal?: AbortSignal,
): Promise<PurchaseOrder> {
  return request<PurchaseOrder>(`/purchase-orders/${purchaseOrderId}/transitions`, {
    method: 'POST',
    body: payload,
    signal,
  })
}

export interface ListPurchaseApprovalsParams extends QueryParams {
  page?: number
  pageSize?: number
  sort?: string
}

export function listPurchaseApprovals(
  purchaseOrderId: string,
  params: ListPurchaseApprovalsParams = {},
  signal?: AbortSignal,
): Promise<PurchaseApprovalPage> {
  return request<PurchaseApprovalPage>(`/purchase-orders/${purchaseOrderId}/approvals`, {
    method: 'GET',
    query: params,
    signal,
  })
}

export function decidePurchaseOrder(
  purchaseOrderId: string,
  payload: PurchaseApprovalRequest,
  signal?: AbortSignal,
): Promise<PurchaseApproval> {
  return request<PurchaseApproval>(`/purchase-orders/${purchaseOrderId}/approvals`, {
    method: 'POST',
    body: payload,
    signal,
  })
}

export interface ListGoodsReceiptsParams extends QueryParams {
  page?: number
  pageSize?: number
  sort?: string
}

export function listGoodsReceipts(
  purchaseOrderId: string,
  params: ListGoodsReceiptsParams = {},
  signal?: AbortSignal,
): Promise<GoodsReceiptPage> {
  return request<GoodsReceiptPage>(`/purchase-orders/${purchaseOrderId}/goods-receipts`, {
    method: 'GET',
    query: params,
    signal,
  })
}

export function createGoodsReceipt(
  purchaseOrderId: string,
  payload: GoodsReceiptCreateRequest,
  idempotencyKey: string,
  signal?: AbortSignal,
): Promise<GoodsReceipt> {
  return request<GoodsReceipt>(`/purchase-orders/${purchaseOrderId}/goods-receipts`, {
    method: 'POST',
    body: payload,
    headers: { 'Idempotency-Key': idempotencyKey },
    signal,
  })
}
