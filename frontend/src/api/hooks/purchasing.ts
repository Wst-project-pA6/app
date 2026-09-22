import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as purchasingApi from '../endpoints/purchasing'
import { queryKeys } from '../queryKeys'
import { generateIdempotencyKey } from '@/lib/idempotencyKey'
import type {
  GoodsReceiptCreateRequest,
  PurchaseApprovalPolicyUpdateRequest,
  PurchaseApprovalRequest,
  PurchaseOrderCreateRequest,
  PurchaseOrderTransitionRequest,
  PurchaseOrderUpdateRequest,
  VendorCreateRequest,
  VendorUpdateRequest,
} from '../types'

export function useVendorsQuery(params: purchasingApi.ListVendorsParams) {
  return useQuery({
    queryKey: queryKeys.vendors.list(params),
    queryFn: ({ signal }) => purchasingApi.listVendors(params, signal),
    placeholderData: keepPreviousData,
  })
}

export function useCreateVendorMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: VendorCreateRequest) => purchasingApi.createVendor(payload),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.vendors.all }),
  })
}

export function useUpdateVendorMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ vendorId, payload }: { vendorId: string; payload: VendorUpdateRequest }) =>
      purchasingApi.updateVendor(vendorId, payload),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.vendors.all }),
  })
}

export function usePurchaseApprovalPolicyQuery() {
  return useQuery({
    queryKey: queryKeys.purchaseApprovalPolicy.all,
    queryFn: ({ signal }) => purchasingApi.getPurchaseApprovalPolicy(signal),
  })
}

export function useReplacePurchaseApprovalPolicyMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: PurchaseApprovalPolicyUpdateRequest) => purchasingApi.replacePurchaseApprovalPolicy(payload),
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKeys.purchaseApprovalPolicy.all, updated)
    },
  })
}

export function usePurchaseOrdersQuery(params: purchasingApi.ListPurchaseOrdersParams) {
  return useQuery({
    queryKey: queryKeys.purchaseOrders.list(params),
    queryFn: ({ signal }) => purchasingApi.listPurchaseOrders(params, signal),
    placeholderData: keepPreviousData,
  })
}

export function usePurchaseOrderQuery(purchaseOrderId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.purchaseOrders.detail(purchaseOrderId ?? ''),
    queryFn: ({ signal }) => purchasingApi.getPurchaseOrder(purchaseOrderId as string, signal),
    enabled: Boolean(purchaseOrderId),
  })
}

export function useCreatePurchaseOrderMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: PurchaseOrderCreateRequest) => purchasingApi.createPurchaseOrder(payload),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.lists() }),
  })
}

export function useUpdatePurchaseOrderMutation(purchaseOrderId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: PurchaseOrderUpdateRequest) => purchasingApi.updatePurchaseOrder(purchaseOrderId, payload),
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKeys.purchaseOrders.detail(purchaseOrderId), updated)
      void queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.lists() })
    },
  })
}

export function useTransitionPurchaseOrderMutation(purchaseOrderId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: PurchaseOrderTransitionRequest) =>
      purchasingApi.transitionPurchaseOrder(purchaseOrderId, payload),
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKeys.purchaseOrders.detail(purchaseOrderId), updated)
      void queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.lists() })
    },
  })
}

export function usePurchaseApprovalsQuery(
  purchaseOrderId: string | undefined,
  params: purchasingApi.ListPurchaseApprovalsParams,
) {
  return useQuery({
    queryKey: queryKeys.purchaseOrders.approvals(purchaseOrderId ?? '', params),
    queryFn: ({ signal }) => purchasingApi.listPurchaseApprovals(purchaseOrderId as string, params, signal),
    enabled: Boolean(purchaseOrderId),
    placeholderData: keepPreviousData,
  })
}

export function useDecidePurchaseOrderMutation(purchaseOrderId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: PurchaseApprovalRequest) => purchasingApi.decidePurchaseOrder(purchaseOrderId, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.detail(purchaseOrderId) })
      void queryClient.invalidateQueries({
        queryKey: [...queryKeys.purchaseOrders.detail(purchaseOrderId), 'approvals'],
      })
      void queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.lists() })
    },
  })
}

export function useGoodsReceiptsQuery(
  purchaseOrderId: string | undefined,
  params: purchasingApi.ListGoodsReceiptsParams,
) {
  return useQuery({
    queryKey: queryKeys.purchaseOrders.goodsReceipts(purchaseOrderId ?? '', params),
    queryFn: ({ signal }) => purchasingApi.listGoodsReceipts(purchaseOrderId as string, params, signal),
    enabled: Boolean(purchaseOrderId),
    placeholderData: keepPreviousData,
  })
}

export function useCreateGoodsReceiptMutation(purchaseOrderId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: GoodsReceiptCreateRequest) =>
      purchasingApi.createGoodsReceipt(purchaseOrderId, payload, generateIdempotencyKey()),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.detail(purchaseOrderId) })
      void queryClient.invalidateQueries({
        queryKey: [...queryKeys.purchaseOrders.detail(purchaseOrderId), 'goodsReceipts'],
      })
      void queryClient.invalidateQueries({ queryKey: queryKeys.stockBalances.all })
      void queryClient.invalidateQueries({ queryKey: queryKeys.stockMovements.all })
    },
  })
}
