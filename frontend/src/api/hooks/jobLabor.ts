import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as jobLaborApi from '../endpoints/jobLabor'
import { queryKeys } from '../queryKeys'
import type { LaborEntryCreateRequest, LaborEntryUpdateRequest, ReasonRequest } from '../types'

export function useLaborEntriesQuery(jobId: string | undefined, params: jobLaborApi.ListLaborEntriesParams) {
  return useQuery({
    queryKey: queryKeys.jobs.laborEntries(jobId ?? '', params),
    queryFn: ({ signal }) => jobLaborApi.listLaborEntries(jobId as string, params, signal),
    enabled: Boolean(jobId),
    placeholderData: keepPreviousData,
  })
}

function invalidateLabor(queryClient: ReturnType<typeof useQueryClient>, jobId: string) {
  void queryClient.invalidateQueries({ queryKey: [...queryKeys.jobs.detail(jobId), 'laborEntries'] })
}

export function useCreateLaborEntryMutation(jobId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: LaborEntryCreateRequest) => jobLaborApi.createLaborEntry(jobId, payload),
    onSuccess: () => invalidateLabor(queryClient, jobId),
  })
}

export function useUpdateLaborEntryMutation(jobId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ laborEntryId, payload }: { laborEntryId: string; payload: LaborEntryUpdateRequest }) =>
      jobLaborApi.updateLaborEntry(jobId, laborEntryId, payload),
    onSuccess: () => invalidateLabor(queryClient, jobId),
  })
}

export function useVoidLaborEntryMutation(jobId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ laborEntryId, payload }: { laborEntryId: string; payload: ReasonRequest }) =>
      jobLaborApi.voidLaborEntry(jobId, laborEntryId, payload),
    onSuccess: () => invalidateLabor(queryClient, jobId),
  })
}
