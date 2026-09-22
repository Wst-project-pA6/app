import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as jobPartsApi from '../endpoints/jobParts'
import { queryKeys } from '../queryKeys'
import { generateIdempotencyKey } from '@/lib/idempotencyKey'
import type { PartIssueCreateRequest, PartIssueReversalRequest, PartReservationCreateRequest } from '../types'

export function usePartIssuesQuery(jobId: string | undefined, params: jobPartsApi.ListPartIssuesParams) {
  return useQuery({
    queryKey: queryKeys.jobs.partIssues(jobId ?? '', params),
    queryFn: ({ signal }) => jobPartsApi.listPartIssues(jobId as string, params, signal),
    enabled: Boolean(jobId),
    placeholderData: keepPreviousData,
  })
}

function invalidateJobParts(queryClient: ReturnType<typeof useQueryClient>, jobId: string) {
  void queryClient.invalidateQueries({ queryKey: [...queryKeys.jobs.detail(jobId), 'partIssues'] })
  void queryClient.invalidateQueries({ queryKey: [...queryKeys.jobs.detail(jobId), 'partReservations'] })
  void queryClient.invalidateQueries({ queryKey: queryKeys.stockBalances.all })
  void queryClient.invalidateQueries({ queryKey: queryKeys.stockMovements.all })
}

export function useIssuePartMutation(jobId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: PartIssueCreateRequest) => jobPartsApi.issuePart(jobId, payload, generateIdempotencyKey()),
    onSuccess: () => invalidateJobParts(queryClient, jobId),
  })
}

export function useReversePartIssueMutation(jobId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ partIssueId, payload }: { partIssueId: string; payload: PartIssueReversalRequest }) =>
      jobPartsApi.reversePartIssue(jobId, partIssueId, payload, generateIdempotencyKey()),
    onSuccess: () => invalidateJobParts(queryClient, jobId),
  })
}

export function usePartReservationsQuery(jobId: string | undefined, params: jobPartsApi.ListPartReservationsParams) {
  return useQuery({
    queryKey: queryKeys.jobs.partReservations(jobId ?? '', params),
    queryFn: ({ signal }) => jobPartsApi.listPartReservations(jobId as string, params, signal),
    enabled: Boolean(jobId),
    placeholderData: keepPreviousData,
  })
}

export function useReservePartMutation(jobId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: PartReservationCreateRequest) =>
      jobPartsApi.reservePart(jobId, payload, generateIdempotencyKey()),
    onSuccess: () => invalidateJobParts(queryClient, jobId),
  })
}

export function useReleasePartReservationMutation(jobId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (reservationId: string) => jobPartsApi.releasePartReservation(jobId, reservationId),
    onSuccess: () => invalidateJobParts(queryClient, jobId),
  })
}
