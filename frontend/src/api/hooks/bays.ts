import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as baysApi from '../endpoints/bays'
import { queryKeys } from '../queryKeys'
import type { BayCreateRequest, BayUpdateRequest } from '../types'

export function useBaysQuery(params: baysApi.ListBaysParams) {
  return useQuery({
    queryKey: queryKeys.bays.list(params),
    queryFn: ({ signal }) => baysApi.listBays(params, signal),
    placeholderData: keepPreviousData,
  })
}

export function useCreateBayMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: BayCreateRequest) => baysApi.createBay(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.bays.lists() })
    },
  })
}

export function useUpdateBayMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ bayId, payload }: { bayId: string; payload: BayUpdateRequest }) => baysApi.updateBay(bayId, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.bays.lists() })
    },
  })
}

export function useBayCalendarQuery(bayId: string | undefined, from: string, to: string, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.bays.calendar(bayId ?? '', from, to),
    queryFn: ({ signal }) => baysApi.getBayCalendar(bayId as string, { from, to }, signal),
    enabled: Boolean(bayId) && enabled,
  })
}
