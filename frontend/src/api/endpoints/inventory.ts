import { request } from '../client'
import type { QueryParams } from '../queryString'
import type {
  Part,
  PartCreateRequest,
  PartPage,
  PartUpdateRequest,
  StockAdjustment,
  StockAdjustmentCreateRequest,
  StockAdjustmentDecisionRequest,
  StockAdjustmentPage,
  StockBalance,
  StockBalancePage,
  StockLevelsUpdateRequest,
  StockMovementPage,
  StockReconciliation,
  Store,
  StoreCreateRequest,
  StorePage,
  StoreUpdateRequest,
} from '../types'

export interface ListStoresParams extends QueryParams {
  page?: number
  pageSize?: number
  sort?: string
  status?: 'ACTIVE' | 'INACTIVE'
}

export function listStores(params: ListStoresParams = {}, signal?: AbortSignal): Promise<StorePage> {
  return request<StorePage>('/stores', { method: 'GET', query: params, signal })
}

export function createStore(payload: StoreCreateRequest, signal?: AbortSignal): Promise<Store> {
  return request<Store>('/stores', { method: 'POST', body: payload, signal })
}

export function updateStore(storeId: string, payload: StoreUpdateRequest, signal?: AbortSignal): Promise<Store> {
  return request<Store>(`/stores/${storeId}`, { method: 'PATCH', body: payload, signal })
}

export interface ListPartsParams extends QueryParams {
  page?: number
  pageSize?: number
  sort?: string
  q?: string
  sku?: string
  barcode?: string
  category?: string
  compatibleMake?: string
  compatibleModel?: string
  status?: 'ACTIVE' | 'ARCHIVED'
}

export function listParts(params: ListPartsParams = {}, signal?: AbortSignal): Promise<PartPage> {
  return request<PartPage>('/parts', { method: 'GET', query: params, signal })
}

export function createPart(payload: PartCreateRequest, signal?: AbortSignal): Promise<Part> {
  return request<Part>('/parts', { method: 'POST', body: payload, signal })
}

export function getPart(partId: string, signal?: AbortSignal): Promise<Part> {
  return request<Part>(`/parts/${partId}`, { method: 'GET', signal })
}

export function updatePart(partId: string, payload: PartUpdateRequest, signal?: AbortSignal): Promise<Part> {
  return request<Part>(`/parts/${partId}`, { method: 'PATCH', body: payload, signal })
}

export interface ListStockBalancesParams extends QueryParams {
  page?: number
  pageSize?: number
  sort?: string
  q?: string
  storeId?: string
  partId?: string
  category?: string
  belowMinimum?: boolean
  stockedOut?: boolean
}

export function listStockBalances(
  params: ListStockBalancesParams = {},
  signal?: AbortSignal,
): Promise<StockBalancePage> {
  return request<StockBalancePage>('/stock-balances', { method: 'GET', query: params, signal })
}

export function getStockReconciliation(storeId?: string, signal?: AbortSignal): Promise<StockReconciliation> {
  return request<StockReconciliation>('/stock-balances/reconciliation', {
    method: 'GET',
    query: { storeId },
    signal,
  })
}

export function replaceStockLevels(
  storeId: string,
  partId: string,
  payload: StockLevelsUpdateRequest,
  signal?: AbortSignal,
): Promise<StockBalance> {
  return request<StockBalance>(`/stock-balances/${storeId}/${partId}/levels`, {
    method: 'PUT',
    body: payload,
    signal,
  })
}

export interface ListStockMovementsParams extends QueryParams {
  page?: number
  pageSize?: number
  sort?: string
  from?: string
  to?: string
  storeId?: string
  partId?: string
  type?: string
  jobId?: string
  purchaseOrderId?: string
  goodsReceiptId?: string
  stockAdjustmentId?: string
}

export function listStockMovements(
  params: ListStockMovementsParams = {},
  signal?: AbortSignal,
): Promise<StockMovementPage> {
  return request<StockMovementPage>('/stock-movements', { method: 'GET', query: params, signal })
}

export interface ListStockAdjustmentsParams extends QueryParams {
  page?: number
  pageSize?: number
  sort?: string
  status?: 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED'
  storeId?: string
  partId?: string
}

export function listStockAdjustments(
  params: ListStockAdjustmentsParams = {},
  signal?: AbortSignal,
): Promise<StockAdjustmentPage> {
  return request<StockAdjustmentPage>('/stock-adjustments', { method: 'GET', query: params, signal })
}

export function createStockAdjustment(
  payload: StockAdjustmentCreateRequest,
  idempotencyKey: string,
  signal?: AbortSignal,
): Promise<StockAdjustment> {
  return request<StockAdjustment>('/stock-adjustments', {
    method: 'POST',
    body: payload,
    headers: { 'Idempotency-Key': idempotencyKey },
    signal,
  })
}

export function decideStockAdjustment(
  adjustmentId: string,
  payload: StockAdjustmentDecisionRequest,
  signal?: AbortSignal,
): Promise<StockAdjustment> {
  return request<StockAdjustment>(`/stock-adjustments/${adjustmentId}/decision`, {
    method: 'POST',
    body: payload,
    signal,
  })
}
