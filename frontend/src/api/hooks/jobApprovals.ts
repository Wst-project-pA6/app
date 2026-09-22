import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as jobApprovalsApi from '../endpoints/jobApprovals'
import { queryKeys } from '../queryKeys'
import type { JobApprovalCreateRequest, JobApprovalDecisionRequest, QualityCheckCreateRequest } from '../types'

export function useJobApprovalsQuery(jobId: string | undefined, params: jobApprovalsApi.ListJobApprovalsParams) {
  return useQuery({
    queryKey: queryKeys.jobs.approvals(jobId ?? '', params),
    queryFn: ({ signal }) => jobApprovalsApi.listJobApprovals(jobId as string, params, signal),
    enabled: Boolean(jobId),
    placeholderData: keepPreviousData,
  })
}

export function useCreateJobApprovalMutation(jobId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: JobApprovalCreateRequest) => jobApprovalsApi.createJobApproval(jobId, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [...queryKeys.jobs.detail(jobId), 'approvals'] })
      void queryClient.invalidateQueries({ queryKey: queryKeys.jobs.detail(jobId) })
    },
  })
}

export function useDecideJobApprovalMutation(jobId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ approvalId, payload }: { approvalId: string; payload: JobApprovalDecisionRequest }) =>
      jobApprovalsApi.decideJobApproval(jobId, approvalId, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [...queryKeys.jobs.detail(jobId), 'approvals'] })
      void queryClient.invalidateQueries({ queryKey: queryKeys.jobs.detail(jobId) })
    },
  })
}

export function useQualityChecksQuery(jobId: string | undefined, params: jobApprovalsApi.ListQualityChecksParams) {
  return useQuery({
    queryKey: queryKeys.jobs.qualityChecks(jobId ?? '', params),
    queryFn: ({ signal }) => jobApprovalsApi.listQualityChecks(jobId as string, params, signal),
    enabled: Boolean(jobId),
    placeholderData: keepPreviousData,
  })
}

export function useCreateQualityCheckMutation(jobId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: QualityCheckCreateRequest) => jobApprovalsApi.createQualityCheck(jobId, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [...queryKeys.jobs.detail(jobId), 'qualityChecks'] })
    },
  })
}
