import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as jobsApi from '../endpoints/jobs'
import { queryKeys } from '../queryKeys'
import type { JobAssignmentRequest, JobCardCreateRequest, JobCardUpdateRequest, JobTransitionRequest } from '../types'

export function useTechniciansQuery(params: jobsApi.ListTechniciansParams = {}) {
  return useQuery({
    queryKey: queryKeys.technicians.list(params),
    queryFn: ({ signal }) => jobsApi.listTechnicians(params, signal),
    placeholderData: keepPreviousData,
  })
}

export function useJobCardsQuery(params: jobsApi.ListJobCardsParams) {
  return useQuery({
    queryKey: queryKeys.jobs.list(params),
    queryFn: ({ signal }) => jobsApi.listJobCards(params, signal),
    placeholderData: keepPreviousData,
  })
}

export function useJobCardQuery(jobId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.jobs.detail(jobId ?? ''),
    queryFn: ({ signal }) => jobsApi.getJobCard(jobId as string, signal),
    enabled: Boolean(jobId),
  })
}

export function useCreateJobCardMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: JobCardCreateRequest) => jobsApi.createJobCard(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.jobs.lists() })
    },
  })
}

export function useUpdateJobCardMutation(jobId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: JobCardUpdateRequest) => jobsApi.updateJobCard(jobId, payload),
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKeys.jobs.detail(jobId), updated)
      void queryClient.invalidateQueries({ queryKey: queryKeys.jobs.lists() })
    },
  })
}

export function useAssignJobCardMutation(jobId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: JobAssignmentRequest) => jobsApi.assignJobCard(jobId, payload),
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKeys.jobs.detail(jobId), updated)
      void queryClient.invalidateQueries({ queryKey: queryKeys.jobs.lists() })
    },
  })
}

export function useTransitionJobCardMutation(jobId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: JobTransitionRequest) => jobsApi.transitionJobCard(jobId, payload),
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKeys.jobs.detail(jobId), updated)
      void queryClient.invalidateQueries({ queryKey: queryKeys.jobs.lists() })
      void queryClient.invalidateQueries({ queryKey: queryKeys.jobs.stageHistory(jobId, {}) })
    },
  })
}

export function useJobStageHistoryQuery(jobId: string | undefined, params: jobsApi.ListStageHistoryParams) {
  return useQuery({
    queryKey: queryKeys.jobs.stageHistory(jobId ?? '', params),
    queryFn: ({ signal }) => jobsApi.listJobStageHistory(jobId as string, params, signal),
    enabled: Boolean(jobId),
    placeholderData: keepPreviousData,
  })
}

export function useWorkItemsQuery(jobId: string | undefined, params: jobsApi.ListWorkItemsParams) {
  return useQuery({
    queryKey: queryKeys.jobs.workItems(jobId ?? '', params),
    queryFn: ({ signal }) => jobsApi.listWorkItems(jobId as string, params, signal),
    enabled: Boolean(jobId),
    placeholderData: keepPreviousData,
  })
}

export function useCreateWorkItemMutation(jobId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: Parameters<typeof jobsApi.createWorkItem>[1]) => jobsApi.createWorkItem(jobId, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [...queryKeys.jobs.detail(jobId), 'workItems'] })
    },
  })
}

export function useUpdateWorkItemMutation(jobId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      workItemId,
      payload,
    }: {
      workItemId: string
      payload: Parameters<typeof jobsApi.updateWorkItem>[2]
    }) => jobsApi.updateWorkItem(jobId, workItemId, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [...queryKeys.jobs.detail(jobId), 'workItems'] })
    },
  })
}

export function useJobInvoiceSummaryQuery(jobId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.jobs.invoiceSummary(jobId ?? ''),
    queryFn: ({ signal }) => jobsApi.getJobInvoiceSummary(jobId as string, signal),
    enabled: Boolean(jobId),
  })
}

export function useRegenerateJobInvoiceMutation(jobId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => jobsApi.regenerateJobInvoice(jobId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.jobs.invoiceSummary(jobId) })
    },
  })
}
