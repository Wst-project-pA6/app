import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as inventoryApi from '../endpoints/inventory'
import { queryKeys } from '../queryKeys'
import { generateIdempotencyKey } from '@/lib/idempotencyKey'
import type {
  PartCreateRequest,
  PartUpdateRequest,
  StockAdjustmentCreateRequest,
  StockAdjustmentDecisionRequest,
  StockLevelsUpdateRequest,
  StoreCreateRequest,
  StoreUpdateRequest,
} from '../types'

export function useStoresQuery(params: inventoryApi.ListStoresParams) {
  return useQuery({
    queryKey: queryKeys.stores.list(params),
    queryFn: ({ signal }) => inventoryApi.listStores(params, signal),
    placeholderData: keepPreviousData,
  })
}

export function useCreateStoreMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: StoreCreateRequest) => inventoryApi.createStore(payload),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.stores.all }),
  })
}

export function useUpdateStoreMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ storeId, payload }: { storeId: string; payload: StoreUpdateRequest }) =>
      inventoryApi.updateStore(storeId, payload),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.stores.all }),
  })
}

export function usePartsQuery(params: inventoryApi.ListPartsParams) {
  return useQuery({
    queryKey: queryKeys.parts.list(params),
    queryFn: ({ signal }) => inventoryApi.listParts(params, signal),
    placeholderData: keepPreviousData,
  })
}

export function usePartQuery(partId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.parts.detail(partId ?? ''),
    queryFn: ({ signal }) => inventoryApi.getPart(partId as string, signal),
    enabled: Boolean(partId),
  })
}

export function useCreatePartMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: PartCreateRequest) => inventoryApi.createPart(payload),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.parts.lists() }),
  })
}

export function useUpdatePartMutation(partId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: PartUpdateRequest) => inventoryApi.updatePart(partId, payload),
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKeys.parts.detail(partId), updated)
      void queryClient.invalidateQueries({ queryKey: queryKeys.parts.lists() })
    },
  })
}

export function useStockBalancesQuery(params: inventoryApi.ListStockBalancesParams) {
  return useQuery({
    queryKey: queryKeys.stockBalances.list(params),
    queryFn: ({ signal }) => inventoryApi.listStockBalances(params, signal),
    placeholderData: keepPreviousData,
  })
}

export function useStockReconciliationQuery(storeId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.stockBalances.reconciliation(storeId),
    queryFn: ({ signal }) => inventoryApi.getStockReconciliation(storeId, signal),
  })
}

export function useReplaceStockLevelsMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      storeId,
      partId,
      payload,
    }: {
      storeId: string
      partId: string
      payload: StockLevelsUpdateRequest
    }) => inventoryApi.replaceStockLevels(storeId, partId, payload),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.stockBalances.all }),
  })
}

export function useStockMovementsQuery(params: inventoryApi.ListStockMovementsParams) {
  return useQuery({
    queryKey: queryKeys.stockMovements.list(params),
    queryFn: ({ signal }) => inventoryApi.listStockMovements(params, signal),
    placeholderData: keepPreviousData,
  })
}

export function useStockAdjustmentsQuery(params: inventoryApi.ListStockAdjustmentsParams) {
  return useQuery({
    queryKey: queryKeys.stockAdjustments.list(params),
    queryFn: ({ signal }) => inventoryApi.listStockAdjustments(params, signal),
    placeholderData: keepPreviousData,
  })
}

export function useCreateStockAdjustmentMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: StockAdjustmentCreateRequest) =>
      inventoryApi.createStockAdjustment(payload, generateIdempotencyKey()),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.stockAdjustments.all }),
  })
}

export function useDecideStockAdjustmentMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ adjustmentId, payload }: { adjustmentId: string; payload: StockAdjustmentDecisionRequest }) =>
      inventoryApi.decideStockAdjustment(adjustmentId, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.stockAdjustments.all })
      void queryClient.invalidateQueries({ queryKey: queryKeys.stockBalances.all })
      void queryClient.invalidateQueries({ queryKey: queryKeys.stockMovements.all })
    },
  })
}
